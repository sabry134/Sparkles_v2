import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { PlatformStore, TABLES, clean, collectionFor } from '../../src/platform/store.js';
import { DiscordPlatform, compileMessage, hasPermission } from '../../src/platform/discord.js';
import { platformConfig as limits } from '../../src/platform/config.js';
import { evaluate, safeRegex } from '../../src/platform/evaluate.js';
import { platformTranslate } from '../../shared/platform-copy.js';
import { FEATURES, CAPABILITIES, PlatformError, ensure, id, resourceId, revision, onlyKeys, validateResource, configurationDiff, plainObject, validMessage } from '../../shared/platform-schema.js';
import { DISCORD_LIMITS } from '../../shared/discord-limits.js';
import { COLLECTIONS } from '../../src/mongodb.js';
import { catalog } from '../../src/catalog.js';

const asyncRoute = handler => (request, response, next) => Promise.resolve(handler(request, response)).catch(next);
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
function queryText(value) { ensure(value === undefined || (typeof value === 'string' && value.length <= limits.maximumSearchLength)); return value ?? ''; }
function pageQuery(request) {
  const query = queryText(request.query.q);
  const limit = request.query.limit === undefined ? limits.pageSize : Number(request.query.limit);
  ensure(Number.isSafeInteger(limit) && limit > 0 && limit <= limits.maximumPageSize);
  const cursor = request.query.cursor;
  ensure(cursor === undefined || (typeof cursor === 'string' && cursor.length <= limits.maximumCursorLength));
  return { query, limit, cursor };
}
function actor(request) { return request.session.user.id; }
function guild(request) { return id(request.params.guildId, 'guildId'); }
function kind(request) { ensure(Object.hasOwn(FEATURES, request.params.kind), 'NOT_FOUND', 404); return request.params.kind; }

