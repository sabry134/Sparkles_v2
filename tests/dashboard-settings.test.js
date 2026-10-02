import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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

test('dashboard validates and persists complete guild settings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sparkles-dashboard-'));
  const file = path.join(directory, 'store.json');
  const store = new BotStore(file, defaults);
  const guildId = '123456789012345678';

  const patch = settingsPatch({
    aiChatEnabled: true,
    currency: 'stars',
    logsChannelId: '223456789012345678',
    verificationRoleId: '323456789012345678',
    automod: {
      enabled: true,
      antiLink: true,
      antiAlt: true,
      antiBot: true,
      antiRaid: true,
      antiSwear: true,
      minimumAccountAgeDays: 14,
      raidJoinThreshold: 12,
      warningThreshold: 4,
      blockedWords: [' Spam ', 'spam', 'Scam'],
    },
    economy: {
      begReward: 30,
      dailyReward: 300,
      weeklyReward: 2_000,
      boxPrice: 600,
      robberySuccessPercent: 40,
    },
    customCommands: { hello: 'Welcome to the server!' },
    modules: { music: false, moderation: true },
  });

  const settings = await store.updateGuildSettings(guildId, patch);
  assert.equal(settings.currency, 'stars');
  assert.equal(settings.automod.antiBot, true);
  assert.deepEqual(settings.automod.blockedWords, ['spam', 'scam']);
  assert.equal(settings.economy.dailyReward, 300);
  assert.equal(settings.modules.music, false);
  assert.equal(settings.customCommands.hello, 'Welcome to the server!');

  const persisted = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(persisted.guilds[guildId].features.antiBot, true);
  assert.equal(persisted.guilds[guildId].economySettings.boxPrice, 600);
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
