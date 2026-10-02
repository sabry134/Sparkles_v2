import assert from 'node:assert/strict';
import test from 'node:test';
import { BotStore } from '../dashboard/server/bot-store.js';
import { settingsPatch } from '../dashboard/server/validation.js';
import { COLLECTIONS } from '../src/mongodb.js';
import { FakeMongoDatabase } from './helpers/fake-mongo.js';

const defaults = {
  automod: {
    defaultAccountAgeDays: 7,
    defaultRaidJoinThreshold: 8,
    defaultWarningThreshold: 3,
    defaultSpamMessageThreshold: 5,
    defaultSpamWindowSeconds: 5,
    defaultDuplicateThreshold: 3,
    defaultDuplicateWindowSeconds: 20,
    defaultMentionThreshold: 5,
    defaultCapsPercentage: 80,
    defaultCapsMinimumCharacters: 12,
    defaultEmojiThreshold: 10,
    defaultAttachmentThreshold: 4,
    defaultAttachmentWindowSeconds: 10,
    defaultLinkThreshold: 4,
    defaultLinkWindowSeconds: 10,
    defaultTimeoutSeconds: 600,
  },
  economy: {
    boxPrice: 500,
    currency: 'coins',
    robberySuccessPercent: 45,
    rewards: {
      beg: { amount: 25 },
      daily: { amount: 250 },
      weekly: { amount: 1_500 },
    },
  },
  giveaways: { defaultDurationSeconds: 60 },
  music: { defaultVolume: 50 },
};

