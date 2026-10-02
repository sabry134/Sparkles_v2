import { MongoClient } from 'mongodb';

export const COLLECTIONS = Object.freeze({
  guilds: 'guilds',
  warnings: 'warnings',
  moderationCases: 'moderation_cases',
  dashboardAudit: 'dashboard_audit',
  counters: 'counters',
  metadata: 'metadata',
});

const clients = new Map();

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} must be configured`);
  return normalized;
}

export async function connectMongo({ uri, dbName }) {
  const normalizedUri = required(uri, 'MONGODB_URI');
  const normalizedDbName = required(dbName, 'MONGODB_DB_NAME');
  const key = `${normalizedUri}\n${normalizedDbName}`;

  if (!clients.has(key)) {
    clients.set(
      key,
      (async () => {
        const client = new MongoClient(normalizedUri, {
          appName: 'Sparkles',
          maxPoolSize: 12,
          minPoolSize: 0,
          serverSelectionTimeoutMS: 10_000,
        });
        await client.connect();
        const db = client.db(normalizedDbName);
        await ensureMongoIndexes(db);
        return { client, db };
      })(),
    );
  }

  return clients.get(key);
}

export async function closeMongoConnections() {
  const connections = await Promise.allSettled([...clients.values()]);
  await Promise.allSettled(
    connections
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value.client.close()),
  );
  clients.clear();
}

export async function ensureMongoIndexes(db) {
  await Promise.all([
    db
      .collection(COLLECTIONS.warnings)
      .createIndex({ guildId: 1, userId: 1 }, { unique: true, name: 'guild_user' }),
    db
      .collection(COLLECTIONS.moderationCases)
      .createIndex({ guildId: 1, id: -1 }, { unique: true, name: 'guild_case' }),
    db
      .collection(COLLECTIONS.moderationCases)
      .createIndex({ guildId: 1, targetId: 1, id: -1 }, { name: 'guild_target_case' }),
    db
      .collection(COLLECTIONS.dashboardAudit)
      .createIndex({ guildId: 1, id: -1 }, { unique: true, name: 'guild_audit' }),
  ]);

  await db.collection(COLLECTIONS.metadata).updateOne(
    { _id: 'state' },
    { $setOnInsert: { revision: 0, createdAt: new Date() } },
    { upsert: true },
  );
}

export async function currentRevision(db) {
  const state = await db.collection(COLLECTIONS.metadata).findOne({ _id: 'state' });
  return Number.isSafeInteger(state?.revision) ? state.revision : 0;
}

export async function bumpRevision(db) {
  await db.collection(COLLECTIONS.metadata).updateOne(
    { _id: 'state' },
    {
      $inc: { revision: 1 },
      $set: { updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  return currentRevision(db);
}

export async function nextCounter(db, key) {
  const result = await db.collection(COLLECTIONS.counters).findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );
  const document =
    result?.value && typeof result.value === 'object' ? result.value : result;
  if (!Number.isSafeInteger(document?.value)) {
    throw new Error(`MongoDB counter ${key} did not return a valid value`);
  }
  return document.value;
}

export function withoutMongoId(document) {
  if (!document) return {};
  const { _id, ...value } = document;
  return structuredClone(value);
}

export function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export const DELETE_VALUE = Symbol('delete-value');

export function changesBetween(previous, current) {
  if (Object.is(previous, current)) return undefined;
  if (!isPlainObject(previous) || !isPlainObject(current)) {
    return structuredClone(current);
  }

  const changes = {};
  let changed = false;
  for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
    if (!Object.hasOwn(current, key)) {
      changes[key] = DELETE_VALUE;
      changed = true;
      continue;
    }

    const nested = changesBetween(previous[key], current[key]);
    if (nested !== undefined) {
      changes[key] = nested;
      changed = true;
    }
  }

  return changed ? changes : undefined;
}

export function applyChanges(target, changes) {
  if (changes === DELETE_VALUE) return undefined;
  if (!isPlainObject(changes)) return structuredClone(changes);

  const result = isPlainObject(target) ? structuredClone(target) : {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === DELETE_VALUE) delete result[key];
    else result[key] = applyChanges(result[key], value);
  }
  return result;
}

function collectMongoChanges(changes, prefix, sets, unsets) {
  if (changes === DELETE_VALUE) {
    if (prefix) unsets[prefix] = '';
    return;
  }

  if (!isPlainObject(changes)) {
    if (prefix) sets[prefix] = structuredClone(changes);
    return;
  }

  const entries = Object.entries(changes);
  if (!entries.length && prefix) {
    sets[prefix] = {};
    return;
  }

  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    collectMongoChanges(value, path, sets, unsets);
  }
}

export function mongoUpdateFromChanges(changes) {
  const sets = {};
  const unsets = {};
  collectMongoChanges(changes, '', sets, unsets);

  const update = {};
  if (Object.keys(sets).length) update.$set = sets;
  if (Object.keys(unsets).length) update.$unset = unsets;
  return update;
}
