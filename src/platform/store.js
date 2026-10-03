import { createHash, randomUUID } from 'node:crypto';
import { connectMongo, COLLECTIONS } from '../mongodb.js';
import { FEATURES, PlatformError, ensure, configurationDiff } from '../../shared/platform-schema.js';
import { platformConfig as limits } from './config.js';

export const TABLES = Object.freeze({
  versions: 'platform_versions', jobs: 'platform_jobs', events: 'platform_events',
  executions: 'platform_executions', previews: 'platform_previews',
  acceptances: 'rules_acceptances', entries: 'community_entries', tickets: 'tickets',
  submissions: 'form_submissions', metrics: 'guild_metrics', access: 'dashboard_access',
  cooldowns: 'platform_cooldowns', health: 'platform_health', transcripts: 'ticket_transcripts',
  temporaryRoles: 'temporary_roles',
});
const collectionFor = kind => `platform_${kind.replaceAll('-', '_')}`;
export const clean = value => {
  if (!value) return null;
  const { _id, ...rest } = value;
  return { id: String(_id), ...rest };
};
const stamp = () => new Date().toISOString();
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const cursorFor = (document, field) => Buffer.from(JSON.stringify({ at: document[field], id: String(document._id) })).toString('base64url');
function cursorFilter(cursor, field) {
  if (!cursor) return {};
  ensure(typeof cursor === 'string' && cursor.length <= limits.maximumCursorLength && /^[A-Za-z0-9_-]+$/u.test(cursor));
  let decoded;
  try { decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { throw new PlatformError('INVALID_INPUT'); }
  ensure(typeof decoded?.at === 'string' && Number.isFinite(Date.parse(decoded.at)) && typeof decoded.id === 'string' && decoded.id.length <= limits.maximumCursorLength);
  return { $or: [{ [field]: { $lt: decoded.at } }, { [field]: decoded.at, _id: { $lt: decoded.id } }] };
}

export class PlatformStore {
  constructor({ database, transaction, uri, dbName } = {}) {
    this.databaseOverride = database;
    this.transactionOverride = transaction;
    this.connection = null;
    this.uri = uri; this.dbName = dbName;
  }
  async database() {
    if (this.databaseOverride) return this.databaseOverride;
    this.connection ??= connectMongo({ uri: this.uri ?? process.env.MONGODB_URI, dbName: this.dbName ?? process.env.MONGODB_DB_NAME ?? 'sparkles' });
    return (await this.connection).db;
  }
  async transaction(operation) {
    const db = await this.database();
    if (this.transactionOverride) return this.transactionOverride(() => operation(db, undefined));
    const client = (await this.connection).client;
    const session = client.startSession();
    try { return await session.withTransaction(() => operation(db, session)); }
    finally { await session.endSession(); }
  }
  async ready() {
    const db = await this.database();
    await Promise.all([
      ...Object.keys(FEATURES).map(kind => db.collection(collectionFor(kind)).createIndex({ guildId: 1, updatedAt: -1, _id: -1 })),
      db.collection(TABLES.versions).createIndex({ guildId: 1, resourceId: 1, revision: -1 }, { unique: true }),
      db.collection(TABLES.jobs).createIndex({ status: 1, runAt: 1 }),
      db.collection(TABLES.jobs).createIndex({ guildId: 1, resourceId: 1, createdAt: -1 }),
      db.collection(TABLES.jobs).createIndex({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }),
      db.collection(TABLES.events).createIndex({ guildId: 1, at: -1, _id: -1 }),
      db.collection(TABLES.events).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection(TABLES.previews).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection(TABLES.executions).createIndex({ guildId: 1, resourceId: 1, at: -1 }),
      db.collection(TABLES.entries).createIndex({ guildId: 1, resourceId: 1, userId: 1 }, { unique: true }),
      db.collection(TABLES.acceptances).createIndex({ guildId: 1, resourceId: 1, userId: 1 }, { unique: true }),
      db.collection(TABLES.tickets).createIndex({ guildId: 1, userId: 1, status: 1 }),
      db.collection(TABLES.submissions).createIndex({ guildId: 1, resourceId: 1, at: -1 }),
      db.collection(TABLES.metrics).createIndex({ guildId: 1, at: 1 }),
      db.collection(TABLES.cooldowns).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection(TABLES.temporaryRoles).createIndex({ guildId: 1, userId: 1, roleId: 1 }, { unique: true }),
    ]);
  }
  async find(guildId, kind, resourceId, { session } = {}) {
    ensure(Object.hasOwn(FEATURES, kind), 'NOT_FOUND', 404);
    const result = await (await this.database()).collection(collectionFor(kind)).findOne({ _id: resourceId, guildId }, { session });
    ensure(result, 'NOT_FOUND', 404);
    return result;
  }
  async list(guildId, kind, { query = '', cursor, limit = limits.pageSize, liveOnly = false } = {}) {
    ensure(Object.hasOwn(FEATURES, kind), 'NOT_FOUND', 404);
    const filter = { guildId };
    if (query) filter['draft.name'] = { $regex: escaped(query), $options: 'i' };
    if (cursor) Object.assign(filter, cursorFilter(cursor, 'updatedAt'));
    if (liveOnly) filter['live.enabled'] = true;
    const rows = await (await this.database()).collection(collectionFor(kind)).find(filter).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).toArray();
    return { items: rows.slice(0, limit).map(clean), nextCursor: rows.length > limit ? cursorFor(rows[limit - 1], 'updatedAt') : null };
  }
  async record(db, session, guildId, event, actorId, details = {}) {
    await db.collection(TABLES.events).insertOne({ _id: randomUUID(), guildId, event, actorId, at: stamp(), details,
      expiresAt: new Date(Date.now() + limits.eventRetentionDays * 86400000) }, { session });
  }
  async event(guildId, event, actorId, details) {
    return this.record(await this.database(), undefined, guildId, event, actorId, details);
  }
  async save(guildId, kind, value, actorId, resourceId = randomUUID(), expectedRevision = null) {
    return this.transaction(async (db, session) => {
      const collection = db.collection(collectionFor(kind));
      const previous = await collection.findOne({ _id: resourceId, guildId }, { session });
      ensure(previous ? previous.revision === expectedRevision : expectedRevision === null, 'REVISION_CONFLICT', 409);
      if (!previous) ensure(await collection.countDocuments({ guildId }, { session }) < limits.maximumResourcesPerKind, 'RESOURCE_LIMIT', 409);
      const revision = (previous?.revision ?? 0) + 1;
      const at = stamp();
      const document = { ...(previous ?? {}), _id: resourceId, guildId, kind, revision, draft: value,
        createdAt: previous?.createdAt ?? at, createdBy: previous?.createdBy ?? actorId, updatedAt: at, updatedBy: actorId };
      if (previous) {
        const result = await collection.replaceOne({ _id: resourceId, guildId, revision: expectedRevision }, document, { session });
        ensure(result.matchedCount, 'REVISION_CONFLICT', 409);
      } else await collection.insertOne(document, { session });
      const changes = configurationDiff(previous?.draft ?? {}, value);
      await db.collection(TABLES.versions).insertOne({ _id: randomUUID(), guildId, resourceId, kind, revision, snapshot: value, actorId, at, changes }, { session });
      await this.record(db, session, guildId, 'draft_saved', actorId, { kind, resourceId, revision, changes });
      return clean(document);
    });
  }
  async remove(guildId, kind, resourceId, actorId, expectedRevision) {
    ensure(Object.hasOwn(FEATURES, kind), 'NOT_FOUND', 404);
    return this.transaction(async (db, session) => {
      const collection = db.collection(collectionFor(kind));
      const resource = await collection.findOne(
        { _id: resourceId, guildId },
        { session },
      );
      ensure(resource, 'NOT_FOUND', 404);
      ensure(resource.revision === expectedRevision, 'REVISION_CONFLICT', 409);
      ensure(!resource.pendingJobId, 'RESOURCE_BUSY', 409);
      ensure(
        resource.live?.enabled !== true && !resource.publication,
        'RESOURCE_ACTIVE',
        409,
      );

      const deleted = await collection.deleteOne(
        { _id: resourceId, guildId, revision: expectedRevision },
        { session },
      );
      ensure(deleted.deletedCount === 1, 'REVISION_CONFLICT', 409);

      await db
        .collection(TABLES.versions)
        .deleteMany({ guildId, resourceId }, { session });
      await db.collection(TABLES.previews).deleteMany(
        {
          guildId,
          'payload.resourceId': resourceId,
        },
        { session },
      );
      await db.collection(TABLES.jobs).updateMany(
        {
          guildId,
          resourceId,
          status: 'queued',
        },
        {
          $set: {
            status: 'cancelled',
            finishedAt: stamp(),
            cancelledReason: 'RESOURCE_DELETED',
          },
        },
        { session },
      );

      await this.record(db, session, guildId, 'draft_deleted', actorId, {
        kind,
        resourceId,
        revision: expectedRevision,
        name: resource.draft?.name ?? null,
      });
    });
  }

  async version(guildId, resourceId, revision) {
    const result = await (await this.database()).collection(TABLES.versions).findOne({ guildId, resourceId, revision });
    ensure(result, 'NOT_FOUND', 404); return result;
  }
  async history(guildId, resourceId, cursor) {
    const filter = { guildId, resourceId, ...(cursor ? { revision: { $lt: Number(cursor) } } : {}) };
    const rows = await (await this.database()).collection(TABLES.versions).find(filter).sort({ revision: -1 }).limit(limits.pageSize + 1).toArray();
    return { items: rows.slice(0, limits.pageSize).map(clean), nextCursor: rows.length > limits.pageSize ? rows[limits.pageSize - 1].revision : null };
  }
  async preview(guildId, actorId, operation, payload, impact) {
    const token = randomUUID();
    await (await this.database()).collection(TABLES.previews).insertOne({ _id: token, guildId, actorId, operation, payload, impact, expiresAt: new Date(Date.now() + limits.previewLifetimeMs) });
    return { token, impact };
  }
  async consumePreview(guildId, actorId, token, operation, handler) {
    return this.transaction(async (db, session) => {
      const preview = await db.collection(TABLES.previews).findOne({ _id: token, guildId, actorId, operation, expiresAt: { $gt: new Date() } }, { session });
      ensure(preview, 'PREVIEW_EXPIRED', 409);
      const result = await handler(db, session, preview);
      await db.collection(TABLES.previews).deleteOne({ _id: token, guildId }, { session });
      return result;
    });
  }
  async enqueue(guildId, actorId, token) {
    return this.consumePreview(guildId, actorId, token, 'resource', async (db, session, preview) => {
      const { kind, resourceId, revision, action } = preview.payload;
      const resource = await db.collection(collectionFor(kind)).findOne({ _id: resourceId, guildId }, { session });
      ensure(resource?.revision === revision, 'REVISION_CONFLICT', 409);
      ensure(!resource.pendingJobId, 'RESOURCE_BUSY', 409);
      const job = { _id: randomUUID(), guildId, actorId, kind, resourceId, revision, action,
        snapshot: resource.draft, status: 'queued', runAt: action === 'publish' && resource.draft.config.startAt ? resource.draft.config.startAt : stamp(),
        createdAt: stamp(), steps: [], dedupeKey: token };
      await db.collection(TABLES.jobs).insertOne(job, { session });
      await db.collection(collectionFor(kind)).updateOne({ _id: resourceId, guildId, revision }, { $set: { pendingJobId: job._id } }, { session });
      await this.record(db, session, guildId, 'job_queued', actorId, { jobId: job._id, kind, resourceId, action });
      return clean(job);
    });
  }
  async queueJob(job, { db, session } = {}) {
    const database = db ?? await this.database();
    const document = { _id: randomUUID(), createdAt: stamp(), status: 'queued', runAt: stamp(), steps: [], ...job };
    try { await database.collection(TABLES.jobs).insertOne(document, { session }); }
    catch (error) { if (error.code === 11000) return null; throw error; }
    return clean(document);
  }
  async claim(workerId) {
    const db = await this.database();
    // A process may have sent a Discord request before losing its lease. Never replay it blindly.
    await db.collection(TABLES.jobs).updateMany({ status: 'running', leaseUntil: { $lt: new Date() } }, { $set: { status: 'needs_review', error: 'EXECUTION_UNCERTAIN', finishedAt: stamp() } });
    return db.collection(TABLES.jobs).findOneAndUpdate({ status: 'queued', runAt: { $lte: stamp() } },
      { $set: { status: 'running', workerId, startedAt: stamp(), leaseUntil: new Date(Date.now() + limits.workerLeaseMs) } },
      { sort: { runAt: 1 }, returnDocument: 'after' });
  }
  async checkpoint(job, index, state, result = {}) {
    const update = await (await this.database()).collection(TABLES.jobs).updateOne({ _id: job._id, status: 'running', workerId: job.workerId },
      { $set: { [`steps.${index}`]: { state, at: stamp(), ...result }, leaseUntil: new Date(Date.now() + limits.workerLeaseMs) } });
    ensure(update.matchedCount, 'JOB_LEASE_LOST', 409);
  }
  async finish(job, result, resourcePatch = null, nextJobs = []) {
    return this.transaction(async (db, session) => {
      const updated = await db.collection(TABLES.jobs).updateOne({ _id: job._id, status: 'running', workerId: job.workerId },
        { $set: { status: 'completed', result, finishedAt: stamp() }, $unset: { leaseUntil: '' } }, { session });
      ensure(updated.matchedCount, 'JOB_LEASE_LOST', 409);
      if (resourcePatch && Object.hasOwn(FEATURES, job.kind)) {
        await db.collection(collectionFor(job.kind)).updateOne({ _id: job.resourceId, guildId: job.guildId },
          { $set: resourcePatch }, { session });
        await db.collection(collectionFor(job.kind)).updateOne({ _id: job.resourceId, guildId: job.guildId, pendingJobId: job._id },
          { $unset: { pendingJobId: '' } }, { session });
      }
      for (const next of nextJobs) await this.queueJob(next, { db, session });
      await this.record(db, session, job.guildId, 'job_completed', job.actorId, { jobId: job._id, resourceId: job.resourceId, kind: job.kind, action: job.action });
    });
  }
  async fail(job, error, uncertain = false) {
    const code = error instanceof PlatformError ? error.code : 'EXECUTION_FAILED';
    const db = await this.database();
    await db.collection(TABLES.jobs).updateOne({ _id: job._id, status: 'running', workerId: job.workerId }, { $set: { status: uncertain ? 'needs_review' : 'failed', error: code, details: error.details ?? [], finishedAt: stamp() } });
    if (!uncertain && Object.hasOwn(FEATURES, job.kind)) await db.collection(collectionFor(job.kind)).updateOne({ _id: job.resourceId, guildId: job.guildId, pendingJobId: job._id }, { $unset: { pendingJobId: '' } });
    await this.event(job.guildId, 'job_failed', job.actorId, { jobId: job._id, resourceId: job.resourceId, error: code });
  }
  async cancelJob(guildId, jobId, actorId) {
    return this.transaction(async (db, session) => {
      const job = await db.collection(TABLES.jobs).findOne({ _id: jobId, guildId }, { session });
      ensure(job?.status === 'queued', 'JOB_NOT_CANCELLABLE', 409);
      const result = await db.collection(TABLES.jobs).updateOne({ _id: jobId, guildId, status: 'queued' }, { $set: { status: 'cancelled', finishedAt: stamp() } }, { session });
      ensure(result.matchedCount, 'JOB_NOT_CANCELLABLE', 409);
      if (Object.hasOwn(FEATURES, job.kind)) await db.collection(collectionFor(job.kind)).updateOne({ _id: job.resourceId, guildId, pendingJobId: jobId }, { $unset: { pendingJobId: '' } }, { session });
      await this.record(db, session, guildId, 'job_cancelled', actorId, { jobId });
    });
  }
  async rows(guildId, table, { resourceId, userId, status, query, cursor, limit = limits.pageSize } = {}) {
    ensure(Object.hasOwn(TABLES, table));
    const filter = { guildId, ...(resourceId ? { resourceId } : {}), ...(userId ? { userId } : {}), ...(status ? { status } : {}) };
    const field = table === 'jobs' ? 'createdAt' : 'at';
    if (cursor) Object.assign(filter, cursorFilter(cursor, field));
    if (query) filter.$and = [{ $or: ['event', 'actorId', 'userId', 'assigneeId', 'details.resourceId', 'details.error', 'error', 'action'].map(key => ({ [key]: { $regex: escaped(query), $options: 'i' } })) }];
    const rows = await (await this.database()).collection(TABLES[table]).find(filter).sort({ [field]: -1, _id: -1 }).limit(limit + 1).toArray();
    return { items: rows.slice(0, limit).map(clean), nextCursor: rows.length > limit ? cursorFor(rows[limit - 1], field) : null };
  }
  async cooldown(guildId, key, seconds) {
    if (!seconds) return true;
    const db = await this.database();
    const _id = createHash('sha256').update(`${guildId}:${key}`).digest('hex');
    await db.collection(TABLES.cooldowns).deleteOne({ _id, expiresAt: { $lte: new Date() } });
    try { await db.collection(TABLES.cooldowns).insertOne({ _id, guildId, expiresAt: new Date(Date.now() + seconds * 1000) }); return true; }
    catch (error) { if (error.code === 11000) return false; throw error; }
  }
  async metric(guildId, name, count = 1) {
    ensure(['messages', 'joins', 'leaves', 'automod', 'commands', 'warnings'].includes(name));
    const at = new Date(); at.setUTCMinutes(0, 0, 0);
    await (await this.database()).collection(TABLES.metrics).updateOne({ _id: `${guildId}:${at.toISOString()}` },
      { $setOnInsert: { guildId, at: at.toISOString() }, $inc: { [name]: count } }, { upsert: true });
  }
  async overview(guildId, from, to) {
    const db = await this.database();
    const start = new Date(from).toISOString(); const end = new Date(to).toISOString();
    const previousStart = new Date(Date.parse(start) - (Date.parse(end) - Date.parse(start))).toISOString();
    const [metrics, cases, jobs, tickets, activity, health] = await Promise.all([
      db.collection(TABLES.metrics).find({ guildId, at: { $gte: previousStart, $lte: end } }).sort({ at: 1 }).toArray(),
      db.collection(COLLECTIONS.moderationCases).countDocuments({ guildId, at: { $gte: start, $lte: end } }),
      db.collection(TABLES.jobs).aggregate([{ $match: { guildId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      db.collection(TABLES.tickets).countDocuments({ guildId, status: { $in: ['open', 'pending'] } }),
      db.collection(TABLES.events).find({ guildId, at: { $gte: start, $lte: end } }).sort({ at: -1 }).limit(limits.pageSize).toArray(),
      db.collection(TABLES.health).findOne({ _id: 'gateway' }),
    ]);
    const summarize = rows => Object.fromEntries(['messages', 'joins', 'leaves', 'automod', 'commands', 'warnings'].map(key => [key, rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)]));
    return { from: start, to: end, current: summarize(metrics.filter(row => row.at >= start)), previous: summarize(metrics.filter(row => row.at < start)), trend: metrics.filter(row => row.at >= start),
      cases, openTickets: tickets, jobs: Object.fromEntries(jobs.map(item => [item._id, item.count])), activity: activity.map(clean),
      worker: health ? { lastSeen: health.at, online: Date.now() - Date.parse(health.at) < limits.workerStaleMs } : { lastSeen: null, online: false } };
  }
}

export { collectionFor };
