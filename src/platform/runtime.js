import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P, MessageFlags } from 'discord.js';
import { addModerationCase, addWarning, guildConfig, saveStore, syncStore, warningCount, updateModerationCase } from '../store.js';
import { PlatformStore, TABLES, collectionFor } from './store.js';
import { DiscordPlatform, compileMessage, hasPermission } from './discord.js';
import { platformConfig as limits } from './config.js';
import { FEATURES, PlatformError, ensure, validMessage } from '../../shared/platform-schema.js';
import { EMPTY_MESSAGE, renderMessage } from '../../shared/discord-limits.js';
import { evaluate } from './evaluate.js';
import { platformTranslate as t } from '../../shared/platform-copy.js';

const now = () => new Date().toISOString();
const contextVariables = context => ({
  user: context.userId ? `<@${context.userId}>` : '', 'user.id': context.userId ?? '', 'user.name': context.username ?? '',
  server: context.guildName ?? '', 'server.id': context.guildId ?? '', channel: context.channelId ? `<#${context.channelId}>` : '',
  'channel.id': context.channelId ?? '', 'member.count': context.memberCount ?? '', date: now(), ...(context.variables ?? {}),
});
const snapshotResource = (document) => ({ _id: document._id, kind: document.kind, revision: document.live.revision, draft: document.live.snapshot });

