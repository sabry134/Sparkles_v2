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
      'src/catalog.js',
      'src/command-routes.js',
      'src/store.js',
      'src/mongodb.js',
      'src/platform/discord.js',
      'shared/platform-schema.js',
      'dashboard/src/App.jsx',
      'dashboard/src/MuiProvider.jsx',
      'dashboard/src/Select.jsx',
      'dashboard/src/Navigation.jsx',
      'dashboard/src/EmojiPicker.jsx',
      'dashboard/src/MessageStudio.jsx',
      'dashboard/src/PlatformWorkspace.jsx',
      'dashboard/src/i18n/platform.en.js',
      'dashboard/package.json',
      'dashboard/server/index.js',
      'dashboard/server/bot-store.js',
      'dashboard/server/config.js',
      '.env.example',
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


test('disabled dashboard features hide settings that only apply while enabled', () => {
  const app = sources['dashboard/src/App.jsx'];

  assert.match(
    app,
    /draft\.actionLog\.enabled \? \([\s\S]*?action-log-channel[\s\S]*?action-log-ignore-channels/u,
  );
  assert.match(
    app,
    /draft\.automod\.enabled \? \([\s\S]*?id="anti-link"[\s\S]*?id="anti-swear"/u,
  );
  assert.match(
    app,
    /draft\.automod\.enabled && draft\.automod\.antiSwear \? \([\s\S]*?id="blocked-words"/u,
  );
  for (const [condition, id] of [
    ['antiSpam', 'spam-message-threshold'],
    ['antiSpam', 'duplicate-window'],
    ['antiMentionSpam', 'mention-threshold'],
    ['antiCaps', 'caps-percentage'],
    ['antiCaps', 'caps-minimum'],
    ['antiEmojiSpam', 'emoji-threshold'],
    ['antiAttachmentSpam', 'attachment-threshold'],
    ['antiAttachmentSpam', 'attachment-window'],
    ['antiLinkSpam', 'link-threshold'],
    ['antiLinkSpam', 'link-window'],
    ['antiAlt', 'minimum-account-age'],
    ['antiRaid', 'raid-threshold'],
  ]) {
    assert.match(
      app,
      new RegExp(
        `draft\\.automod\\.${condition} \\? \\([\\s\\S]*?id="${id}"`,
        'u',
      ),
    );
  }
  assert.match(
    app,
    /draft\[section\]\.enabled \? \([\s\S]*?\$\{section\}-channel[\s\S]*?\$\{section\}-message/u,
  );
  assert.match(
    app,
    /draft\.starboard\.enabled \? \([\s\S]*?starboard-channel[\s\S]*?starboard-ignore-channels/u,
  );
  assert.match(
    app,
    /\{enabled \? \([\s\S]*?modules\.commandConfigure[\s\S]*?\) : null\}/u,
  );
  assert.match(
    app,
    /selectedCommandRule &&[\s\S]*?!draft\.disabledCommands\.includes\(selectedCommand\.name\)/u,
  );
});


test('bot and dashboard persist shared state in MongoDB instead of store.json', () => {
  assert.match(sources['src/mongodb.js'], /import \{ MongoClient \} from 'mongodb'/u);
  for (const collection of [
    'guilds',
    'warnings',
    'moderation_cases',
    'dashboard_audit',
    'counters',
    'metadata',
  ]) {
    assert.match(sources['src/mongodb.js'], new RegExp(collection, 'u'));
  }
  assert.match(sources['src/store.js'], /connectMongo/u);
  assert.match(sources['src/store.js'], /currentRevision/u);
  assert.match(sources['dashboard/server/bot-store.js'], /COLLECTIONS\.guilds/u);
  assert.match(sources['dashboard/server/config.js'], /MONGODB_URI/u);
  assert.match(sources['dashboard/server/config.js'], /MONGODB_DB_NAME/u);
  assert.doesNotMatch(sources['src/store.js'], /readFile|writeFile|store\.json/u);
  assert.doesNotMatch(
    sources['dashboard/server/bot-store.js'],
    /readFile|writeFile|store\.json/u,
  );
});


test('removed provider commands and credentials stay removed', () => {
  const removedCommands = ['ask', 'pastebin', 'ratings', 'reward', 'start', 'stop'];
  const catalogSource = sources['src/catalog.js'];
  const extendedSource = sources['src/modules/extended.js'];
  const routesSource = sources['src/command-routes.js'];
  const environmentSource = sources['.env.example'];
  const environmentNames = [
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'TOPGG_TOKEN',
    'TANKI_RATINGS_API_URL',
    'PASTEBIN_API_KEY',
    'PASTEBIN_USER_KEY',
  ];

  for (const command of removedCommands) {
    assert.doesNotMatch(
      extendedSource,
      new RegExp(`case ['"]${command}['"]`, 'u'),
    );
    assert.doesNotMatch(
      routesSource,
      new RegExp(`(?:^|\\n)\\s*['"]?${command}['"]?\\s*:`, 'u'),
    );
    assert.doesNotMatch(
      catalogSource,
      new RegExp(`(?:^|\\n)${command}\\|`, 'u'),
    );
  }

  for (const variable of environmentNames) {
    assert.doesNotMatch(extendedSource, new RegExp(variable, 'u'));
    assert.doesNotMatch(environmentSource, new RegExp(variable, 'u'));
  }

  assert.doesNotMatch(sources['dashboard/src/App.jsx'], /aiChatEnabled|ai-chat/u);
  assert.doesNotMatch(sources['dashboard/server/bot-store.js'], /aiChatEnabled/u);
});


test('dashboard interactive controls use Material UI instead of browser-native UI', () => {
  const packageJson = JSON.parse(sources['dashboard/package.json']);
  assert.equal(packageJson.dependencies['@mui/material'], '^9.4.0');
  assert.equal(packageJson.dependencies['@emotion/react'], '^11.14.0');
  assert.equal(packageJson.dependencies['@emotion/styled'], '^11.14.1');

  assert.match(sources['dashboard/src/MuiProvider.jsx'], /ThemeProvider/u);
  assert.match(sources['dashboard/src/MuiProvider.jsx'], /<Dialog/u);
  assert.match(sources['dashboard/src/Select.jsx'], /Select as MuiSelect/u);
  assert.match(sources['dashboard/src/App.jsx'], /<Snackbar/u);
  assert.match(sources['dashboard/src/App.jsx'], /<Switch/u);
  assert.match(sources['dashboard/src/Navigation.jsx'], /<Dialog/u);
  assert.match(sources['dashboard/src/MessageStudio.jsx'], /<Tabs/u);
  assert.match(sources['dashboard/src/MessageStudio.jsx'], /<Accordion/u);
  assert.match(sources['dashboard/src/PlatformWorkspace.jsx'], /<TableContainer/u);
  assert.match(sources['dashboard/src/PlatformWorkspace.jsx'], /<TableHead/u);
  assert.match(sources['dashboard/src/PlatformWorkspace.jsx'], /<TableBody/u);
  assert.match(sources['dashboard/src/PlatformWorkspace.jsx'], /useUiDialog/u);

  for (const file of [
    'dashboard/src/App.jsx',
    'dashboard/src/Select.jsx',
    'dashboard/src/Navigation.jsx',
    'dashboard/src/EmojiPicker.jsx',
    'dashboard/src/MessageStudio.jsx',
    'dashboard/src/PlatformWorkspace.jsx',
  ]) {
    assert.doesNotMatch(sources[file], /window\.(?:alert|prompt|confirm)\s*\(/u);
    assert.doesNotMatch(sources[file], /<dialog\b/u);
    assert.doesNotMatch(sources[file], /<select\b/u);
    assert.doesNotMatch(sources[file], /<textarea\b/u);
    assert.doesNotMatch(sources[file], /<button\b/u);
    assert.doesNotMatch(sources[file], /<details\b/u);
    assert.doesNotMatch(sources[file], /<summary\b/u);
  }

  for (const file of [
    'dashboard/src/MessageStudio.jsx',
    'dashboard/src/PlatformWorkspace.jsx',
  ]) {
    const visibleNativeInputs = [
      ...sources[file].matchAll(/<input\b([^>]*)>/gu),
    ].filter(([, attributes]) => !/type="file"/u.test(attributes));
    assert.equal(visibleNativeInputs.length, 0);
  }
});


test('dashboard UI uses MUI primitives and avoids browser-native interaction chrome', () => {
  for (const path of [
    'dashboard/src/App.jsx',
    'dashboard/src/PlatformWorkspace.jsx',
    'dashboard/src/MessageStudio.jsx',
    'dashboard/src/Navigation.jsx',
  ]) {
    const source = sources[path];
    assert.doesNotMatch(source, /window\.(?:alert|confirm|prompt)\s*\(/u);
    assert.doesNotMatch(source, /<(?:button|select|textarea)\b/u);
  }

  assert.doesNotMatch(
    sources['dashboard/src/PlatformWorkspace.jsx'],
    /members\.manualId|Advanced: member IDs/u,
  );
  assert.doesNotMatch(
    sources['dashboard/src/Navigation.jsx'],
    /sparkles\.pinnedPages|navigation\.pin|navigation\.unpin/u,
  );
  assert.match(sources['dashboard/src/MuiProvider.jsx'], /createTheme/u);
  assert.match(sources['dashboard/src/Navigation.jsx'], /ListItemButton/u);
  assert.match(sources['dashboard/src/PlatformWorkspace.jsx'], /<Table/u);
});


test('dashboard errors explain permissions and IDs before the support reference', () => {
  assert.match(
    sources['src/platform/discord.js'],
    /code: 'missing_capability'[\s\S]*?capability[\s\S]*?currentCapabilities/u,
  );
  assert.match(
    sources['shared/platform-schema.js'],
    /code: 'id'[\s\S]*?path[\s\S]*?value/u,
  );
  assert.match(
    sources['dashboard/src/PlatformWorkspace.jsx'],
    /errorDetailsText\(error\.details\)/u,
  );
  assert.match(
    sources['dashboard/src/PlatformWorkspace.jsx'],
    /platform\.errorDetailsTitle/u,
  );
  assert.match(
    sources['dashboard/src/i18n/platform.en.js'],
    /Support reference: \{reference\}/u,
  );
  assert.match(
    sources['dashboard/src/i18n/platform.en.js'],
    /Required dashboard permission: \{capability\}/u,
  );
  assert.match(
    sources['dashboard/src/i18n/platform.en.js'],
    /Invalid Discord ID in \{path\}/u,
  );
});
