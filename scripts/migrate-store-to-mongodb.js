import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  COLLECTIONS,
  bumpRevision,
  connectMongo,
  ensureMongoIndexes,
} from '../src/mongodb.js';

const sourcePath = path.resolve(
  process.argv.find((argument) => !argument.startsWith('--') && argument.endsWith('.json')) ??
    'data/store.json',
);
const replace = process.argv.includes('--replace');

function validRoot(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function warningParts(key) {
  const separator = key.indexOf(':');
  if (separator === -1) return null;
  return {
    guildId: key.slice(0, separator),
    userId: key.slice(separator + 1),
  };
}

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB_NAME?.trim() || 'sparkles';

if (!uri) {
  throw new Error('MONGODB_URI is missing from the root .env file');
}

const legacy = JSON.parse(await readFile(sourcePath, 'utf8'));
if (!validRoot(legacy)) {
  throw new Error('The legacy store must contain a JSON object');
}

const { db, client } = await connectMongo({ uri, dbName });
await ensureMongoIndexes(db);

try {
  if (replace) {
    await Promise.all([
      db.collection(COLLECTIONS.guilds).deleteMany({}),
      db.collection(COLLECTIONS.warnings).deleteMany({}),
      db.collection(COLLECTIONS.moderationCases).deleteMany({}),
      db.collection(COLLECTIONS.dashboardAudit).deleteMany({}),
      db.collection(COLLECTIONS.counters).deleteMany({}),
    ]);
  }

  const guildOperations = Object.entries(
    validRoot(legacy.guilds) ? legacy.guilds : {},
  ).map(([guildId, config]) => ({
    replaceOne: {
      filter: { _id: guildId },
      replacement: {
        _id: guildId,
        ...(validRoot(config) ? config : { tags: {} }),
      },
      upsert: true,
    },
  }));

  if (guildOperations.length) {
    await db.collection(COLLECTIONS.guilds).bulkWrite(guildOperations, {
      ordered: false,
    });
  }

  const warningOperations = Object.entries(
    validRoot(legacy.warnings) ? legacy.warnings : {},
  ).flatMap(([key, entries]) => {
    const ids = warningParts(key);
    if (!ids || !Array.isArray(entries)) return [];
    return [
      {
        replaceOne: {
          filter: ids,
          replacement: {
            _id: `${ids.guildId}:${ids.userId}`,
            ...ids,
            entries,
          },
          upsert: true,
        },
      },
    ];
  });

  if (warningOperations.length) {
    await db.collection(COLLECTIONS.warnings).bulkWrite(warningOperations, {
      ordered: false,
    });
  }

  const caseOperations = Object.entries(
    validRoot(legacy.moderationCases) ? legacy.moderationCases : {},
  ).flatMap(([guildId, entries]) =>
    Array.isArray(entries)
      ? entries
          .filter((entry) => validRoot(entry) && Number.isSafeInteger(entry.id))
          .map((entry) => ({
            replaceOne: {
              filter: { guildId, id: entry.id },
              replacement: {
                _id: `${guildId}:${entry.id}`,
                guildId,
                ...entry,
              },
              upsert: true,
            },
          }))
      : [],
  );

  if (caseOperations.length) {
    await db.collection(COLLECTIONS.moderationCases).bulkWrite(caseOperations, {
      ordered: false,
    });
  }

  const auditOperations = [];
  for (const [guildId, entries] of Object.entries(
    validRoot(legacy.dashboardAudit) ? legacy.dashboardAudit : {},
  )) {
    if (!Array.isArray(entries)) continue;
    let maximumId = 0;
    for (const entry of entries) {
      if (!validRoot(entry) || !Number.isSafeInteger(entry.id)) continue;
      maximumId = Math.max(maximumId, entry.id);
      auditOperations.push({
        replaceOne: {
          filter: { guildId, id: entry.id },
          replacement: {
            _id: `${guildId}:${entry.id}`,
            guildId,
            ...entry,
          },
          upsert: true,
        },
      });
    }

    if (maximumId > 0) {
      await db.collection(COLLECTIONS.counters).updateOne(
        { _id: `dashboardAudit:${guildId}` },
        { $max: { value: maximumId } },
        { upsert: true },
      );
    }
  }

  if (auditOperations.length) {
    await db.collection(COLLECTIONS.dashboardAudit).bulkWrite(auditOperations, {
      ordered: false,
    });
  }

  await bumpRevision(db);

  console.log(
    [
      `Migrated ${guildOperations.length} guild document(s)`,
      `${warningOperations.length} warning account document(s)`,
      `${caseOperations.length} moderation case document(s)`,
      `${auditOperations.length} dashboard audit document(s)`,
      `into MongoDB database "${dbName}".`,
    ].join(', '),
  );
} finally {
  await client.close();
}