export class PlatformRuntime {
  constructor({ client, store = new PlatformStore(), discord, token = process.env.DISCORD_TOKEN, clientId = process.env.DISCORD_CLIENT_ID } = {}) {
    this.client = client; this.store = store;
    this.discord = discord ?? new DiscordPlatform({ token, clientId, store });
    this.workerId = randomUUID(); this.stopped = false; this.busy = false;
    this.liveCache = new Map(); this.token = token;
  }
  async start() {
    await this.store.ready();
    this.stopped = false;
    await this.tick();
    this.timer = setInterval(() => this.tick().catch(error => console.error('[platform-worker]', error.code ?? error.name)), limits.workerPollMs);
    this.timer.unref();
  }
  async stop() { this.stopped = true; clearInterval(this.timer); if (this.pendingTick) await this.pendingTick; }
  async tick() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    this.pendingTick = (async () => {
      const db = await this.store.database();
      await db.collection(TABLES.health).updateOne({ _id: 'gateway' }, { $set: { at: now(), workerId: this.workerId } }, { upsert: true });
      for (let index = 0; index < limits.workerBatchSize && !this.stopped; index += 1) {
        const job = await this.store.claim(this.workerId);
        if (!job) break;
        const pulse = setInterval(() => Promise.all([
          db.collection(TABLES.jobs).updateOne({ _id: job._id, status: 'running', workerId: this.workerId }, { $set: { leaseUntil: new Date(Date.now() + limits.workerLeaseMs) } }),
          db.collection(TABLES.health).updateOne({ _id: 'gateway' }, { $set: { at: now(), workerId: this.workerId } }),
        ]).catch(error => console.error('[platform-heartbeat]', error.code ?? error.name)), limits.workerHeartbeatMs);
        pulse.unref();
        try { await this.runJob(job); }
        catch (error) {
          const current = await db.collection(TABLES.jobs).findOne({ _id: job._id });
          const uncertain = error.uncertain ?? current?.steps?.some(step => step?.state === 'started' || step?.state === 'completed');
          await this.store.fail(job, error, uncertain === true);
          console.error('[platform-job]', { id: job._id, code: error.code ?? error.name });
        } finally { clearInterval(pulse); }
      }
    })().finally(() => { this.busy = false; });
    return this.pendingTick;
  }
  async active(guildId, kind) {
    const key = `${guildId}:${kind}`;
    if (this.liveCache.get(key)?.until > Date.now()) return this.liveCache.get(key).items;
    const items = await (await this.store.database()).collection(collectionFor(kind)).find({ guildId, 'live.enabled': true }).limit(limits.maximumResourcesPerKind).toArray();
    this.liveCache.set(key, { items, until: Date.now() + limits.metadataCacheMs });
    return items;
  }
  async runJob(job) {
    if (job.action === 'moderate') {
      await this.discord.authorize(job.guildId, job.actorId, 'moderate_members', { fresh: true });
      const results = [];
      for (const [index, targetId] of job.input.targetIds.entries()) {
        await this.store.checkpoint(job, index, 'started');
        results.push(await this.moderate(job.guildId, targetId, job.actorId, job.input, { source: 'dashboard', jobId: job._id }));
        await this.store.checkpoint(job, index, 'completed', { caseId: results.at(-1).id });
      }
      await this.store.finish(job, { cases: results.map(item => item.id) }); return;
    }
    if (job.action === 'case_update') {
      await this.discord.authorize(job.guildId, job.actorId, 'moderate_members', { fresh: true });
      await syncStore();
      const updated = updateModerationCase(job.guildId, job.input.caseId, current => ({ ...current, ...job.input.patch, updatedAt: now(), updatedBy: job.actorId }));
      ensure(updated, 'NOT_FOUND', 404); await saveStore();
      await this.store.finish(job, { caseId: updated.id }); return;
    }
    if (job.action === 'expire_role' || job.action === 'expire_ban') {
      await this.store.checkpoint(job, 0, 'started');
      if (job.action === 'expire_role') {
        const assignment = await (await this.store.database()).collection(TABLES.temporaryRoles).findOne({ guildId: job.guildId, userId: job.userId, roleId: job.roleId });
        if (assignment?.token !== job.assignmentToken) { await this.store.finish(job, { skipped: 'ROLE_ASSIGNMENT_REPLACED' }); return; }
        await this.discord.manageableRole(job.guildId, job.roleId);
        await this.discord.request('DELETE', `/guilds/${job.guildId}/members/${job.userId}/roles/${job.roleId}`);
        await (await this.store.database()).collection(TABLES.temporaryRoles).deleteOne({ guildId: job.guildId, userId: job.userId, roleId: job.roleId, token: job.assignmentToken });
      } else {
        const state = await this.discord.context(job.guildId, { fresh: true });
        ensure(hasPermission(state.permissions, P.BanMembers), 'BOT_MISSING_PERMISSION', 409);
        await this.discord.request('DELETE', `/guilds/${job.guildId}/bans/${job.userId}`);
      }
      await this.store.finish(job, {}); return;
    }
    if (job.action === 'ticket') { await this.ticketAction(job); return; }
    if (job.action === 'ticket_auto_close') { await this.ticketAutoClose(job); return; }
    const document = await this.store.find(job.guildId, job.kind, job.resourceId);
    if (job.automatic || ['workflow', 'feed', 'close_giveaway', 'close_poll'].includes(job.action)) {
      if (!document.live?.enabled || document.live.revision !== job.revision) { await this.store.finish(job, { skipped: 'VERSION_INACTIVE' }); return; }
    }
    if (job.action === 'workflow') { await this.workflowJob(job, document); return; }
    if (job.action === 'feed') { await this.feedJob(job, document); return; }
    if (job.action === 'close_giveaway' || job.action === 'close_poll') { await this.closeCommunity(job, document); return; }
    const context = await this.discord.authorize(job.guildId, job.actorId, FEATURES[job.kind].capability, { fresh: true });
    if (job.action === 'pause') {
      await this.store.finish(job, {}, { 'live.enabled': false }); this.liveCache.clear(); return;
    }
    if (job.action === 'unpublish') {
      const references = document.publication?.references ?? [];
      for (const [index, reference] of references.entries()) {
        await this.store.checkpoint(job, index, 'started');
        await this.discord.deleteMessage(job.guildId, reference, job.actorId);
        await this.store.checkpoint(job, index, 'completed');
      }
      if (document.publication?.commandId) await this.discord.request('DELETE', `/applications/${this.discord.clientId}/guilds/${job.guildId}/commands/${document.publication.commandId}`);
      await this.store.finish(job, {}, { live: { ...document.live, enabled: false }, publication: null }); this.liveCache.clear(); return;
    }
    await this.discord.validate(job.kind, job.snapshot, job.guildId, job.actorId);
    const live = { revision: job.revision, snapshot: job.snapshot, enabled: true, publishedAt: now(), actorId: job.actorId };
    if (FEATURES[job.kind].publish === 'runtime') {
      let publication = document.publication ?? {};
      if (job.kind === 'commands' && job.snapshot.config.trigger === 'slash') {
        const definitions = await this.discord.request('GET', `/applications/${this.discord.clientId}/guilds/${job.guildId}/commands`);
        ensure(!definitions.some(command => command.name === job.snapshot.config.pattern && command.id !== publication.commandId), 'COMMAND_CONFLICT', 409);
        const types = { text: 3, integer: 4, boolean: 5, user: 6, channel: 7, role: 8, number: 10 };
        await this.store.checkpoint(job, 0, 'started');
        const command = await this.discord.request('POST', `/applications/${this.discord.clientId}/guilds/${job.guildId}/commands`, {
          name: job.snapshot.config.pattern, description: job.snapshot.config.description, type: 1, dm_permission: false,
          options: job.snapshot.config.options.map(option => ({ ...option, type: types[option.type] })).sort((a, b) => Number(b.required) - Number(a.required)),
        });
        publication = { ...publication, commandId: command.id };
        await this.store.checkpoint(job, 0, 'completed', { commandId: command.id });
      } else if (publication.commandId) {
        await this.discord.request('DELETE', `/applications/${this.discord.clientId}/guilds/${job.guildId}/commands/${publication.commandId}`);
        publication = {};
      }
      const nextJobs = [];
      if (job.kind === 'workflows' && job.snapshot.config.trigger === 'interval') nextJobs.push(this.nextJob(job, 'workflow', { context: { guildId: job.guildId, guildName: context.guild.name, event: 'interval' } }));
      if (job.kind === 'feeds') nextJobs.push(this.nextJob(job, 'feed'));
      await this.store.finish(job, {}, { live, publication }, nextJobs);
      this.liveCache.clear();
      return;
    }
    const message = compileMessage({ _id: job.resourceId, kind: job.kind, revision: job.revision, draft: job.snapshot }, t, { server: context.guild.name, 'server.id': job.guildId, 'member.count': context.guild.approximate_member_count ?? '' });
    const previous = document.publication?.references?.at(-1);
    if (previous && job.action === 'publish') ensure(previous.channelId === job.snapshot.channelId, 'DESTINATION_CHANGED', 409);
    await this.store.checkpoint(job, 0, 'started');
    const reference = await this.discord.send(job.guildId, job.snapshot.channelId, message, { actorId: job.actorId, nonce: job._id,
      messageId: job.action === 'publish' ? previous?.messageId : undefined });
    await this.store.checkpoint(job, 0, 'completed', reference);
    if (job.action === 'test') { await this.store.finish(job, reference, {}); return; }
    const references = job.action === 'republish' ? [...(document.publication?.references ?? []), reference] : [reference];
    const nextJobs = [];
    if (['giveaways', 'polls'].includes(job.kind)) nextJobs.push({ guildId: job.guildId, actorId: job.actorId, kind: job.kind, resourceId: job.resourceId, revision: job.revision,
      snapshot: job.snapshot, action: job.kind === 'giveaways' ? 'close_giveaway' : 'close_poll', runAt: job.snapshot.config.endAt, dedupeKey: `${job.resourceId}:${job.revision}:end` });
    if (job.kind === 'messages' && job.snapshot.config.intervalSeconds) nextJobs.push(this.nextJob(job, 'republish'));
    await this.store.finish(job, reference, { live, publication: { references, at: now(), revision: job.revision } }, nextJobs);
    this.liveCache.clear();
  }
  nextJob(job, action, extra = {}) {
    const interval = job.snapshot.config.intervalSeconds;
    ensure(interval >= limits.minimumIntervalSeconds, 'INVALID_INTERVAL');
    const runAt = new Date(Date.now() + interval * 1000).toISOString();
    return { guildId: job.guildId, actorId: job.actorId, kind: job.kind, resourceId: job.resourceId, revision: job.revision,
      snapshot: job.snapshot, action, runAt, automatic: true, dedupeKey: `${job._id}:next`, ...extra };
  }
  async temporaryRole(guildId, userId, roleId, seconds, actorId, token) {
    const runAt = new Date(Date.now() + seconds * 1000).toISOString();
    await this.store.transaction(async (db, session) => {
      await db.collection(TABLES.temporaryRoles).updateOne({ guildId, userId, roleId }, { $set: { token, runAt, actorId } }, { upsert: true, session });
      await this.store.queueJob({ guildId, actorId, action: 'expire_role', userId, roleId, assignmentToken: token, runAt, dedupeKey: `${token}:expire-role` }, { db, session });
    });
  }
  async moderate(guildId, targetId, actorId, input, metadata = {}) {
    await syncStore();
    const permission = { ban: P.BanMembers, unban: P.BanMembers, kick: P.KickMembers, timeout: P.ModerateMembers, untimeout: P.ModerateMembers, warn: P.ModerateMembers, note: P.ModerateMembers }[input.type];
    ensure(permission, 'INVALID_ACTION');
    if (input.type !== 'unban') await this.discord.manageableMember(guildId, targetId, actorId, permission);
    else {
      const state = await this.discord.authorize(guildId, actorId, 'moderate_members', { fresh: true });
      ensure(hasPermission(state.permissions, permission) && hasPermission(state.actor.permissions, permission), 'ACTION_PERMISSION', 403);
    }
    const entry = addModerationCase(guildId, { action: input.type, targetId, actorId, reason: input.reason, duration: input.durationSeconds ? String(input.durationSeconds) : null,
      expiresAt: input.durationSeconds ? new Date(Date.now() + input.durationSeconds * 1000).toISOString() : null,
      evidence: input.evidence ?? null, points: input.points ?? null, status: 'pending', ...metadata });
    await saveStore();
    try {
      if (input.type === 'warn') { addWarning(guildId, targetId, { at: now(), reason: input.reason, moderatorId: actorId, caseId: entry.id, points: input.points }); await this.store.metric(guildId, 'warnings'); }
      if (input.type === 'timeout' || input.type === 'untimeout') await this.discord.request('PATCH', `/guilds/${guildId}/members/${targetId}`, { communication_disabled_until: input.type === 'untimeout' ? null : entry.expiresAt }, input.reason);
      if (input.type === 'kick') await this.discord.request('DELETE', `/guilds/${guildId}/members/${targetId}`, undefined, input.reason);
      if (input.type === 'ban') {
        await this.discord.request('PUT', `/guilds/${guildId}/bans/${targetId}`, { delete_message_seconds: 0 }, input.reason);
        if (input.durationSeconds) await this.store.queueJob({ guildId, actorId, action: 'expire_ban', userId: targetId, runAt: entry.expiresAt, dedupeKey: `${metadata.jobId ?? entry.id}:unban:${targetId}` });
      }
      if (input.type === 'unban') await this.discord.request('DELETE', `/guilds/${guildId}/bans/${targetId}`, undefined, input.reason);
      updateModerationCase(guildId, entry.id, current => ({ ...current, status: 'active' }));
      await saveStore();
      await this.store.event(guildId, 'moderation', actorId, { caseId: entry.id, userId: targetId, action: input.type });
      if (input.type === 'warn') await this.onEvent({ guildId, userId: targetId, event: 'warning', warnings: warningCount(guildId, targetId), eventId: `warning:${entry.id}` });
      return entry;
    } catch (error) {
      updateModerationCase(guildId, entry.id, current => ({ ...current, status: error.uncertain ? 'needs_review' : 'failed', error: error.code ?? 'EXECUTION_FAILED' }));
      await saveStore(); throw error;
    }
  }
  async enrich(context) {
    if (!context.userId) return context;
    try {
      const member = await this.discord.member(context.guildId, context.userId);
      return { ...context, username: member.nick ?? member.user.global_name ?? member.user.username, roleIds: member.roles,
        accountAgeDays: (Date.now() - Number((BigInt(context.userId) >> 22n) + 1420070400000n)) / 86400000,
        membershipAgeDays: (Date.now() - Date.parse(member.joined_at)) / 86400000, warnings: warningCount(context.guildId, context.userId), isBot: member.user.bot === true,
        hour: new Date().getUTCHours(), weekday: new Date().getUTCDay() };
    } catch (error) { if (context.event === 'member_leave') return context; throw error; }
  }
  async action(action, context, job, index) {
    const { guildId, userId } = context;
    const actorId = job.actorId;
    if (action.type === 'send_message') {
      const message = renderMessage(action.message, contextVariables(context));
      return this.discord.send(guildId, action.channelId, message, { actorId, nonce: `${job._id}:${index}` });
    }
    if (action.type === 'dm') {
      ensure(userId, 'MEMBER_REQUIRED');
      const channel = await this.discord.request('POST', '/users/@me/channels', { recipient_id: userId });
      const message = renderMessage(action.message, contextVariables(context)); validMessage(message);
      return this.discord.request('POST', `/channels/${channel.id}/messages`, { ...message, allowed_mentions: { parse: [] }, nonce: createHash('sha256').update(`${job._id}:${index}`).digest('hex').slice(0, 24), enforce_nonce: true });
    }
    if (action.type === 'add_role' || action.type === 'remove_role') {
      ensure(userId, 'MEMBER_REQUIRED');
      await this.discord.manageableRole(guildId, action.roleId, { actorId });
      await this.discord.request(action.type === 'add_role' ? 'PUT' : 'DELETE', `/guilds/${guildId}/members/${userId}/roles/${action.roleId}`);
      if (action.type === 'add_role' && action.durationSeconds) await this.temporaryRole(guildId, userId, action.roleId, action.durationSeconds, actorId, `${job._id}:${index}`);
      return {};
    }
    if (['warn', 'timeout', 'kick', 'ban'].includes(action.type)) return this.moderate(guildId, userId, actorId, action, { source: job.kind === 'automod-rules' ? 'automod' : 'workflow', jobId: job._id,
      evidence: { channelId: context.channelId, messageId: context.messageId, content: context.content?.slice(0, limits.maximumEvidenceLength) } });
    if (action.type === 'delete_message') {
      ensure(context.channelId && context.messageId, 'MESSAGE_REQUIRED');
      const state = await this.discord.authorize(guildId, actorId, 'manage_automod', { fresh: true });
      ensure(hasPermission(state.actor.permissions, P.ManageMessages), 'ACTION_PERMISSION', 403);
      const channel = await this.discord.request('GET', `/channels/${context.channelId}`); ensure(channel.guild_id === guildId, 'INVALID_CHANNEL');
      try { await this.discord.request('DELETE', `/channels/${context.channelId}/messages/${context.messageId}`); }
      catch (error) { if (error.code !== 'DISCORD_OBJECT_DELETED') throw error; }
      return {};
    }
    if (action.type === 'slowmode' || action.type === 'create_thread') {
      await this.discord.destination(guildId, action.channelId, { actorId });
      if (action.type === 'slowmode') {
        const state = await this.discord.capabilities(guildId, actorId); ensure(hasPermission(state.permissions, P.ManageChannels), 'ACTION_PERMISSION', 403);
        await this.discord.request('PATCH', `/channels/${action.channelId}`, { rate_limit_per_user: action.durationSeconds }); return {};
      }
      return this.discord.request('POST', `/channels/${action.channelId}/threads`, { name: action.name, type: 11 });
    }
    if (action.type === 'log') { await this.store.event(guildId, 'workflow_log', actorId, { resourceId: job.resourceId, text: action.text }); return {}; }
    throw new PlatformError('INVALID_ACTION');
  }
  async workflowJob(job, document) {
    await this.discord.authorize(job.guildId, job.actorId, FEATURES[job.kind].capability, { fresh: true });
    let context = await this.enrich(job.context);
    const verdict = await evaluate({ kind: job.kind, draft: job.snapshot }, context);
    if (!verdict.triggered) { await this.store.finish(job, { skipped: true, trace: verdict.trace }, null, document.kind === 'workflows' && job.snapshot.config.trigger === 'interval' ? [this.nextJob(job, 'workflow', { context: job.context })] : []); return; }
    const actions = job.actions ?? verdict.actions;
    for (let index = job.step ?? 0; index < actions.length; index += 1) {
      const action = actions[index];
      if (action.type === 'wait') {
        const continuation = { guildId: job.guildId, actorId: job.actorId, kind: job.kind, resourceId: job.resourceId, revision: job.revision, snapshot: job.snapshot,
          action: 'workflow', actions, context, step: index + 1, runAt: new Date(Date.now() + action.durationSeconds * 1000).toISOString(), dedupeKey: `${job._id}:wait:${index}` };
        await this.store.finish(job, { waiting: true, step: index }, null, [continuation]); return;
      }
      context = await this.enrich(context);
      await this.store.checkpoint(job, index, 'started');
      const result = await this.action(action, context, job, index);
      await this.store.checkpoint(job, index, 'completed', { messageId: result?.messageId ?? null, caseId: result?.id && Number.isSafeInteger(result.id) ? result.id : null });
    }
    await this.store.finish(job, { trace: verdict.trace }, null, document.kind === 'workflows' && job.snapshot.config.trigger === 'interval' ? [this.nextJob(job, 'workflow', { context: job.context })] : []);
  }
  async onMessage(message) {
    if (!message.guildId || message.author.id === this.client.user.id) return false;
    await this.store.metric(message.guildId, 'messages');
    const context = { event: 'message', eventId: message.id, guildId: message.guildId, guildName: message.guild.name, memberCount: message.guild.memberCount,
      channelId: message.channelId, categoryId: message.channel.parentId, messageId: message.id, content: message.content,
      userId: message.author.id, username: message.member?.displayName ?? message.author.username, roleIds: [...(message.member?.roles.cache.keys() ?? [])],
      isBot: message.author.bot, isWebhook: !!message.webhookId, isAdministrator: message.member?.permissions.has(P.Administrator) ?? false,
      accountAgeDays: (Date.now() - message.author.createdTimestamp) / 86400000,
      membershipAgeDays: message.member?.joinedTimestamp ? (Date.now() - message.member.joinedTimestamp) / 86400000 : null,
      attachmentCount: message.attachments.size, warnings: warningCount(message.guildId, message.author.id), hour: new Date().getUTCHours(), weekday: new Date().getUTCDay() };
    return this.onEvent(context);
  }
  async onEvent(context) {
    if (!context.guildId) return false;
    if (['member_join', 'member_leave'].includes(context.event)) await this.store.metric(context.guildId, context.event === 'member_join' ? 'joins' : 'leaves');
    if (context.event !== 'message') await this.store.event(context.guildId, context.event, context.userId, { userId: context.userId, channelId: context.channelId });
    let handled = false;
    const db = await this.store.database();
    for (const kind of ['automod-rules', 'workflows', 'commands']) {
      if (kind === 'commands' && context.event !== 'message') continue;
      const documents = await this.active(context.guildId, kind);
      documents.sort((a, b) => (a.live.snapshot.config.priority ?? 0) - (b.live.snapshot.config.priority ?? 0));
      for (const document of documents) {
        const resource = snapshotResource(document);
        const config = resource.draft.config;
        if (kind === 'commands' && config.trigger === 'slash') continue;
        if (kind === 'automod-rules' && ['spam', 'duplicate'].includes(config.trigger)) {
          const bucket = Math.floor(Date.now() / (config.windowSeconds * 1000));
          const hash = config.trigger === 'duplicate' ? createHash('sha256').update(context.content ?? '').digest('hex') : '';
          const counter = await db.collection(TABLES.cooldowns).findOneAndUpdate({ _id: `${document._id}:${context.userId}:${bucket}:${hash}` }, { $inc: { count: 1 }, $set: { expiresAt: new Date(Date.now() + config.windowSeconds * 1000) } }, { upsert: true, returnDocument: 'after' });
          context = { ...context, ...(config.trigger === 'spam' ? { recentMessageCount: counter.count } : { duplicateCount: counter.count }) };
        }
        const verdict = await evaluate(resource, context);
        if (!verdict.triggered) continue;
        if (!await this.store.cooldown(context.guildId, `${document._id}:${context.userId ?? context.eventId}`, config.cooldownSeconds)) continue;
        let actions = kind === 'commands' ? [{ type: 'send_message', channelId: context.channelId, message: resource.draft.message }] : verdict.actions;
        if (kind === 'automod-rules' && config.escalation?.length) {
          for (const level of [...config.escalation].sort((a, b) => a.violations - b.violations)) {
            const prior = await db.collection(TABLES.executions).countDocuments({ guildId: context.guildId, resourceId: document._id, userId: context.userId, at: { $gte: new Date(Date.now() - level.windowSeconds * 1000).toISOString() } });
            if (prior + 1 >= level.violations) actions = level.actions;
          }
        }
        const job = await this.store.queueJob({ guildId: context.guildId, actorId: document.live.actorId, kind, resourceId: document._id, revision: resource.revision, snapshot: resource.draft,
          action: 'workflow', context, actions, dedupeKey: `${document._id}:${resource.revision}:${context.eventId}` });
        if (!job) continue;
        await db.collection(TABLES.executions).insertOne({ _id: randomUUID(), guildId: context.guildId, resourceId: document._id, userId: context.userId, jobId: job.id, at: now(), trace: verdict.trace });
        if (kind === 'automod-rules') { await this.store.metric(context.guildId, 'automod'); handled ||= actions.some(action => action.type === 'delete_message'); }
        if (kind === 'commands') await this.store.metric(context.guildId, 'commands');
      }
    }
    return handled;
  }
  async feedJob(job, document) {
    await this.discord.validate(job.kind, job.snapshot, job.guildId, job.actorId);
    const repository = job.snapshot.config.repository;
    const response = await fetch(`https://api.github.com/repos/${repository}/releases`, { headers: { Accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(limits.workerHeartbeatMs) });
    ensure(response.ok, 'FEED_UNAVAILABLE', 409);
    const releases = await response.json();
    ensure(Array.isArray(releases), 'FEED_UNAVAILABLE', 409);
    const latest = releases.find(release => !release.draft && (job.snapshot.config.includePrereleases || !release.prerelease));
    if (latest && latest.id !== document.feedState?.releaseId) {
      const message = renderMessage(job.snapshot.message, { 'release.name': latest.name ?? latest.tag_name, 'release.tag': latest.tag_name, 'release.url': latest.html_url });
      await this.store.checkpoint(job, 0, 'started');
      const result = await this.discord.send(job.guildId, job.snapshot.channelId, message, { actorId: job.actorId, nonce: `${job.resourceId}:${latest.id}` });
      await this.store.checkpoint(job, 0, 'completed', result);
      await this.store.finish(job, result, { feedState: { releaseId: latest.id, lastSuccess: now() } }, [this.nextJob(job, 'feed')]);
    } else await this.store.finish(job, { noChange: true }, { 'feedState.lastSuccess': now() }, [this.nextJob(job, 'feed')]);
  }
  async eligible(config, interaction) {
    const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
    ensure((config.requiredRoleIds ?? []).every(id => member.roles.cache.has(id)), 'PANEL_INELIGIBLE', 403);
    ensure(!(config.forbiddenRoleIds ?? []).some(id => member.roles.cache.has(id)), 'PANEL_INELIGIBLE', 403);
    ensure((Date.now() - interaction.user.createdTimestamp) / 86400000 >= (config.minimumAccountAgeDays ?? 0), 'PANEL_INELIGIBLE', 403);
    ensure(member.joinedTimestamp && (Date.now() - member.joinedTimestamp) / 86400000 >= (config.minimumMembershipAgeDays ?? 0), 'PANEL_INELIGIBLE', 403);
    return member;
  }
  async interaction(interaction) {
    if (interaction.isChatInputCommand()) return this.slashCommand(interaction);
    if (!interaction.customId?.startsWith('sp:')) return false;
    if (!interaction.inGuild()) return false;
    try {
      const [, kind, resourceId, revisionText, action, suffix] = interaction.customId.split(':');
      const document = await this.store.find(interaction.guildId, kind, resourceId);
      ensure(document.live?.enabled && document.live.revision === Number(revisionText), 'PANEL_EXPIRED', 409);
      if (!interaction.isModalSubmit()) ensure(document.publication?.references?.some(reference => reference.messageId === interaction.message.id && reference.channelId === interaction.channelId), 'PANEL_EXPIRED', 409);
      const config = document.live.snapshot.config;
      const member = await this.eligible(config, interaction);
      const db = await this.store.database();
      if (kind === 'forms' && action === 'open') { await this.showForm(interaction, document); return true; }
      if (kind === 'ticket-panels' && action === 'open' && config.formId) {
        const form = await this.store.find(interaction.guildId, 'forms', config.formId); ensure(form.live?.enabled, 'FORM_UNAVAILABLE');
        await this.showForm(interaction, form, document); return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (kind === 'rules' && action === 'page') {
        const page = Number(interaction.values?.[0] ?? suffix);
        const message = compileMessage(snapshotResource(document), t, {}, page);
        message.components = [];
        await interaction.editReply(message); return true;
      }
      if (kind === 'rules' && action === 'accept') {
        await this.discord.manageableRole(interaction.guildId, config.acceptanceRoleId, { selfService: true });
        await member.roles.add(config.acceptanceRoleId);
        const entry = { guildId: interaction.guildId, resourceId, userId: interaction.user.id, revision: document.live.revision, at: now() };
        await db.collection(TABLES.acceptances).updateOne({ guildId: entry.guildId, resourceId, userId: entry.userId }, { $set: entry }, { upsert: true });
        await this.store.event(entry.guildId, 'rules_accepted', entry.userId, { resourceId, revision: entry.revision });
        if (config.logChannelId) await this.discord.send(entry.guildId, config.logChannelId, { ...structuredClone(EMPTY_MESSAGE), content: t('rules.acceptanceLog', { user: `<@${entry.userId}>`, name: document.live.snapshot.name, version: entry.revision }) }, { nonce: interaction.id });
        await this.onEvent({ guildId: entry.guildId, userId: entry.userId, event: 'rules_accepted', eventId: interaction.id, roleIds: [...member.roles.cache.keys()] });
        await interaction.editReply(t('rules.accepted', { name: document.live.snapshot.name, version: entry.revision })); return true;
      }
      if (kind === 'role-panels') {
        const selected = (interaction.values ?? [suffix]).map(value => config.choices[Number(value)]);
        ensure(selected.length && selected.every(Boolean), 'INVALID_ROLE');
        ensure(config.mode === 'multiple' || selected.length === 1, 'INVALID_ROLE');
        const changes = [];
        if (config.mode === 'unique') for (const choice of config.choices.filter(choice => !selected.includes(choice))) if (member.roles.cache.has(choice.roleId)) changes.push({ choice, add: false });
        for (const choice of selected) changes.push({ choice, add: config.mode !== 'remove' && (config.mode !== 'toggle' || !member.roles.cache.has(choice.roleId)) });
        for (const { choice } of changes) await this.discord.manageableRole(interaction.guildId, choice.roleId, { selfService: true });
        for (const { choice, add } of changes) {
          await member.roles[add ? 'add' : 'remove'](choice.roleId);
          if (add && config.durationSeconds) await this.temporaryRole(interaction.guildId, member.id, choice.roleId, config.durationSeconds, document.live.actorId, `${interaction.id}:${choice.roleId}`);
        }
        await this.store.event(interaction.guildId, 'self_roles_changed', member.id, { resourceId, roles: changes.map(({ choice, add }) => ({ roleId: choice.roleId, add })) });
        await interaction.editReply(t('roles.updated')); return true;
      }
      if (kind === 'giveaways' || kind === 'polls') {
        ensure(!document.publication?.closedAt && Date.now() < Date.parse(config.endAt), 'PANEL_EXPIRED', 409);
        const votes = kind === 'polls' ? [...new Set(interaction.values.map(value => Number(value)))] : [];
        ensure(votes.every(value => Number.isInteger(value) && config.choices?.[value]) && (kind !== 'polls' || (votes.length && (config.multiple || votes.length === 1))), 'INVALID_INPUT');
        const userId = config.anonymous ? createHmac('sha256', this.token).update(`${interaction.guildId}:${resourceId}:${member.id}`).digest('hex') : member.id;
        await db.collection(TABLES.entries).updateOne({ guildId: interaction.guildId, resourceId, userId }, { $set: { votes, at: now(), revision: document.live.revision } }, { upsert: true });
        await interaction.editReply(t(kind === 'polls' ? 'poll.voted' : 'giveaway.entered')); return true;
      }
      if (interaction.isModalSubmit() && (kind === 'forms' || kind === 'ticket-panels')) {
        const form = kind === 'forms' ? document : await this.store.find(interaction.guildId, 'forms', config.formId);
        ensure(form.live?.enabled, 'FORM_UNAVAILABLE');
        const answers = form.live.snapshot.config.fields.map((field, index) => ({ label: field.label, value: interaction.fields.getTextInputValue(String(index)).slice(0, limits.maximumTextLength) }));
        const submission = { _id: interaction.id, guildId: interaction.guildId, resourceId: form._id, userId: member.id, revision: form.live.revision, answers, at: now(), status: 'pending' };
        await db.collection(TABLES.submissions).insertOne(submission);
        if (form.live.snapshot.config.destinationChannelId) {
          const content = t('form.notification', { name: form.live.snapshot.name, answers: answers.map(answer => `${answer.label}: ${answer.value}`).join('\n') });
          await this.discord.send(interaction.guildId, form.live.snapshot.config.destinationChannelId, { ...structuredClone(EMPTY_MESSAGE), content }, { nonce: interaction.id });
        }
        if (kind === 'forms') { await interaction.editReply(t('form.received')); return true; }
      }
      if (kind === 'ticket-panels') {
        const ticket = await this.openTicket(interaction, document);
        await interaction.editReply(t('ticket.created', { channel: `<#${ticket.channelId}>` })); return true;
      }
      throw new PlatformError('INVALID_ACTION');
    } catch (error) {
      await this.store.event(interaction.guildId, 'interaction_failed', interaction.user.id, { error: error.code ?? 'EXECUTION_FAILED', customId: interaction.customId });
      const content = t(error.code === 'PANEL_EXPIRED' ? 'interaction.expired' : error.code === 'PANEL_INELIGIBLE' ? 'interaction.ineligible' : 'interaction.failed');
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return true;
    }
  }
  async showForm(interaction, form, ticketPanel) {
    const doc = ticketPanel ?? form;
    await interaction.showModal({ custom_id: `sp:${doc.kind}:${doc._id}:${doc.live.revision}:submit`, title: form.live.snapshot.config.title,
      components: form.live.snapshot.config.fields.map((field, index) => ({ type: 1, components: [{ type: 4, custom_id: String(index), label: field.label, style: field.type === 'paragraph' ? 2 : 1,
        required: field.required, max_length: limits.maximumTextLength, ...(field.placeholder ? { placeholder: field.placeholder } : {}) }] })) });
  }
  async slashCommand(interaction) {
    if (!interaction.guildId) return false;
    const document = (await this.active(interaction.guildId, 'commands')).find(entry => entry.publication?.commandId === interaction.commandId);
    if (!document) return false;
    await interaction.deferReply();
    try {
      const context = await this.enrich({ event: 'command', commandName: interaction.commandName, userId: interaction.user.id, guildId: interaction.guildId,
        guildName: interaction.guild.name, channelId: interaction.channelId, variables: Object.fromEntries(interaction.options.data.map(option => [`args.${option.name}`, String(option.value)])) });
      const verdict = await evaluate(snapshotResource(document), context);
      ensure(verdict.triggered && await this.store.cooldown(interaction.guildId, `${document._id}:${interaction.user.id}`, document.live.snapshot.config.cooldownSeconds), 'COMMAND_DENIED');
      const message = renderMessage(document.live.snapshot.message, contextVariables(context)); validMessage(message);
      await interaction.editReply(message);
      await this.store.metric(interaction.guildId, 'commands');
      await this.store.event(interaction.guildId, 'command_executed', interaction.user.id, { resourceId: document._id });
    } catch (error) {
      await interaction.editReply(t('interaction.failed'));
      await this.store.event(interaction.guildId, 'command_failed', interaction.user.id, { resourceId: document._id, error: error.code ?? 'EXECUTION_FAILED' });
    }
    return true;
  }
  async openTicket(interaction, document) {
    const config = document.live.snapshot.config;
    await this.discord.validate('ticket-panels', document.live.snapshot, interaction.guildId, document.live.actorId);
    const ticket = { _id: interaction.id, guildId: interaction.guildId, resourceId: document._id, userId: interaction.user.id, status: 'opening', at: now(), updatedAt: now(), supportRoleIds: config.supportRoleIds, transcriptChannelId: config.transcriptChannelId, notes: [] };
    await this.store.transaction(async (db, session) => {
      await db.collection(TABLES.cooldowns).updateOne({ _id: `tickets:${ticket.guildId}:${ticket.userId}` }, { $inc: { revision: 1 } }, { upsert: true, session });
      const count = await db.collection(TABLES.tickets).countDocuments({ guildId: ticket.guildId, userId: ticket.userId, status: { $in: ['opening', 'open', 'pending'] } }, { session });
      ensure(count < config.maximumTickets, 'TICKET_LIMIT', 409);
      await db.collection(TABLES.tickets).insertOne(ticket, { session });
    });
    const allow = String(P.ViewChannel | P.SendMessages | P.ReadMessageHistory | P.AttachFiles | P.EmbedLinks);
    try {
      const channel = await this.discord.request('POST', `/guilds/${ticket.guildId}/channels`, {
        name: config.nameFormat.replaceAll('{user}', interaction.user.username).replaceAll('{id}', ticket._id).slice(0, 100), type: 0, parent_id: config.categoryId,
        topic: `ticket:${ticket._id}`,
        permission_overwrites: [{ id: ticket.guildId, type: 0, deny: String(P.ViewChannel) }, { id: ticket.userId, type: 1, allow }, { id: this.discord.clientId, type: 1, allow: String(BigInt(allow) | P.ManageChannels) }, ...config.supportRoleIds.map(id => ({ id, type: 0, allow }))],
      });
      ticket.channelId = channel.id; ticket.status = 'open';
      await (await this.store.database()).collection(TABLES.tickets).updateOne({ _id: ticket._id }, { $set: { channelId: channel.id, status: 'open' } });
      await this.discord.send(ticket.guildId, channel.id, { ...structuredClone(EMPTY_MESSAGE), content: t('ticket.welcome', { user: `<@${ticket.userId}>` }) }, { nonce: ticket._id });
      await this.onEvent({ guildId: ticket.guildId, userId: ticket.userId, event: 'ticket_created', eventId: ticket._id, channelId: channel.id });
      return ticket;
    } catch (error) {
      await (await this.store.database()).collection(TABLES.tickets).updateOne({ _id: ticket._id }, { $set: { status: error.uncertain ? 'needs_review' : 'failed', error: error.code ?? 'EXECUTION_FAILED' } });
      throw error;
    }
  }
  async ticketAction(job) {
    await this.discord.authorize(job.guildId, job.actorId, 'manage_tickets', { fresh: true });
    const db = await this.store.database();
    const ticket = await db.collection(TABLES.tickets).findOne({ _id: job.input.ticketId, guildId: job.guildId }); ensure(ticket, 'NOT_FOUND', 404);
    const channel = await this.discord.request('GET', `/channels/${ticket.channelId}`); ensure(channel.guild_id === job.guildId, 'INVALID_CHANNEL');
    const action = job.input.action;
    const patch = { updatedAt: now() };
    if (action === 'claim') patch.assigneeId = job.actorId;
    if (action === 'note') patch.notes = [...ticket.notes, { actorId: job.actorId, text: job.input.text, at: now() }];
    if (action === 'priority') patch.priority = job.input.priority;
    if (action === 'close' || action === 'reopen') {
      await this.store.checkpoint(job, 0, 'started');
      if (action === 'close') {
        const messages = []; let before;
        for (let page = 0; page < limits.maximumHistory; page += 1) {
          const chunk = await this.discord.request('GET', `/channels/${ticket.channelId}/messages?limit=${limits.maximumPageSize}${before ? `&before=${before}` : ''}`);
          messages.push(...chunk.map(message => ({ id: message.id, authorId: message.author?.id, authorName: message.author?.username, content: message.content, at: message.timestamp, attachments: message.attachments?.map(file => ({ name: file.filename, url: file.url })) })));
          if (chunk.length < limits.maximumPageSize) break;
          before = chunk.at(-1).id;
        }
        await db.collection(TABLES.transcripts).updateOne({ _id: ticket._id, guildId: job.guildId }, { $set: { messages: messages.reverse(), at: now(), capped: messages.length >= limits.maximumHistory * limits.maximumPageSize } }, { upsert: true });
      }
      const overwrites = [...(channel.permission_overwrites ?? []).filter(item => item.id !== ticket.userId), { id: ticket.userId, type: 1,
        allow: String(P.ViewChannel | P.ReadMessageHistory | (action === 'reopen' ? P.SendMessages : 0n)), deny: action === 'close' ? String(P.SendMessages) : '0' }];
      await this.discord.request('PATCH', `/channels/${ticket.channelId}`, { permission_overwrites: overwrites });
      patch.status = action === 'close' ? 'closed' : 'open';
      await this.store.checkpoint(job, 0, 'completed');
      await this.onEvent({ guildId: ticket.guildId, userId: ticket.userId, event: action === 'close' ? 'ticket_closed' : 'ticket_created', eventId: job._id, channelId: ticket.channelId });
    }
    await db.collection(TABLES.tickets).updateOne({ _id: ticket._id, guildId: job.guildId }, { $set: patch });
    await this.store.finish(job, { ticketId: ticket._id, action });
  }
  async closeCommunity(job, document) {
    await this.discord.authorize(job.guildId, job.actorId, 'manage_community', { fresh: true });
    const db = await this.store.database();
    const config = job.snapshot.config;
    let results = document.publication?.results;
    if (!results || job.reroll) {
      const entries = await db.collection(TABLES.entries).find({ guildId: job.guildId, resourceId: job.resourceId }).toArray();
      if (job.kind === 'polls') results = { counts: config.choices.map((_, index) => entries.filter(entry => entry.votes.includes(index)).length), total: entries.length };
      else {
        const winners = [];
        while (entries.length && winners.length < config.winnerCount) {
          const [entry] = entries.splice(randomInt(entries.length), 1);
          try {
            const member = await this.discord.member(job.guildId, entry.userId);
            if ((config.requiredRoleIds ?? []).every(role => member.roles.includes(role)) && !(config.forbiddenRoleIds ?? []).some(role => member.roles.includes(role))) winners.push(entry.userId);
          } catch (error) { if (error.code !== 'DISCORD_OBJECT_DELETED') throw error; }
        }
        results = { winners };
      }
      await db.collection(collectionFor(job.kind)).updateOne({ _id: job.resourceId, guildId: job.guildId }, { $set: { 'publication.results': results } });
    }
    const content = job.kind === 'polls'
      ? t('poll.results', { question: config.question, results: config.choices.map((label, index) => `${label}: ${results.counts[index]}`).join('\n') })
      : t('giveaway.ended', { prize: config.prize, winners: results.winners.length ? results.winners.map(id => `<@${id}>`).join(', ') : t('giveaway.noWinners') });
    const reference = document.publication.references.at(-1);
    await this.store.checkpoint(job, 0, 'started');
    await this.discord.send(job.guildId, reference.channelId, { ...structuredClone(EMPTY_MESSAGE), content }, { actorId: job.actorId, messageId: reference.messageId });
    await this.store.finish(job, results, { 'publication.results': results, 'publication.closedAt': now() });
  }
}