test('dashboard validates and persists every exposed guild setting', async () => {
  const guildId = '123456789012345678';
  const db = new FakeMongoDatabase().seed(COLLECTIONS.guilds, [
    {
      _id: guildId,
      tags: {},
      automod: { linkProtocols: ['http'] },
    },
  ]);

  const store = new BotStore({ database: db, defaults });
  const patch = settingsPatch({
    logsChannelId: '223456789012345678',
    suggestionsChannelId: '223456789012345679',
    giveawayChannelId: '223456789012345680',
    ticketCategoryId: '223456789012345681',
    autoRoleId: '323456789012345678',
    verificationRoleId: '323456789012345679',
    rules: 'Be kind and stay on topic.',
    currency: 'stars',
    automod: {
      enabled: true,
      antiLink: true,
      antiAlt: true,
      antiBot: true,
      antiRaid: true,
      antiSwear: true,
      antiSpam: true,
      antiMentionSpam: true,
      antiCaps: true,
      antiEmojiSpam: true,
      antiAttachmentSpam: true,
      antiLinkSpam: true,
      minimumAccountAgeDays: 14,
      raidJoinThreshold: 12,
      warningThreshold: 4,
      timeoutSeconds: 900,
      spamMessageThreshold: 6,
      spamWindowSeconds: 8,
      duplicateThreshold: 3,
      duplicateWindowSeconds: 25,
      mentionThreshold: 6,
      capsPercentage: 75,
      capsMinimumCharacters: 10,
      emojiThreshold: 9,
      attachmentThreshold: 5,
      attachmentWindowSeconds: 12,
      linkThreshold: 3,
      linkWindowSeconds: 15,
      blockedWords: [' Spam ', 'spam', 'Scam', 'free nitro'],
      blockedRoleIds: ['623456789012345677'],
      exemptRoleIds: ['623456789012345678'],
      exemptChannelIds: ['723456789012345678'],
    },
    welcome: {
      enabled: true,
      channelId: '223456789012345682',
      message: 'Welcome {user} to {server}!',
    },
    goodbye: {
      enabled: true,
      channelId: '223456789012345683',
      message: 'Goodbye {user}.',
    },
    giveaways: {
      defaultDurationSeconds: 180,
    },
    music: {
      defaultVolume: 72,
    },
    economy: {
      begReward: 30,
      dailyReward: 300,
      weeklyReward: 2_000,
      boxPrice: 600,
      robberySuccessPercent: 40,
    },
    actionLog: {
      enabled: true,
      channelId: '223456789012345678',
      messageDelete: true,
      messageEdit: true,
      memberJoin: true,
      memberLeave: true,
      roleChanges: true,
    },
    autoresponders: [
      {
        id: 'rules-help',
        trigger: 'rules',
        response: 'Read #rules, {user}.',
        match: 'contains',
        enabled: true,
      },
    ],
    starboard: {
      enabled: true,
      channelId: '223456789012345679',
      threshold: 4,
      emoji: '⭐',
      ignoreChannelIds: ['223456789012345680'],
    },
    disabledCommands: ['weather', 'lyrics'],
    commandPermissions: {
      weather: {
        roleMode: 'deny-all-except',
        roleIds: ['623456789012345678'],
        channelMode: 'allow-all-except',
        channelIds: ['223456789012345680'],
      },
    },
    modules: {
      moderation: true,
      automod: true,
      roles: true,
      server: false,
      community: true,
      economy: true,
      fun: false,
      music: false,
      events: true,
      tools: true,
    },
    customCommands: {
      hello: 'Welcome to the server!',
      'rules-short': 'Read the rules channel.',
    },
  });

  const settings = await store.updateGuildSettings(guildId, patch);

  assert.equal(settings.logsChannelId, '223456789012345678');
  assert.equal(settings.suggestionsChannelId, '223456789012345679');
  assert.equal(settings.giveawayChannelId, '223456789012345680');
  assert.equal(settings.ticketCategoryId, '223456789012345681');
  assert.equal(settings.autoRoleId, '323456789012345678');
  assert.equal(settings.verificationRoleId, '323456789012345679');
  assert.equal(settings.rules, 'Be kind and stay on topic.');
  assert.equal(settings.currency, 'stars');
  assert.equal(settings.automod.antiLink, true);
  assert.equal(settings.automod.antiBot, true);
  assert.deepEqual(settings.automod.blockedWords, [
    'spam',
    'scam',
    'free nitro',
  ]);
  assert.equal(settings.automod.antiSpam, true);
  assert.equal(settings.automod.antiMentionSpam, true);
  assert.equal(settings.automod.spamMessageThreshold, 6);
  assert.equal(settings.automod.timeoutSeconds, 900);
  assert.deepEqual(settings.automod.blockedRoleIds, ['623456789012345677']);
  assert.deepEqual(settings.automod.exemptRoleIds, ['623456789012345678']);
  assert.deepEqual(settings.automod.exemptChannelIds, ['723456789012345678']);
  assert.equal(settings.welcome.enabled, true);
  assert.equal(settings.welcome.channelId, '223456789012345682');
  assert.equal(settings.goodbye.enabled, true);
  assert.equal(settings.goodbye.channelId, '223456789012345683');
  assert.equal(settings.giveaways.defaultDurationSeconds, 180);
  assert.equal(settings.music.defaultVolume, 72);
  assert.equal(settings.economy.dailyReward, 300);
  assert.equal(settings.economy.robberySuccessPercent, 40);
  assert.equal(settings.actionLog.enabled, true);
  assert.equal(settings.actionLog.channelId, '223456789012345678');
  assert.equal(settings.autoresponders[0].trigger, 'rules');
  assert.equal(settings.starboard.threshold, 4);
  assert.deepEqual(settings.starboard.ignoreChannelIds, ['223456789012345680']);
  assert.deepEqual(settings.disabledCommands, ['weather', 'lyrics']);
  assert.deepEqual(settings.commandPermissions.weather, {
    roleMode: 'deny-all-except',
    roleIds: ['623456789012345678'],
    channelMode: 'allow-all-except',
    channelIds: ['223456789012345680'],
  });
  assert.equal(settings.modules.server, false);
  assert.equal(settings.modules.music, false);
  assert.equal(settings.customCommands.hello, 'Welcome to the server!');
  assert.equal(settings.customCommands['rules-short'], 'Read the rules channel.');

  const guild = await db.collection(COLLECTIONS.guilds).findOne({ _id: guildId });

  assert.equal(guild.logsChannelId, '223456789012345678');
  assert.equal(guild.suggestionsChannelId, '223456789012345679');
  assert.equal(guild.giveawayChannelId, '223456789012345680');
  assert.equal(guild.ticketCategoryId, '223456789012345681');
  assert.equal(guild.autoRoleId, '323456789012345678');
  assert.equal(guild.verificationRoleId, '323456789012345679');
  assert.equal(guild.features.antiBot, true);
  assert.equal(guild.automod.linkProtocols, undefined);
  assert.equal(guild.automod.antiSpam, true);
  assert.equal(guild.automod.antiMentionSpam, true);
  assert.equal(guild.automod.spamMessageThreshold, 6);
  assert.equal(guild.automod.timeoutSeconds, 900);
  assert.deepEqual(guild.automod.blockedRoleIds, ['623456789012345677']);
  assert.deepEqual(guild.automod.exemptRoleIds, ['623456789012345678']);
  assert.deepEqual(guild.automod.exemptChannelIds, ['723456789012345678']);
  assert.equal(guild.welcome.channelId, '223456789012345682');
  assert.equal(guild.goodbye.channelId, '223456789012345683');
  assert.equal(guild.giveawaySettings.defaultDurationSeconds, 180);
  assert.equal(guild.musicSettings.defaultVolume, 72);
  assert.equal(guild.economySettings.boxPrice, 600);
  assert.equal(guild.actionLog.enabled, true);
  assert.equal(guild.autoresponders[0].response, 'Read #rules, {user}.');
  assert.equal(guild.starboard.threshold, 4);
  assert.deepEqual(guild.disabledCommands, ['weather', 'lyrics']);
  assert.equal(guild.modules.server, false);
  assert.deepEqual(guild.commandPermissions.weather, {
    roleMode: 'deny-all-except',
    roleIds: ['623456789012345678'],
    channelMode: 'allow-all-except',
    channelIds: ['223456789012345680'],
  });
  assert.equal(guild.customCommands.hello, 'Welcome to the server!');
});

