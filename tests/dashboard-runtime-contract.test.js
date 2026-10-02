import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sources = Object.fromEntries(
  await Promise.all(
    [
      'server.js',
      'src/modules/automod.js',
      'src/modules/roles.js',
      'src/modules/suggestions.js',
      'src/modules/economy.js',
      'src/modules/music.js',
      'src/modules/extended.js',
      'src/modules/automation.js',
      'src/modules/action-log.js',
      'dashboard/src/App.jsx',
      'dashboard/server/index.js',
    ].map(async (file) => [
      file,
      await readFile(new URL(`../${file}`, import.meta.url), 'utf8'),
    ]),
  ),
);

test('every dashboard setting has a bot runtime consumer', () => {
  const contracts = [
    ['server.js', 'logsChannelId'],
    ['server.js', 'config.rules'],
    ['src/modules/automod.js', 'automod?.antiLink'],
    ['src/modules/automod.js', 'automod.antiSwear'],
    ['src/modules/automod.js', 'antiSpam'],
    ['src/modules/automod.js', 'antiMentionSpam'],
    ['src/modules/automod.js', 'antiCaps'],
    ['src/modules/automod.js', 'antiEmojiSpam'],
    ['src/modules/automod.js', 'antiAttachmentSpam'],
    ['src/modules/automod.js', 'antiLinkSpam'],
    ['src/modules/automod.js', 'blockedRoleIds'],
    ['src/modules/automod.js', 'exemptRoleIds'],
    ['src/modules/automod.js', 'exemptChannelIds'],
    ['src/modules/automod.js', 'minimumAccountAgeDays'],
    ['src/modules/automod.js', 'antiRaid'],
    ['src/modules/automod.js', 'warningThreshold'],
    ['src/modules/automod.js', 'blockedWords'],
    ['src/modules/automod.js', 'features?.antiBot'],
    ['src/modules/roles.js', 'autoRoleId'],
    ['src/modules/roles.js', 'reactionRoles'],
    ['src/modules/suggestions.js', 'suggestionsChannelId'],
    ['src/modules/extended.js', 'giveawayChannelId'],
    ['src/modules/extended.js', 'ticketCategoryId'],
    ['src/modules/extended.js', 'verificationRoleId'],
    ['src/modules/extended.js', 'aiChatEnabled'],
    ['src/modules/extended.js', 'economySettings?.boxPrice'],
    ['src/modules/extended.js', 'economySettings?.robberySuccessPercent'],
    ['src/modules/economy.js', 'economySettings?.['],
    ['src/modules/music.js', 'musicSettings?.defaultVolume'],
    ['src/modules/extended.js', 'customCommands'],
    ['server.js', '.modules?.[moduleKey]'],
    ['server.js', '.welcome'],
    ['server.js', '.goodbye'],
    ['src/modules/automation.js', 'autoresponders'],
    ['src/modules/automation.js', 'starboard'],
    ['src/modules/action-log.js', 'actionLog'],
    ['server.js', 'disabledCommands'],
    ['server.js', 'commandPermissions'],
  ];

  for (const [file, expected] of contracts) {
    assert.match(sources[file], new RegExp(expected.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'), 'u'));
  }
});

test('event and interaction settings are refreshed from the shared store', () => {
  assert.match(
    sources['server.js'],
    /client\.on\('interactionCreate'[\s\S]*?await syncStore\(\)/u,
  );
  assert.match(
    sources['server.js'],
    /client\.on\('messageCreate'[\s\S]*?syncStore\(\)/u,
  );
  assert.match(
    sources['server.js'],
    /client\.on\('guildMemberAdd'[\s\S]*?syncStore\(\)/u,
  );
  assert.match(
    sources['server.js'],
    /client\.on\('guildMemberRemove'[\s\S]*?syncStore\(\)/u,
  );
  assert.match(
    sources['server.js'],
    /client\.on\('messageReactionAdd'[\s\S]*?syncStore\(\)/u,
  );
});


test('dashboard feature module gates match their configured sections', () => {
  assert.match(sources['server.js'], /'set-verification': 'roles'/u);
  assert.match(sources['server.js'], /verify: 'roles'/u);
  assert.match(sources['server.js'], /ticket: 'community'/u);
});


test('advanced moderation commands are wired to runtime handlers', () => {
  for (const command of [
    'anti-spam',
    'automod-test',
    'purge-user',
    'purge-links',
    'purge-attachments',
    'purge-bots',
    'unwhitelist',
    'unblacklist',
  ]) {
    assert.match(sources['src/modules/extended.js'], new RegExp(`case '${command}'`, 'u'));
  }
});


test('dashboard uses real routed module pages instead of hash navigation', () => {
  assert.match(
    sources['dashboard/src/App.jsx'],
    /\/servers\/\$\{guildId\}\/\$\{PAGE_IDS\.has\(page\)/u,
  );
  assert.doesNotMatch(
    sources['dashboard/src/App.jsx'],
    /document\.getElementById\(id\)\?\.scrollIntoView/u,
  );
  for (const page of [
    'overview',
    'moderation',
    'automod',
    'roles',
    'embeds',
    'community',
    'automation',
    'economy',
    'music',
    'modules',
    'custom',
  ]) {
    assert.match(
      sources['dashboard/src/App.jsx'],
      new RegExp(`id="${page}"[\\s\\S]*?active=\\{activeSection === '${page}'\\}`, 'u'),
    );
  }
});

test('dashboard session failures return to the login route', () => {
  assert.match(
    sources['dashboard/src/App.jsx'],
    /AUTH_REQUIRED'[\s\S]*DISCORD_SESSION_EXPIRED'[\s\S]*INVALID_CSRF/u,
  );
  assert.match(
    sources['dashboard/src/App.jsx'],
    /window\.history\.replaceState\(\{\}, '', '\/'\)/u,
  );
});

test('reaction roles and embed maker are backed by server endpoints', () => {
  assert.match(
    sources['dashboard/server/index.js'],
    /\/api\/guilds\/:guildId\/reaction-role-embeds/u,
  );
  assert.match(
    sources['dashboard/server/index.js'],
    /\/api\/guilds\/:guildId\/embeds/u,
  );
  assert.match(
    sources['dashboard/src/App.jsx'],
    /reactionMode === 'embed'/u,
  );
  assert.match(
    sources['dashboard/src/App.jsx'],
    /messageLink: reactionForm\.messageLink/u,
  );
});

test('moderation history action log autoresponders and starboard are wired', () => {
  assert.match(
    sources['dashboard/server/index.js'],
    /\/api\/guilds\/:guildId\/moderation-cases/u,
  );
  assert.match(sources['src/modules/automation.js'], /handleAutoresponder/u);
  assert.match(sources['src/modules/automation.js'], /handleStarboardReaction/u);
  assert.match(sources['src/modules/action-log.js'], /logMessageDelete/u);
  assert.match(sources['src/modules/action-log.js'], /logRoleChanges/u);
  assert.match(sources['server.js'], /handleAutoresponder\(message\)/u);
  assert.match(sources['server.js'], /handleStarboardReaction\(reaction, user\)/u);
});


test('dashboard command access rules are enforced by role and channel', () => {
  assert.match(sources['server.js'], /function commandAccessDenied/u);
  assert.match(sources['server.js'], /roleMode === 'deny-all-except'/u);
  assert.match(sources['server.js'], /channelMode === 'deny-all-except'/u);
  assert.match(sources['server.js'], /commandAccessDenied\(interaction, commandName\)/u);
  assert.match(sources['dashboard/src/App.jsx'], /selectedCommandRule/u);
  assert.match(sources['dashboard/src/App.jsx'], /commandPermissions/u);
});

test('dashboard configuration changes are auditable', () => {
  assert.match(
    sources['dashboard/server/index.js'],
    /\/api\/guilds\/:guildId\/dashboard-audit/u,
  );
  assert.match(sources['dashboard/server/index.js'], /appendDashboardAudit/u);
  assert.match(sources['dashboard/src/App.jsx'], /dashboardAudit/u);
});