export function createPlatformApi(config, { store = new PlatformStore({ uri: config.mongo.uri, dbName: config.mongo.dbName }), discord, botStore } = {}) {
  const gateway = discord ?? new DiscordPlatform({ token: config.discord.botToken, clientId: config.discord.clientId, store });
  const router = express.Router({ mergeParams: true });
  const authorize = (request, capability, options) => gateway.authorize(guild(request), actor(request), capability, options);
  const resourceAccess = (request) => authorize(request, FEATURES[kind(request)].capability);

  router.get('/bootstrap', asyncRoute(async (request, response) => {
    const context = await gateway.context(guild(request));
    const access = await gateway.capabilities(guild(request), actor(request), context);
    ensure(
      access.capabilities.length,
      'DASHBOARD_FORBIDDEN',
      403,
      [
        {
          code: 'no_dashboard_access',
          guildId: guild(request),
          currentCapabilities: access.capabilities,
        },
      ],
    );
    response.json({ resources: gateway.publicResources({ ...context, actor: access }), limits, features: Object.keys(FEATURES).filter(key => access.capabilities.includes(FEATURES[key].capability)) });
  }));
  router.get('/overview', asyncRoute(async (request, response) => {
    await authorize(request, 'view_analytics');
    const to = request.query.to ? Date.parse(request.query.to) : Date.now();
    const from = request.query.from ? Date.parse(request.query.from) : to - limits.defaultRangeDays * 86400000;
    ensure(Number.isFinite(to) && Number.isFinite(from) && from < to && to - from <= limits.eventRetentionDays * 86400000);
    response.json(await store.overview(guild(request), from, to));
  }));
  router.get('/health', asyncRoute(async (request, response) => {
    const context = await authorize(request, 'view_analytics', { fresh: true });
    const resources = gateway.publicResources(context);
    const issues = [];
    const channels = new Set(resources.channels.map(channel => channel.id));
    const roles = new Map(resources.roles.map(role => [role.id, role]));
    const scan = (value, path, item) => {
      if (typeof value === 'string' && value) {
        if (/channelId$/iu.test(path) && !channels.has(value)) issues.push({ code: 'deleted_channel', path, objectId: value, ...item });
        if (/roleId$/iu.test(path) && !roles.has(value)) issues.push({ code: 'deleted_role', path, objectId: value, ...item });
        else if (/roleId$/iu.test(path) && !roles.get(value)?.assignable) issues.push({ code: 'role_hierarchy', path, objectId: value, ...item });
        if (/categoryId$/iu.test(path) && !resources.categories.some(category => category.id === value)) issues.push({ code: 'deleted_category', path, objectId: value, ...item });
      } else if (value && typeof value === 'object') for (const [key, nested] of Object.entries(value)) scan(nested, `${path}.${key}`, item);
    };
    const db = await store.database();
    const settings = await db.collection(COLLECTIONS.guilds).findOne({ _id: guild(request) });
    scan(settings ?? {}, 'settings', { page: 'modules' });
    if (settings?.actionLog?.enabled && !settings.actionLog.channelId) issues.push({ code: 'missing_log_channel', page: 'moderation' });
    for (const channel of resources.channels) if (!channel.canSend) issues.push({ code: 'channel_permission', objectId: channel.id, name: channel.name, page: 'messages' });
    const published = {};
    for (const [name, feature] of Object.entries(FEATURES)) {
      if (!context.actor.capabilities.includes(feature.capability)) continue;
      const entries = await db.collection(collectionFor(name)).find({ guildId: guild(request) }).limit(limits.maximumResourcesPerKind).toArray();
      published[name] = entries;
      for (const entry of entries) {
        scan(entry.draft, 'draft', { kind: name, resourceId: entry._id, name: entry.draft.name });
        if (entry.live?.enabled && ['workflows', 'automod-rules'].includes(name) && !entry.live.snapshot.config.actions?.length) issues.push({ code: 'no_actions', kind: name, resourceId: entry._id, name: entry.draft.name });
        if (entry.live?.enabled && feature.publish === 'message' && !entry.live.snapshot.channelId) issues.push({ code: 'destination_missing', kind: name, resourceId: entry._id, name: entry.draft.name });
      }
    }
    for (const permission of ['ManageMessages', 'ManageRoles', 'ModerateMembers', 'ManageChannels']) if (!hasPermission(context.permissions, P[permission])) issues.push({ code: 'bot_permission', permission, page: permission === 'ManageRoles' ? 'roles' : 'moderation' });
    const automod = published['automod-rules']?.filter(entry => entry.live?.enabled) ?? [];
    for (const [index, entry] of automod.entries()) if (automod.slice(index + 1).some(other => other.live.snapshot.config.trigger === entry.live.snapshot.config.trigger && other.live.snapshot.config.pattern === entry.live.snapshot.config.pattern)) issues.push({ code: 'overlapping_rules', kind: entry.kind, resourceId: entry._id, name: entry.draft.name });
    response.json({ issues, checkedAt: new Date().toISOString() });
  }));
  router.get('/resources/:kind', asyncRoute(async (request, response) => {
    await resourceAccess(request); response.json(await store.list(guild(request), kind(request), pageQuery(request)));
  }));
  router.get('/resources/:kind/:resourceId', asyncRoute(async (request, response) => {
    await resourceAccess(request); response.json({ resource: clean(await store.find(guild(request), kind(request), resourceId(request.params.resourceId))) });
  }));
  router.post('/resources/:kind', asyncRoute(async (request, response) => {
    await resourceAccess(request);
    const value = validateResource(kind(request), request.body, limits);
    response.status(201).json({ resource: await store.save(guild(request), kind(request), value, actor(request)) });
  }));
  router.put('/resources/:kind/:resourceId', asyncRoute(async (request, response) => {
    await resourceAccess(request); onlyKeys(request.body, ['revision', 'value']);
    response.json({ resource: await store.save(guild(request), kind(request), validateResource(kind(request), request.body.value, limits), actor(request), resourceId(request.params.resourceId), revision(request.body.revision)) });
  }));
  router.get('/resources/:kind/:resourceId/history', asyncRoute(async (request, response) => {
    await resourceAccess(request);
    await store.find(guild(request), kind(request), resourceId(request.params.resourceId));
    if (request.query.cursor) revision(Number(request.query.cursor));
    response.json(await store.history(guild(request), request.params.resourceId, request.query.cursor));
  }));
  router.get('/resources/:kind/:resourceId/runs', asyncRoute(async (request, response) => {
    await resourceAccess(request);
    await store.find(guild(request), kind(request), resourceId(request.params.resourceId));
    response.json(await store.rows(guild(request), 'jobs', { ...pageQuery(request), resourceId: request.params.resourceId }));
  }));
  router.get('/threads', asyncRoute(async (request, response) => {
    const access = await gateway.capabilities(guild(request), actor(request));
    ensure(
      access.capabilities.includes('publish_messages'),
      'DASHBOARD_FORBIDDEN',
      403,
      [
        {
          code: 'missing_capability',
          capability: 'publish_messages',
          currentCapabilities: access.capabilities,
        },
      ],
    );
    const channelId = id(request.query.channelId, 'channelId');
    await gateway.destination(guild(request), channelId, { actorId: actor(request), fresh: false });
    const result = await gateway.request('GET', `/guilds/${guild(request)}/threads/active`);
    response.json({ items: result.threads.filter(thread => thread.parent_id === channelId && thread.type !== 12 && !thread.thread_metadata?.archived && !thread.thread_metadata?.locked).map(thread => ({ id: thread.id, name: thread.name })) });
  }));
  router.post('/resources/:kind/:resourceId/rollback', asyncRoute(async (request, response) => {
    await resourceAccess(request); onlyKeys(request.body, ['revision', 'targetRevision']);
    const version = await store.version(guild(request), resourceId(request.params.resourceId), revision(request.body.targetRevision));
    ensure(version.kind === kind(request));
    response.json({ resource: await store.save(guild(request), kind(request), validateResource(kind(request), version.snapshot, limits), actor(request), request.params.resourceId, revision(request.body.revision)) });
  }));
  router.post('/resources/:kind/:resourceId/simulate', asyncRoute(async (request, response) => {
    await resourceAccess(request); onlyKeys(request.body, ['context']);
    const doc = await store.find(guild(request), kind(request), resourceId(request.params.resourceId));
    ensure(['commands', 'workflows', 'automod-rules'].includes(doc.kind));
    const context = request.body.context;
    onlyKeys(context, ['content', 'event', 'userId', 'username', 'roleIds', 'channelId', 'categoryId', 'accountAgeDays', 'membershipAgeDays', 'warnings', 'hour', 'weekday', 'isBot', 'isWebhook', 'isAdministrator', 'attachmentCount', 'recentMessageCount', 'duplicateCount', 'commandName']);
    ensure(JSON.stringify(context).length <= limits.maximumImportBytes);
    for (const [key, value] of Object.entries(context)) ensure(typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (key === 'roleIds' && Array.isArray(value) && value.every(item => typeof item === 'string')));
    response.json(await evaluate(doc, context));
  }));
  router.post('/resources/:kind/:resourceId/preview', asyncRoute(async (request, response) => {
    await resourceAccess(request); onlyKeys(request.body, ['action', 'revision']);
    const action = request.body.action;
    ensure(['publish', 'republish', 'unpublish', 'pause', 'test'].includes(action));
    const doc = await store.find(guild(request), kind(request), resourceId(request.params.resourceId));
    ensure(doc.revision === revision(request.body.revision), 'REVISION_CONFLICT', 409);
    ensure(!doc.pendingJobId, 'RESOURCE_BUSY', 409);
    let message = null;
    if (['publish', 'republish', 'test'].includes(action)) {
      await gateway.validate(doc.kind, doc.draft, guild(request), actor(request));
      if (doc.kind === 'commands') {
        ensure(!catalog.some(command => command.name === doc.draft.config.pattern) || doc.draft.config.trigger !== 'slash', 'COMMAND_CONFLICT', 409);
        validMessage(doc.draft.message);
      }
      if (doc.kind === 'feeds') validMessage(doc.draft.message);
      if (doc.kind === 'automod-rules') {
        const config = doc.draft.config;
        if (['contains', 'regex', 'username'].includes(config.trigger)) ensure(config.pattern.trim(), 'RULE_PATTERN_REQUIRED');
        if (!['contains', 'regex', 'username', 'invite'].includes(config.trigger)) ensure(config.threshold > 0, 'RULE_THRESHOLD_REQUIRED');
        if (['spam', 'duplicate'].includes(config.trigger)) ensure(config.windowSeconds >= limits.minimumIntervalSeconds, 'INVALID_INTERVAL');
        if (['regex', 'username'].includes(config.trigger)) await safeRegex(config.pattern, '');
      }
      if (doc.kind === 'workflows' && doc.draft.config.trigger === 'interval') ensure(doc.draft.config.intervalSeconds >= limits.minimumIntervalSeconds, 'INVALID_INTERVAL');
      if (doc.draft.config.endAt) ensure(Date.parse(doc.draft.config.endAt) > Date.now() && (!doc.draft.config.startAt || Date.parse(doc.draft.config.endAt) > Date.parse(doc.draft.config.startAt)), 'INVALID_SCHEDULE');
      if (doc.draft.config.formId) { const form = await store.find(guild(request), 'forms', doc.draft.config.formId); ensure(form.live?.enabled, 'FORM_UNAVAILABLE'); }
      if (FEATURES[doc.kind].publish === 'message') message = compileMessage(doc, platformTranslate);
      else ensure(action === 'publish', 'INVALID_ACTION');
    }
    if (['unpublish', 'pause'].includes(action)) ensure(doc.live, 'NOT_PUBLISHED', 409);
    const references = doc.publication?.references ?? [];
    if (action === 'publish' && references.length) ensure(references.at(-1).channelId === doc.draft.channelId, 'DESTINATION_CHANGED', 409);
    const impact = { action, kind: doc.kind, name: doc.draft.name, resourceId: doc._id, revision: doc.revision, channelId: doc.draft.channelId, message,
      references, runAt: doc.draft.config.startAt || null, changes: configurationDiff(doc.live?.snapshot ?? {}, doc.draft),
      roleIds: [doc.draft.config.acceptanceRoleId, ...(doc.draft.config.choices ?? []).map(choice => choice.roleId)].filter(Boolean) };
    response.json(await store.preview(guild(request), actor(request), 'resource', { kind: doc.kind, resourceId: doc._id, revision: doc.revision, action }, impact));
  }));
  router.post('/execute', asyncRoute(async (request, response) => {
    onlyKeys(request.body, ['token']); resourceId(request.body.token, 'token');
    const preview = await (await store.database()).collection(TABLES.previews).findOne({ _id: request.body.token, guildId: guild(request), actorId: actor(request) });
    ensure(preview?.payload?.kind && Object.hasOwn(FEATURES, preview.payload.kind), 'PREVIEW_EXPIRED', 409);
    await authorize(request, FEATURES[preview.payload.kind].capability, { fresh: true });
    if (['publish', 'republish', 'test', 'unpublish'].includes(preview.payload.action) && FEATURES[preview.payload.kind].publish === 'message') await authorize(request, 'publish_messages');
    response.status(202).json({ job: await store.enqueue(guild(request), actor(request), request.body.token) });
  }));
  router.get('/records/:table', asyncRoute(async (request, response) => {
    const table = request.params.table;
    const permission = { jobs: 'view_audit', events: 'view_audit', executions: 'view_audit', tickets: 'manage_tickets', submissions: 'manage_community', acceptances: 'manage_rules' }[table];
    ensure(permission, 'NOT_FOUND', 404); await authorize(request, permission);
    if (request.query.resourceId) resourceId(request.query.resourceId);
    if (request.query.userId) id(request.query.userId, 'userId');
    response.json(await store.rows(guild(request), table, { ...pageQuery(request), resourceId: request.query.resourceId, userId: request.query.userId, status: queryText(request.query.status) || undefined }));
  }));
  router.post('/jobs/:jobId/cancel', asyncRoute(async (request, response) => {
    const job = await (await store.database()).collection(TABLES.jobs).findOne({ _id: resourceId(request.params.jobId), guildId: guild(request) });
    ensure(job, 'NOT_FOUND', 404);
    await authorize(request, FEATURES[job.kind]?.capability ?? (job.action === 'ticket' ? 'manage_tickets' : 'moderate_members'), { fresh: true });
    await store.cancelJob(guild(request), job._id, actor(request)); response.status(204).end();
  }));
  router.post('/jobs/:jobId/resolve', asyncRoute(async (request, response) => {
    onlyKeys(request.body, ['messageId', 'note']);
    const db = await store.database();
    const job = await db.collection(TABLES.jobs).findOne({ _id: resourceId(request.params.jobId), guildId: guild(request) });
    ensure(job?.status === 'needs_review', 'JOB_NOT_REVIEWABLE', 409);
    await authorize(request, FEATURES[job.kind]?.capability ?? 'moderate_members', { fresh: true });
    ensure(typeof request.body.note === 'string' && request.body.note.trim() && request.body.note.length <= limits.maximumTextLength);
    // Resolution acknowledges an uncertain outcome; it never replays the original action.
    if (request.body.messageId) {
      ensure(['publish', 'republish'].includes(job.action) && FEATURES[job.kind]?.publish === 'message', 'INVALID_ACTION');
      await authorize(request, 'publish_messages', { fresh: true });
      id(request.body.messageId, 'messageId'); ensure(job.snapshot?.channelId, 'INVALID_INPUT');
      const message = await gateway.request('GET', `/channels/${job.snapshot.channelId}/messages/${request.body.messageId}`);
      ensure(message.author?.id === config.discord.clientId, 'MESSAGE_NOT_OWNED', 409);
      ensure(String(message.nonce) === createHash('sha256').update(job._id).digest('hex').slice(0, 24), 'RECOVERY_MESSAGE_MISMATCH', 409);
      await gateway.destination(guild(request), job.snapshot.channelId, { actorId: actor(request) });
    }
    await store.transaction(async (database, session) => {
      await database.collection(TABLES.jobs).updateOne({ _id: job._id, guildId: guild(request), status: 'needs_review' }, { $set: { status: 'reviewed', reviewedBy: actor(request), reviewNote: request.body.note, recoveredMessageId: request.body.messageId || null } }, { session });
      if (FEATURES[job.kind]) {
        const patch = request.body.messageId ? { $set: { publication: { references: [{ channelId: job.snapshot.channelId, messageId: request.body.messageId }], revision: job.revision, at: new Date().toISOString() }, live: { enabled: true, snapshot: job.snapshot, revision: job.revision, actorId: job.actorId, publishedAt: new Date().toISOString() } } } : {};
        await database.collection(collectionFor(job.kind)).updateOne({ _id: job.resourceId, guildId: guild(request), pendingJobId: job._id }, { ...patch, $unset: { pendingJobId: '' } }, { session });
      }
      await store.record(database, session, guild(request), 'job_reviewed', actor(request), { jobId: job._id, note: request.body.note });
    });
    response.status(204).end();
  }));
  router.get('/members', asyncRoute(async (request, response) => {
    await authorize(request, 'moderate_members');
    const query = queryText(request.query.q); ensure(query.length > 0);
    let members;
    if (/^\d{17,20}$/u.test(query)) members = [await gateway.member(guild(request), query)];
    else members = await gateway.request('GET', `/guilds/${guild(request)}/members/search?query=${encodeURIComponent(query)}&limit=${limits.pageSize}`);
    response.json({ items: members.map(member => ({ id: member.user.id, name: member.nick ?? member.user.global_name ?? member.user.username, username: member.user.username, roles: member.roles, joinedAt: member.joined_at })) });
  }));
  router.get('/members/:userId', asyncRoute(async (request, response) => {
    await authorize(request, 'moderate_members');
    const userId = id(request.params.userId, 'userId');
    let member = null;
    try { member = await gateway.member(guild(request), userId); } catch (error) { if (error.code !== 'DISCORD_OBJECT_DELETED') throw error; }
    const db = await store.database();
    const [cases, warnings, tickets, acceptances] = await Promise.all([
      db.collection(COLLECTIONS.moderationCases).find({ guildId: guild(request), targetId: userId }).sort({ id: -1 }).limit(limits.pageSize).toArray(),
      db.collection(COLLECTIONS.warnings).findOne({ guildId: guild(request), userId }),
      db.collection(TABLES.tickets).find({ guildId: guild(request), userId }).sort({ at: -1 }).limit(limits.pageSize).toArray(),
      db.collection(TABLES.acceptances).find({ guildId: guild(request), userId }).limit(limits.pageSize).toArray(),
    ]);
    response.json({ member: { id: userId, name: member?.nick ?? member?.user.global_name ?? member?.user.username ?? userId, roles: member?.roles ?? [], joinedAt: member?.joined_at ?? null,
      accountCreatedAt: new Date(Number((BigInt(userId) >> 22n) + 1420070400000n)).toISOString(), timeoutUntil: member?.communication_disabled_until ?? null }, cases: cases.map(clean), warnings: warnings?.entries ?? [], tickets: tickets.map(clean), acceptances: acceptances.map(clean) });
  }));
  router.get('/cases', asyncRoute(async (request, response) => {
    await authorize(request, 'moderate_members');
    const { query, cursor, limit } = pageQuery(request);
    const filter = { guildId: guild(request) };
    if (cursor) { revision(Number(cursor)); filter.id = { $lt: Number(cursor) }; }
    if (request.query.userId) filter.targetId = id(request.query.userId, 'userId');
    if (query) filter.$or = ['targetId', 'actorId', 'reason', 'action'].map(key => ({ [key]: { $regex: escaped(query), $options: 'i' } }));
    const items = await (await store.database()).collection(COLLECTIONS.moderationCases).find(filter).sort({ id: -1 }).limit(limit + 1).toArray();
    response.json({ items: items.slice(0, limit).map(item => ({ ...item, _id: undefined })), nextCursor: items.length > limit ? items[limit - 1].id : null });
  }));
  router.post('/moderation/preview', asyncRoute(async (request, response) => {
    const context = await authorize(request, 'moderate_members', { fresh: true });
    onlyKeys(request.body, ['type', 'targetIds', 'reason', 'durationSeconds', 'points', 'evidence']);
    const input = request.body;
    const permission = { warn: P.ModerateMembers, note: P.ModerateMembers, timeout: P.ModerateMembers, untimeout: P.ModerateMembers, kick: P.KickMembers, ban: P.BanMembers, unban: P.BanMembers }[input.type];
    ensure(permission && hasPermission(context.permissions, permission) && hasPermission(context.actor.permissions, permission), 'ACTION_PERMISSION', 403);
    ensure(Array.isArray(input.targetIds) && input.targetIds.length > 0 && input.targetIds.length <= limits.maximumModerationTargets);
    input.targetIds = [...new Set(input.targetIds.map(id))];
    ensure(typeof input.reason === 'string' && input.reason.trim() && input.reason.length <= limits.maximumDescriptionLength);
    if (input.durationSeconds !== undefined) ensure(Number.isSafeInteger(input.durationSeconds) && input.durationSeconds >= 0 && input.durationSeconds <= (input.type === 'timeout' ? DISCORD_LIMITS.timeoutSeconds : limits.maximumDelaySeconds));
    if (input.type === 'timeout') ensure(input.durationSeconds > 0);
    if (input.type === 'warn') ensure(Number.isSafeInteger(input.points) && input.points > 0 && input.points <= limits.maximumPoints);
    if (input.evidence !== undefined) { onlyKeys(input.evidence, ['reference', 'content']); ensure(Object.values(input.evidence).every(value => typeof value === 'string' && value.length <= limits.maximumEvidenceLength)); }
    const targets = [];
    for (const userId of input.targetIds) {
      const member = input.type === 'unban' ? null : await gateway.manageableMember(guild(request), userId, actor(request), permission);
      targets.push({ id: userId, name: member?.user?.username ?? userId });
    }
    response.json(await store.preview(guild(request), actor(request), 'moderation', input, { ...input, targets, reversible: ['timeout', 'ban', 'warn'].includes(input.type) }));
  }));
  router.post('/moderation/execute', asyncRoute(async (request, response) => {
    await authorize(request, 'moderate_members', { fresh: true }); onlyKeys(request.body, ['token']); resourceId(request.body.token);
    const job = await store.consumePreview(guild(request), actor(request), request.body.token, 'moderation', async (db, session, preview) => store.queueJob({ guildId: guild(request), actorId: actor(request), action: 'moderate', input: preview.payload, dedupeKey: request.body.token }, { db, session }));
    response.status(202).json({ job });
  }));
  router.patch('/cases/:caseId', asyncRoute(async (request, response) => {
    await authorize(request, 'moderate_members'); onlyKeys(request.body, ['reason', 'note', 'evidence']);
    const patch = {};
    for (const key of ['reason', 'note']) if (request.body[key] !== undefined) { ensure(typeof request.body[key] === 'string' && request.body[key].trim() && request.body[key].length <= limits.maximumEvidenceLength); patch[key] = request.body[key]; }
    if (request.body.evidence) { onlyKeys(request.body.evidence, ['reference', 'content']); ensure(Object.values(request.body.evidence).every(value => typeof value === 'string' && value.length <= limits.maximumEvidenceLength)); patch.evidence = request.body.evidence; }
    const job = await store.queueJob({ guildId: guild(request), actorId: actor(request), action: 'case_update', input: { caseId: revision(Number(request.params.caseId)), patch } });
    response.status(202).json({ job });
  }));
  router.get('/tickets/:ticketId/transcript', asyncRoute(async (request, response) => {
    await authorize(request, 'view_transcripts'); id(request.params.ticketId, 'ticketId');
    const transcript = await (await store.database()).collection(TABLES.transcripts).findOne({ _id: request.params.ticketId, guildId: guild(request) });
    ensure(transcript, 'NOT_FOUND', 404); response.json({ transcript: clean(transcript) });
  }));
  router.post('/tickets/:ticketId/actions', asyncRoute(async (request, response) => {
    await authorize(request, 'manage_tickets', { fresh: true }); onlyKeys(request.body, ['action', 'text', 'priority']);
    ensure(['claim', 'close', 'reopen', 'note', 'priority'].includes(request.body.action));
    if (request.body.action === 'note') ensure(typeof request.body.text === 'string' && request.body.text.trim() && request.body.text.length <= limits.maximumTextLength);
    if (request.body.action === 'priority') ensure(['low', 'normal', 'high', 'urgent'].includes(request.body.priority));
    const ticket = await (await store.database()).collection(TABLES.tickets).findOne({ _id: id(request.params.ticketId, 'ticketId'), guildId: guild(request) }); ensure(ticket, 'NOT_FOUND', 404);
    response.status(202).json({ job: await store.queueJob({ guildId: guild(request), actorId: actor(request), action: 'ticket', input: { ...request.body, ticketId: ticket._id } }) });
  }));
  router.patch('/submissions/:submissionId', asyncRoute(async (request, response) => {
    await authorize(request, 'manage_community'); onlyKeys(request.body, ['status']); ensure(['pending', 'accepted', 'rejected', 'archived'].includes(request.body.status));
    await store.transaction(async (db, session) => {
      const result = await db.collection(TABLES.submissions).updateOne({ _id: id(request.params.submissionId, 'submissionId'), guildId: guild(request) }, { $set: { status: request.body.status, reviewedBy: actor(request), reviewedAt: new Date().toISOString() } }, { session });
      ensure(result.matchedCount, 'NOT_FOUND', 404); await store.record(db, session, guild(request), 'submission_reviewed', actor(request), { submissionId: request.params.submissionId, status: request.body.status });
    }); response.status(204).end();
  }));
  router.get('/access', asyncRoute(async (request, response) => {
    await authorize(request, 'manage_access'); response.json({ policy: clean(await (await store.database()).collection(TABLES.access).findOne({ _id: guild(request) })) ?? { grants: [], managerCapabilities: CAPABILITIES.filter(key => key !== 'manage_access') }, capabilities: CAPABILITIES.filter(key => key !== 'manage_access') });
  }));
  router.put('/access', asyncRoute(async (request, response) => {
    const context = await authorize(request, 'manage_access', { fresh: true }); onlyKeys(request.body, ['grants', 'managerCapabilities']);
    ensure(Array.isArray(request.body.grants) && request.body.grants.length <= limits.maximumPageSize);
    const allowed = list => ensure(Array.isArray(list) && list.length <= CAPABILITIES.length && list.every(key => CAPABILITIES.includes(key) && key !== 'manage_access'));
    allowed(request.body.managerCapabilities);
    for (const grant of request.body.grants) { onlyKeys(grant, ['userId', 'roleId', 'capabilities']); ensure(!!grant.userId !== !!grant.roleId); allowed(grant.capabilities);
      if (grant.userId) { id(grant.userId, 'grants.userId'); await gateway.member(guild(request), grant.userId); }
      if (grant.roleId) {
        id(grant.roleId, 'grants.roleId');
        ensure(
          context.roles.some(
            role => role.id === grant.roleId && role.id !== guild(request),
          ),
          'INVALID_ROLE',
          400,
          [
            {
              code: 'role',
              path: 'grants.roleId',
              roleId: grant.roleId,
              reason: 'not_found',
            },
          ],
        );
      }
    }
    await store.transaction(async (db, session) => {
      const before = await db.collection(TABLES.access).findOne({ _id: guild(request) }, { session });
      await db.collection(TABLES.access).updateOne({ _id: guild(request) }, { $set: { ...request.body, updatedBy: actor(request), updatedAt: new Date().toISOString() } }, { upsert: true, session });
      await store.record(db, session, guild(request), 'access_changed', actor(request), { changes: configurationDiff(before ? { grants: before.grants, managerCapabilities: before.managerCapabilities } : {}, request.body) });
    }); response.status(204).end();
  }));
  router.get('/search', asyncRoute(async (request, response) => {
    const context = await gateway.capabilities(guild(request), actor(request));
    ensure(
      context.capabilities.length,
      'DASHBOARD_FORBIDDEN',
      403,
      [
        {
          code: 'no_dashboard_access',
          guildId: guild(request),
          currentCapabilities: context.capabilities,
        },
      ],
    );
    const q = queryText(request.query.q); ensure(q.length > 0);
    const results = await Promise.all(Object.entries(FEATURES).filter(([, feature]) => context.capabilities.includes(feature.capability)).map(async ([kind]) => ({ kind, ...(await store.list(guild(request), kind, { query: q, limit: limits.pageSize })) })));
    response.json({ items: results.flatMap(result => result.items.map(item => ({ kind: result.kind, id: item.id, name: item.draft.name, revision: item.revision }))) });
  }));
  router.get('/blueprint', asyncRoute(async (request, response) => {
    const context = await authorize(request, 'manage_settings');
    const resources = [];
    for (const [kind, feature] of Object.entries(FEATURES)) if (context.actor.capabilities.includes(feature.capability)) {
      const rows = await (await store.database()).collection(collectionFor(kind)).find({ guildId: guild(request) }).limit(limits.maximumResourcesPerKind).toArray();
      resources.push(...rows.map(item => ({ sourceId: item._id, kind, value: item.draft })));
    }
    const metadata = gateway.publicResources(context);
    response.json({ format: 'sparkles-blueprint', version: 1, sourceGuildId: guild(request), resources, channels: metadata.channels.map(({ id, name }) => ({ id, name })), categories: metadata.categories, roles: metadata.roles.map(({ id, name }) => ({ id, name })) });
  }));
  router.post('/blueprint/preview', asyncRoute(async (request, response) => {
    const context = await authorize(request, 'manage_settings'); onlyKeys(request.body, ['blueprint', 'mapping', 'kinds']);
    const { blueprint, mapping, kinds } = request.body;
    ensure(plainObject(blueprint) && blueprint.format === 'sparkles-blueprint' && blueprint.version === 1 && Array.isArray(blueprint.resources) && blueprint.resources.length <= limits.maximumPageSize);
    ensure(plainObject(mapping) && Array.isArray(kinds) && kinds.every(kind => Object.hasOwn(FEATURES, kind)));
    for (const [oldId, newId] of Object.entries(mapping)) {
      id(oldId, `mapping.${oldId}.sourceId`);
      id(newId, `mapping.${oldId}.destinationId`);
    }
    const ids = new Map(blueprint.resources.map(item => [item.sourceId, randomUUID()]));
    const remap = (value, key = '') => {
      if (typeof value === 'string' && /^(?:\d{17,20})$/u.test(value) && /(?:Id|Ids)$/u.test(key)) { ensure(mapping[value], 'BLUEPRINT_MAPPING_REQUIRED', 400, [{ path: key, code: 'mapping', value }]); return mapping[value]; }
      if (key === 'formId' && value) { ensure(ids.has(value), 'BLUEPRINT_MAPPING_REQUIRED'); return ids.get(value); }
      if (Array.isArray(value)) return value.map(item => remap(item, key));
      if (plainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child, key)]));
      return value;
    };
    const items = [];
    for (const item of blueprint.resources.filter(item => kinds.includes(item.kind))) {
      ensure(
        context.actor.capabilities.includes(FEATURES[item.kind].capability),
        'DASHBOARD_FORBIDDEN',
        403,
        [
          {
            code: 'missing_capability',
            capability: FEATURES[item.kind].capability,
            currentCapabilities: context.actor.capabilities,
            resourceKind: item.kind,
          },
        ],
      );
      const value = validateResource(item.kind, remap(item.value), limits);
      // Imports create drafts only. Object mappings are still checked against this server.
      const destinationIds = [...context.channels.map(channel => channel.id), ...context.roles.map(role => role.id)];
      ensure(Object.values(mapping).every(id => destinationIds.includes(id)), 'BLUEPRINT_MAPPING_REQUIRED');
      items.push({ id: ids.get(item.sourceId), kind: item.kind, value });
    }
    ensure(items.length > 0);
    response.json(await store.preview(guild(request), actor(request), 'blueprint', { items }, { names: items.map(item => item.value.name), count: items.length, draftOnly: true }));
  }));
  router.post('/blueprint/import', asyncRoute(async (request, response) => {
    await authorize(request, 'manage_settings', { fresh: true }); onlyKeys(request.body, ['token']); resourceId(request.body.token);
    const preview = await (await store.database()).collection(TABLES.previews).findOne({ _id: request.body.token, guildId: guild(request), actorId: actor(request), operation: 'blueprint', expiresAt: { $gt: new Date() } });
    ensure(preview, 'PREVIEW_EXPIRED', 409);
    for (const item of preview.payload.items) await authorize(request, FEATURES[item.kind].capability);
    const imported = [];
    for (const item of preview.payload.items) {
      // Stable IDs make an interrupted import resumable without creating duplicate drafts.
      const existing = await (await store.database()).collection(collectionFor(item.kind)).findOne({ _id: item.id, guildId: guild(request) });
      imported.push(existing ? clean(existing) : await store.save(guild(request), item.kind, item.value, actor(request), item.id));
    }
    await (await store.database()).collection(TABLES.previews).deleteOne({ _id: request.body.token });
    response.status(201).json({ items: imported });
  }));

  return { router, store, gateway, ready: () => store.ready() };
}
