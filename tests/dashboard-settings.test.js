import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BotStore } from '../dashboard/server/bot-store.js';
import { settingsPatch } from '../dashboard/server/validation.js';

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
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sparkles-dashboard-'));
  const file = path.join(directory, 'store.json');
  const guildId = '123456789012345678';

  await writeFile(
    file,
    JSON.stringify({
      guilds: {
        [guildId]: {
          tags: {},
          automod: { linkProtocols: ['http'] },
        },
      },
      warnings: {},
    }),
    'utf8',
  );

  const store = new BotStore(file, defaults);
  const patch = settingsPatch({
    logsChannelId: '223456789012345678',
    suggestionsChannelId: '223456789012345679',
    giveawayChannelId: '223456789012345680',
    ticketCategoryId: '223456789012345681',
    autoRoleId: '323456789012345678',
    verificationRoleId: '323456789012345679',
    rules: 'Be kind and stay on topic.',
    currency: 'stars',
    aiChatEnabled: true,
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
      blacklistedUserIds: ['523456789012345677'],
      exemptUserIds: ['523456789012345678'],
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
  assert.equal(settings.aiChatEnabled, true);
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
  assert.deepEqual(settings.automod.blacklistedUserIds, ['523456789012345677']);
  assert.deepEqual(settings.automod.exemptUserIds, ['523456789012345678']);
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
  assert.equal(settings.modules.server, false);
  assert.equal(settings.modules.music, false);
  assert.equal(settings.customCommands.hello, 'Welcome to the server!');
  assert.equal(settings.customCommands['rules-short'], 'Read the rules channel.');

  const persisted = JSON.parse(await readFile(file, 'utf8'));
  const guild = persisted.guilds[guildId];

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
  assert.deepEqual(guild.blacklist, ['523456789012345677']);
  assert.deepEqual(guild.whitelist, ['523456789012345678']);
  assert.deepEqual(guild.automod.exemptRoleIds, ['623456789012345678']);
  assert.deepEqual(guild.automod.exemptChannelIds, ['723456789012345678']);
  assert.equal(guild.welcome.channelId, '223456789012345682');
  assert.equal(guild.goodbye.channelId, '223456789012345683');
  assert.equal(guild.giveawaySettings.defaultDurationSeconds, 180);
  assert.equal(guild.musicSettings.defaultVolume, 72);
  assert.equal(guild.economySettings.boxPrice, 600);
  assert.equal(guild.modules.server, false);
  assert.equal(guild.customCommands.hello, 'Welcome to the server!');
});

test('dashboard rejects lifecycle features enabled without a channel', () => {
  assert.throws(
    () =>
      settingsPatch({
        welcome: { enabled: true, channelId: null, message: 'Welcome!' },
      }),
    /INVALID_CHANNEL/u,
  );
  assert.throws(
    () =>
      settingsPatch({
        goodbye: { enabled: true, channelId: null, message: 'Goodbye!' },
      }),
    /INVALID_CHANNEL/u,
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
