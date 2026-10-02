import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { PermissionFlagsBits, RESTJSONErrorCodes } from 'discord.js';
import { BotStore } from '../dashboard/server/bot-store.js';
import { botConfig } from '../src/config.js';
import { COLLECTIONS, currentRevision } from '../src/mongodb.js';
import { filterAutomodMessage, filterLinks } from '../src/modules/automod.js';
import * as botStore from '../src/store.js';
import { FakeMongoDatabase } from './helpers/fake-mongo.js';

function snowflake() {
  return BigInt(`0x${randomBytes(8).toString('hex')}`)
    .toString()
    .padStart(20, '0');
}

async function fixture() {
  const guildId = snowflake();
  const userId = snowflake();
  const database = new FakeMongoDatabase().seed(COLLECTIONS.guilds, [
    {
      _id: guildId,
      tags: {},
      features: {},
      whitelist: [userId],
      automod: {
        enabled: true,
        antiSwear: true,
        blockedWords: [],
        exemptUserIds: [userId],
        exemptRoleIds: [],
        exemptChannelIds: [],
      },
      autoresponders: [],
    },
  ]);
  const dashboard = new BotStore({ database, defaults: botConfig });
  botStore.setMongoDatabaseForTests(database);
  await botStore.loadStore();
  return { database, dashboard, guildId, userId };
}

function memberMessage(context, guildId, userId) {
  return {
    id: snowflake(),
    guildId,
    channelId: snowflake(),
    inGuild: () => true,
    content: 'test',
    author: { id: userId, tag: 'member', bot: false },
    member: {
      roles: { cache: new Map() },
      permissions: {
        has: (permission) => permission === PermissionFlagsBits.Administrator,
      },
      moderatable: false,
      timeout: context.mock.fn(async () => {}),
    },
    client: { user: { id: snowflake(), tag: 'bot' } },
    channel: { send: context.mock.fn(async () => null) },
    attachments: new Map(),
    delete: context.mock.fn(async () => {}),
  };
}

test('a blocked word saved after bot startup deletes matching messages without a restart', async (context) => {
  const { database, dashboard, guildId, userId } = await fixture();
  await dashboard.updateGuildSettings(guildId, {
    automod: { blockedWords: ['test'] },
  });
  await botStore.syncStore();
  const message = memberMessage(context, guildId, userId);
  const remove = message.delete;

  assert.equal(await filterAutomodMessage(message, (key) => key), true);
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(botStore.warningCount(guildId, userId), 1);
  assert.equal(botStore.moderationCases(guildId)[0].reason, 'blocked-word');
  assert.deepEqual(
    (await database.collection(COLLECTIONS.guilds).findOne({ _id: guildId })).automod
      .blockedWords,
    ['test'],
  );

  await dashboard.updateGuildSettings(guildId, { automod: { blockedWords: [] } });
  await botStore.syncStore();
  assert.equal(await filterAutomodMessage(message, (key) => key), false);
  assert.equal(remove.mock.callCount(), 1);
});

for (const [label, filter, content] of [
  ['blocked-word', filterAutomodMessage, 'test'],
  ['link', filterLinks, 'https://example.com'],
]) {
  test(`${label} filtering treats an already-deleted message as handled without repeat penalties`, async (context) => {
    const { dashboard, guildId, userId } = await fixture();
    await dashboard.updateGuildSettings(guildId, {
      automod: { blockedWords: ['test'], antiLink: true },
    });
    await botStore.syncStore();
    const message = memberMessage(context, guildId, userId);
    message.content = content;
    message.member.moderatable = true;
    message.delete.mock.mockImplementation(async () => {
      throw Object.assign(new Error('Unknown Message'), {
        code: RESTJSONErrorCodes.UnknownMessage,
        status: 404,
      });
    });
    const log = context.mock.method(console, 'error', () => {});

    assert.equal(await filter(message, (key) => key), true);
    assert.equal(message.delete.mock.callCount(), 1);
    assert.equal(log.mock.callCount(), 0);
    assert.equal(botStore.warningCount(guildId, userId), 0);
    assert.deepEqual(botStore.moderationCases(guildId), []);
    assert.equal(message.member.timeout.mock.callCount(), 0);
    assert.equal(message.channel.send.mock.callCount(), 0);
  });
}

for (const [label, details] of [
  ['missing permission', { code: RESTJSONErrorCodes.MissingPermissions, status: 403 }],
  ['missing channel', { code: RESTJSONErrorCodes.UnknownChannel, status: 404 }],
  ['unclassified HTTP error', { status: 404 }],
  ['network failure', { code: 'ECONNRESET' }],
]) {
  test(`automod still reports deletion failures caused by ${label}`, async (context) => {
    const { dashboard, guildId, userId } = await fixture();
    await dashboard.updateGuildSettings(guildId, { automod: { blockedWords: ['test'] } });
    await botStore.syncStore();
    const message = memberMessage(context, guildId, userId);
    const failure = Object.assign(new Error(label), details);
    message.delete.mock.mockImplementation(async () => {
      throw failure;
    });
    const log = context.mock.method(console, 'error', () => {});

    assert.equal(await filterAutomodMessage(message, (key) => key), false);
    assert.equal(log.mock.callCount(), 1);
    assert.equal(log.mock.calls[0].arguments.at(-1), failure);
    assert.equal(botStore.warningCount(guildId, userId), 0);
    assert.deepEqual(botStore.moderationCases(guildId), []);
    assert.equal(message.channel.send.mock.callCount(), 0);
  });
}

test('an unrelated bot save preserves word and role lists changed in the dashboard', async () => {
  const { database, dashboard, guildId } = await fixture();
  const exemptRoleId = snowflake();
  botStore.guildConfig(guildId).tags.note = 'pending bot edit';
  await dashboard.updateGuildSettings(guildId, {
    automod: { blockedWords: ['test'], exemptRoleIds: [exemptRoleId] },
  });

  await botStore.saveStore();

  const persisted = await database
    .collection(COLLECTIONS.guilds)
    .findOne({ _id: guildId });
  assert.deepEqual(persisted.automod.blockedWords, ['test']);
  assert.deepEqual(persisted.automod.exemptRoleIds, [exemptRoleId]);
  assert.equal(persisted.tags.note, 'pending bot edit');
  assert.deepEqual(botStore.guildConfig(guildId).automod.blockedWords, ['test']);
});

test('unchanged array settings do not trigger database writes or revision changes', async () => {
  const { database, dashboard, guildId } = await fixture();
  const revision = await currentRevision(database);
  await botStore.saveStore();
  await dashboard.updateGuildSettings(guildId, { automod: { blockedWords: [] } });
  assert.equal(await currentRevision(database), revision);
});

test('edits to nested array items persist while unchanged items stay clean on sync', async () => {
  const { database, dashboard, guildId } = await fixture();
  const responder = { id: snowflake(), trigger: 'hello', response: 'Welcome' };
  await dashboard.updateGuildSettings(guildId, { autoresponders: [responder] });
  await botStore.syncStore();
  assert.deepEqual(botStore.guildConfig(guildId).autoresponders, [responder]);

  botStore.guildConfig(guildId).autoresponders[0].response = 'Updated response';
  await botStore.saveStore();
  const persisted = await database
    .collection(COLLECTIONS.guilds)
    .findOne({ _id: guildId });
  assert.equal(persisted.autoresponders[0].response, 'Updated response');
});
