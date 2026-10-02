import {
  COLLECTIONS,
  DELETE_VALUE,
  applyChanges,
  bumpRevision,
  changesBetween,
  connectMongo,
  currentRevision,
  ensureMongoIndexes,
  isPlainObject,
  mongoUpdateFromChanges,
  withoutMongoId,
} from './mongodb.js';

let state = { guilds: {}, warnings: {}, moderationCases: {} };
let baselineState = structuredClone(state);
let writeQueue = Promise.resolve();
let lastRevision = -1;
let databaseOverride = null;
let databasePromise = null;

function mongoConfiguration() {
  return {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB_NAME ?? 'sparkles',
  };
}

async function database() {
  if (databaseOverride) {
    await ensureMongoIndexes(databaseOverride);
    return databaseOverride;
  }

  if (!databasePromise) {
    databasePromise = connectMongo(mongoConfiguration()).then(({ db }) => db);
  }
  return databasePromise;
}

export function setMongoDatabaseForTests(db) {
  databaseOverride = db;
  databasePromise = null;
  state = { guilds: {}, warnings: {}, moderationCases: {} };
  baselineState = structuredClone(state);
  writeQueue = Promise.resolve();
  lastRevision = -1;
}

export function storeBackendDescription() {
  return `MongoDB/${process.env.MONGODB_DB_NAME?.trim() || 'sparkles'}`;
}

async function readSnapshot(db) {
  const [guildDocuments, warningDocuments, caseDocuments] = await Promise.all([
    db.collection(COLLECTIONS.guilds).find({}).toArray(),
    db.collection(COLLECTIONS.warnings).find({}).toArray(),
    db
      .collection(COLLECTIONS.moderationCases)
      .find({})
      .sort({ guildId: 1, id: 1 })
      .toArray(),
  ]);

  const guilds = Object.fromEntries(
    guildDocuments.map((document) => [String(document._id), withoutMongoId(document)]),
  );

  const warnings = Object.fromEntries(
    warningDocuments.map((document) => [
      `${document.guildId}:${document.userId}`,
      Array.isArray(document.entries) ? structuredClone(document.entries) : [],
    ]),
  );

  const moderationCases = {};
  for (const document of caseDocuments) {
    const guildId = String(document.guildId);
    moderationCases[guildId] ??= [];
    const { _id, guildId: ignoredGuildId, ...entry } = document;
    moderationCases[guildId].push(structuredClone(entry));
  }

  return { guilds, warnings, moderationCases };
}

function parseWarningKey(key) {
  const separator = key.indexOf(':');
  if (separator === -1) throw new Error(`Invalid warning key: ${key}`);
  return {
    guildId: key.slice(0, separator),
    userId: key.slice(separator + 1),
  };
}

async function persistGuildChanges(db, changes) {
  if (!isPlainObject(changes)) return;

  for (const [guildId, guildChanges] of Object.entries(changes)) {
    if (guildChanges === DELETE_VALUE) {
      await db.collection(COLLECTIONS.guilds).deleteOne({ _id: guildId });
      continue;
    }

    const update = mongoUpdateFromChanges(guildChanges);
    if (!Object.keys(update).length) continue;
    await db
      .collection(COLLECTIONS.guilds)
      .updateOne({ _id: guildId }, update, { upsert: true });
  }
}

async function persistWarningChanges(db, changes) {
  if (!isPlainObject(changes)) return;

  for (const [key, entries] of Object.entries(changes)) {
    const { guildId, userId } = parseWarningKey(key);
    if (entries === DELETE_VALUE) {
      await db.collection(COLLECTIONS.warnings).deleteOne({ guildId, userId });
      continue;
    }

    await db.collection(COLLECTIONS.warnings).updateOne(
      { guildId, userId },
      {
        $set: {
          guildId,
          userId,
          entries: structuredClone(state.warnings[key] ?? []),
        },
      },
      { upsert: true },
    );
  }
}

async function persistModerationCaseChanges(db, changes) {
  if (!isPlainObject(changes)) return;

  for (const [guildId, casesChange] of Object.entries(changes)) {
    if (casesChange === DELETE_VALUE) {
      await db.collection(COLLECTIONS.moderationCases).deleteMany({ guildId });
      continue;
    }

    const cases = state.moderationCases[guildId] ?? [];
    if (!cases.length) continue;
    await db.collection(COLLECTIONS.moderationCases).bulkWrite(
      cases.map((entry) => ({
        replaceOne: {
          filter: { guildId, id: entry.id },
          replacement: {
            _id: `${guildId}:${entry.id}`,
            guildId,
            ...structuredClone(entry),
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
}

async function persistChanges(db, pendingChanges) {
  await persistGuildChanges(db, pendingChanges?.guilds);
  await persistWarningChanges(db, pendingChanges?.warnings);
  await persistModerationCaseChanges(db, pendingChanges?.moderationCases);
}

export async function loadStore() {
  const db = await database();
  const snapshot = await readSnapshot(db);
  state = snapshot;
  baselineState = structuredClone(snapshot);
  lastRevision = await currentRevision(db);
}

export async function syncStore() {
  const db = await database();
  const revision = await currentRevision(db);
  if (revision === lastRevision) return false;

  const externalState = await readSnapshot(db);
  const pendingChanges = changesBetween(baselineState, state);
  baselineState = structuredClone(externalState);
  state = pendingChanges ? applyChanges(externalState, pendingChanges) : externalState;
  lastRevision = revision;
  return true;
}

export function guildConfig(guildId) {
  if (!/^\d{17,20}$/.test(guildId)) {
    throw new TypeError('Invalid Discord guild ID');
  }
  state.guilds[guildId] ??= { tags: {} };
  return state.guilds[guildId];
}

export function guildIds() {
  return Object.keys(state.guilds);
}

export function warningCount(guildId, userId) {
  return state.warnings[`${guildId}:${userId}`]?.length ?? 0;
}

export function addWarning(guildId, userId, warning) {
  const key = `${guildId}:${userId}`;
  state.warnings[key] ??= [];
  state.warnings[key].push(warning);
  return state.warnings[key].length;
}

export function clearWarnings(guildId, userId) {
  delete state.warnings[`${guildId}:${userId}`];
}

export function addModerationCase(guildId, entry) {
  state.moderationCases[guildId] ??= [];
  const cases = state.moderationCases[guildId];
  const id = (cases.at(-1)?.id ?? 0) + 1;
  const moderationCase = {
    id,
    at: new Date().toISOString(),
    ...entry,
  };
  cases.push(moderationCase);
  if (cases.length > 2_000) cases.splice(0, cases.length - 2_000);
  return moderationCase;
}

export function moderationCases(guildId, userId = null) {
  const cases = state.moderationCases[guildId] ?? [];
  const filtered = userId
    ? cases.filter((entry) => entry.targetId === userId)
    : cases;
  return structuredClone(filtered);
}

export function saveStore() {
  writeQueue = writeQueue
    .catch((error) => {
      console.error('[store-write-recovery]', error);
    })
    .then(async () => {
      const pendingChanges = changesBetween(baselineState, state);
      if (!pendingChanges) return;

      const db = await database();
      await persistChanges(db, pendingChanges);
      lastRevision = await bumpRevision(db);

      const snapshot = await readSnapshot(db);
      state = snapshot;
      baselineState = structuredClone(snapshot);
    });

  return writeQueue;
}
