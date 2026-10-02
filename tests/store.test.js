import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeMongoDatabase } from './helpers/fake-mongo.js';
import { COLLECTIONS, bumpRevision } from '../src/mongodb.js';

test('store merges external dashboard changes with pending bot changes', async () => {
  const db = new FakeMongoDatabase().seed(COLLECTIONS.guilds, [
    {
      _id: '123456789012345678',
      tags: {},
    },
  ]);
  const store = await import(`../src/store.js?test=${Date.now()}`);
  store.setMongoDatabaseForTests(db);
  await store.loadStore();

  const guildId = '123456789012345678';
  store.guildConfig(guildId).logsChannelId = '223456789012345678';

  await db.collection(COLLECTIONS.guilds).updateOne(
    { _id: guildId },
    { $set: { suggestionsChannelId: '323456789012345678' } },
  );
  await bumpRevision(db);

  await store.saveStore();

  const persisted = await db.collection(COLLECTIONS.guilds).findOne({ _id: guildId });
  assert.equal(persisted.logsChannelId, '223456789012345678');
  assert.equal(persisted.suggestionsChannelId, '323456789012345678');
});

test('store notices MongoDB revisions immediately', async () => {
  const guildId = '123456789012345678';
  const db = new FakeMongoDatabase().seed(COLLECTIONS.guilds, [
    {
      _id: guildId,
      tags: {},
      rules: 'one',
    },
  ]);
  const store = await import(`../src/store.js?sync=${Date.now()}-${Math.random()}`);
  store.setMongoDatabaseForTests(db);
  await store.loadStore();
  assert.equal(store.guildConfig(guildId).rules, 'one');

  await db.collection(COLLECTIONS.guilds).updateOne(
    { _id: guildId },
    { $set: { rules: 'two' } },
  );
  await bumpRevision(db);

  assert.equal(await store.syncStore(), true);
  assert.equal(store.guildConfig(guildId).rules, 'two');
});

test('warnings and moderation cases persist to dedicated MongoDB collections', async () => {
  const guildId = '123456789012345678';
  const userId = '223456789012345678';
  const db = new FakeMongoDatabase();
  const store = await import(`../src/store.js?collections=${Date.now()}-${Math.random()}`);
  store.setMongoDatabaseForTests(db);
  await store.loadStore();

  store.addWarning(guildId, userId, {
    at: '2026-10-02T12:00:00.000Z',
    moderatorId: '323456789012345678',
    reason: 'test',
  });
  store.addModerationCase(guildId, {
    action: 'warn',
    targetId: userId,
    actorId: '323456789012345678',
    source: 'command',
  });
  await store.saveStore();

  const warning = await db
    .collection(COLLECTIONS.warnings)
    .findOne({ guildId, userId });
  assert.equal(warning.entries.length, 1);
  assert.equal(warning.entries[0].reason, 'test');

  const moderationCase = await db
    .collection(COLLECTIONS.moderationCases)
    .findOne({ guildId, id: 1 });
  assert.equal(moderationCase.action, 'warn');
  assert.equal(moderationCase.targetId, userId);
});