test('dashboard allows enabled features to autosave before a channel is selected', () => {
  assert.deepEqual(
    settingsPatch({
      welcome: { enabled: true, channelId: null, message: 'Welcome!' },
    }).welcome,
    { enabled: true, channelId: null, message: 'Welcome!' },
  );
  assert.deepEqual(
    settingsPatch({
      goodbye: { enabled: true, channelId: null, message: 'Goodbye!' },
    }).goodbye,
    { enabled: true, channelId: null, message: 'Goodbye!' },
  );
  assert.equal(
    settingsPatch({
      actionLog: {
        enabled: true,
        channelId: null,
        messageDelete: true,
        messageEdit: true,
        memberJoin: true,
        memberLeave: true,
        roleChanges: true,
        ignoreRoleIds: [],
        ignoreChannelIds: [],
      },
    }).actionLog.channelId,
    null,
  );
  assert.equal(
    settingsPatch({
      starboard: {
        enabled: true,
        channelId: null,
        threshold: 3,
        emoji: '⭐',
        ignoreChannelIds: [],
      },
    }).starboard.channelId,
    null,
  );
});

test('dashboard rejects unknown and unsafe settings', () => {
  assert.throws(() => settingsPatch({ administrator: true }), /INVALID_INPUT/u);
  assert.throws(
    () => settingsPatch({ customCommands: { 'not valid': 'response' } }),
    /INVALID_INPUT/u,
  );
  assert.throws(
    () => settingsPatch({ automod: { blockedWords: [''] } }),
    /INVALID_INPUT/u,
  );
});


test('dashboard exposes legacy user policies only as counts and can clear them', async () => {
  const guildId = '823456789012345678';
  const db = new FakeMongoDatabase().seed(COLLECTIONS.guilds, [
    {
      _id: guildId,
      tags: {},
      blacklist: ['923456789012345678'],
      whitelist: ['923456789012345679', '923456789012345680'],
      automod: {
        exemptUserIds: ['923456789012345681'],
      },
    },
  ]);

  const store = new BotStore({ database: db, defaults });
  const settings = await store.getGuildSettings(guildId);
  assert.deepEqual(settings.legacyUserPolicies, {
    blockedCount: 1,
    exemptCount: 3,
  });
  assert.equal('blacklistedUserIds' in settings.automod, false);
  assert.equal('exemptUserIds' in settings.automod, false);

  const cleared = await store.clearLegacyUserPolicies(guildId);
  assert.deepEqual(cleared.legacyUserPolicies, {
    blockedCount: 0,
    exemptCount: 0,
  });

  const persisted = await db
    .collection(COLLECTIONS.guilds)
    .findOne({ _id: guildId });
  assert.deepEqual(persisted.blacklist, []);
  assert.deepEqual(persisted.whitelist, []);
  assert.equal(persisted.automod.exemptUserIds, undefined);
});
