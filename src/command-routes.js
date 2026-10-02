import { ChannelType } from 'discord.js';

export const CATEGORY_SLASH_NAMES = Object.freeze({
  information: 'utility',
  moderation: 'moderation',
  automod: 'automod',
  'roles-members': 'roles',
  'server-builder': 'server',
  community: 'community',
  'economy-profile': 'economy',
  fun: 'fun',
  music: 'music',
  events: 'events',
  'tools-ai': 'tools',
  'custom-premium': 'premium-tools',
  other: 'other',
});

const SUBCOMMAND_NAMES = Object.freeze({
  'auto-status': 'status',
  'join-voice': 'join',
  'now-playing': 'now',
  'song-search': 'search',
  'user-role': 'list',
});

const choices = {
  state: [
    { labelKey: 'options.enable', value: 'enable' },
    { labelKey: 'options.disable', value: 'disable' },
  ],
  achievement: [
    { labelKey: 'options.add', value: 'add' },
    { labelKey: 'options.remove', value: 'remove' },
  ],
  rps: [
    { labelKey: 'options.rock', value: 'rock' },
    { labelKey: 'options.paper', value: 'paper' },
    { labelKey: 'options.scissors', value: 'scissors' },
  ],
  language: [
    { labelKey: 'options.languageEnglish', value: 'en' },
    { labelKey: 'options.languageFrench', value: 'fr' },
    { labelKey: 'options.languageSpanish', value: 'es' },
    { labelKey: 'options.languageGerman', value: 'de' },
    { labelKey: 'options.languageItalian', value: 'it' },
    { labelKey: 'options.languagePortuguese', value: 'pt' },
    { labelKey: 'options.languageArabic', value: 'ar' },
    { labelKey: 'options.languageJapanese', value: 'ja' },
    { labelKey: 'options.languageKorean', value: 'ko' },
    { labelKey: 'options.languageChinese', value: 'zh' },
  ],
  custom: [
    { labelKey: 'options.set', value: 'set' },
    { labelKey: 'options.delete', value: 'delete' },
    { labelKey: 'options.list', value: 'list' },
  ],
  module: [
    'moderation',
    'automod',
    'roles',
    'server',
    'community',
    'economy',
    'fun',
    'music',
    'events',
    'tools',
  ].map((value) => ({ labelKey: `dashboard.modules.${value}`, value })),
};

const string = (key, name, descriptionKey, required = false, extra = {}) => ({
  key,
  name,
  type: 'string',
  descriptionKey,
  required,
  ...extra,
});
const integer = (key, name, descriptionKey, required = false, extra = {}) => ({
  key,
  name,
  type: 'integer',
  descriptionKey,
  required,
  ...extra,
});
const user = (required = false) => ({
  key: 'user',
  name: 'user',
  type: 'user',
  descriptionKey: 'options.serverMember',
  required,
});
const role = (required = false) => ({
  key: 'role',
  name: 'role',
  type: 'role',
  descriptionKey: 'options.serverRole',
  required,
});
const channel = (name, descriptionKey, required = false, channelTypes) => ({
  key: 'channel',
  name,
  type: 'channel',
  descriptionKey,
  required,
  channelTypes,
});

const state = () =>
  string('action', 'state', 'options.featureState', true, {
    choices: choices.state,
  });

export const GROUPED_COMMAND_OPTIONS = Object.freeze({
  achievement: [
    string('action', 'mode', 'options.achievementMode', true, {
      choices: choices.achievement,
    }),
    user(true),
    string('text', 'achievement', 'options.achievementName', true, {
      maxLength: 100,
    }),
  ],
  'add-points': [
    user(true),
    integer('amount', 'points', 'options.points', true, {
      minValue: 1,
      maxValue: 1_000_000,
    }),
  ],
  'add-premium': [user(false)],
  alert: [
    string('text', 'message', 'options.alertMessage', true, { maxLength: 2_000 }),
    channel('channel', 'options.destinationChannel'),
  ],
  'anti-alt': [
    state(),
    integer('amount', 'minimum-days', 'options.minimumAccountAge', false, {
      minValue: 0,
      maxValue: 365,
    }),
  ],
  'anti-bot': [state()],
  'anti-raid': [
    state(),
    integer('amount', 'join-threshold', 'options.raidThreshold', false, {
      minValue: 3,
      maxValue: 100,
    }),
  ],
  'anti-swear': [
    state(),
    string('text', 'blocked-words', 'options.blockedWords', false, {
      maxLength: 1_000,
    }),
  ],
  ask: [string('text', 'prompt', 'options.aiPrompt', true, { maxLength: 2_000 })],
  'auto-status': [],
  automod: [
    state(),
    integer('amount', 'warning-limit', 'options.warningLimit', false, {
      minValue: 1,
      maxValue: 100,
    }),
  ],
  backup: [],
  blacklist: [user(true)],
  browse: [],
  claim: [string('id', 'code', 'options.accessCode', true, { maxLength: 64 })],
  'control-panel': [],
  'create-event': [
    string('text', 'name', 'options.eventName', true, { maxLength: 100 }),
    string('action', 'starts-in', 'options.eventStart', true, { maxLength: 40 }),
    integer('amount', 'minutes', 'options.eventDuration', false, {
      minValue: 15,
      maxValue: 10_080,
    }),
    channel('channel', 'options.voiceChannel', false, [ChannelType.GuildVoice]),
  ],
  'create-tournament': [
    string('text', 'name', 'options.tournamentName', true, { maxLength: 100 }),
  ],
  custom: [
    string('action', 'mode', 'options.customCommandMode', true, {
      choices: choices.custom,
    }),
    string('id', 'name', 'options.customCommandName', false, { maxLength: 32 }),
    string('text', 'response', 'options.customCommandResponse', false, {
      maxLength: 1_900,
    }),
  ],
  debug: [],
  define: [string('text', 'word', 'options.dictionaryWord', true, { maxLength: 100 })],
  'delete-channel': [channel('channel', 'options.channelToDelete', true)],
  'delete-event': [
    string('id', 'event-id', 'options.eventId', true, {
      minLength: 17,
      maxLength: 20,
    }),
  ],
  'delete-role': [role(true)],
  'delete-tournament': [
    string('text', 'name', 'options.tournamentName', true, { maxLength: 100 }),
  ],
  deposit: [
    integer('amount', 'coins', 'options.coinAmount', true, {
      minValue: 1,
      maxValue: 2_000_000_000,
    }),
  ],
  'disable-links': [],
  embed: [
    string('text', 'message', 'options.messageContent', true, { maxLength: 2_000 }),
    channel('channel', 'options.destinationChannel'),
  ],
  'enable-links': [],
  files: [],
  'filter-http': [],
  'filter-https': [],
  generate: [],
  'generate-code': [],
  giveaway: [
    string('text', 'prize', 'options.giveawayPrize', true, { maxLength: 300 }),
    integer('amount', 'seconds', 'options.giveawayDuration', false, {
      minValue: 10,
      maxValue: 604_800,
    }),
    channel('channel', 'options.destinationChannel'),
  ],
  guess: [
    integer('amount', 'number', 'options.guessNumber', true, {
      minValue: 1,
      maxValue: 10,
    }),
  ],
  health: [],
  'join-voice': [],
  leaderboard: [],
  level: [user(false)],
  list: [],
  lookup: [user(true)],
  lyrics: [
    string('artist', 'artist', 'options.songArtist', true, { maxLength: 100 }),
    string('title', 'title', 'options.songTitle', true, { maxLength: 100 }),
  ],
  memory: [],
  'modify-role': [
    role(true),
    string('text', 'new-name', 'options.newRoleName', true, { maxLength: 100 }),
  ],
  module: [
    string('id', 'module', 'options.moduleName', true, {
      choices: choices.module,
    }),
    state(),
  ],
  'now-playing': [],
  open: [],
  organize: [],
  pastebin: [
    string('text', 'content', 'options.pasteContent', true, { maxLength: 2_000 }),
  ],
  play: [string('text', 'query', 'options.songQuery', true, { maxLength: 300 })],
  'prefix-only': [
    string('id', 'name', 'options.customCommandName', true, { maxLength: 32 }),
  ],
  premium: [],
  profile: [user(false)],
  purchase: [
    integer('amount', 'quantity', 'options.boxQuantity', false, {
      minValue: 1,
      maxValue: 25,
    }),
  ],
  queue: [],
  random: [],
  ratings: [string('text', 'player', 'options.playerName', true, { maxLength: 100 })],
  'redeem-code': [string('id', 'code', 'options.accessCode', true, { maxLength: 64 })],
  'remove-permissions': [],
  'remove-points': [
    user(true),
    integer('amount', 'points', 'options.points', true, {
      minValue: 1,
      maxValue: 1_000_000,
    }),
  ],
  'remove-premium': [user(false)],
  rename: [
    user(true),
    string('text', 'nickname', 'options.nickname', true, { maxLength: 32 }),
  ],
  reply: [
    string('id', 'message-id', 'options.messageId', true, {
      minLength: 17,
      maxLength: 20,
    }),
    string('text', 'message', 'options.messageContent', true, { maxLength: 2_000 }),
    channel('channel', 'options.messageChannel'),
  ],
  reward: [],
  rob: [
    user(true),
    integer('amount', 'maximum', 'options.robAmount', false, {
      minValue: 1,
      maxValue: 2_000_000_000,
    }),
  ],
  rps: [string('action', 'choice', 'options.rpsChoice', true, { choices: choices.rps })],
  'run-custom-command': [
    string('id', 'name', 'options.customCommandName', true, { maxLength: 32 }),
  ],
  search: [string('text', 'query', 'options.commandSearch', true, { maxLength: 100 })],
  'set-currency': [
    string('text', 'currency', 'options.currencyName', true, { maxLength: 24 }),
  ],
  'set-profile': [string('text', 'bio', 'options.profileBio', true, { maxLength: 500 })],
  'set-verification': [role(true)],
  shop: [],
  skip: [],
  'song-search': [string('text', 'query', 'options.songQuery', true, { maxLength: 300 })],
  start: [],
  status: [],
  stop: [],
  sudo: [
    user(true),
    string('text', 'message', 'options.messageContent', true, { maxLength: 2_000 }),
    channel('channel', 'options.destinationChannel'),
  ],
  ticket: [
    channel('channel', 'options.ticketCategory', false, [ChannelType.GuildCategory]),
  ],
  translate: [
    string('text', 'text', 'options.translationText', true, { maxLength: 1_000 }),
    string('action', 'language', 'options.targetLanguage', true, {
      choices: choices.language,
    }),
  ],
  'user-role': [user(false)],
  verify: [],
  view: [],
  volume: [
    integer('amount', 'percent', 'options.volumePercent', true, {
      minValue: 1,
      maxValue: 200,
    }),
  ],
  weather: [
    string('text', 'location', 'options.weatherLocation', true, { maxLength: 100 }),
  ],
  'web-status': [
    string('text', 'website', 'options.websiteUrl', true, { maxLength: 500 }),
  ],
  whitelist: [user(true)],
  withdraw: [
    integer('amount', 'coins', 'options.coinAmount', true, {
      minValue: 1,
      maxValue: 2_000_000_000,
    }),
  ],
});

const TOP_LEVEL_HELP_OPTIONS = Object.freeze({
  avatar: [{ name: 'user' }],
  ban: [{ name: 'user', required: true }, { name: 'reason' }],
  kick: [{ name: 'user', required: true }, { name: 'reason' }],
  'soft-ban': [{ name: 'user', required: true }, { name: 'reason' }],
  unban: [{ name: 'user-id', required: true }],
  timeout: [
    { name: 'user', required: true },
    { name: 'duration', required: true },
    { name: 'reason' },
  ],
  untimeout: [{ name: 'user', required: true }],
  clear: [{ name: 'amount', required: true }],
  'add-role': [
    { name: 'user', required: true },
    { name: 'role', required: true },
  ],
  'remove-role': [
    { name: 'user', required: true },
    { name: 'role', required: true },
  ],
  warn: [{ name: 'user', required: true }, { name: 'reason' }],
  'user-warnings': [{ name: 'user', required: true }],
  'clear-warnings': [{ name: 'user', required: true }],
  logs: [{ name: 'channel' }],
  'set-suggestions': [{ name: 'channel', required: true }],
  suggest: [{ name: 'text', required: true }],
  say: [
    { name: 'channel', required: true },
    { name: 'text', required: true },
  ],
  slowmode: [
    { name: 'channel', required: true },
    { name: 'seconds', required: true },
  ],
  rules: [{ name: 'text' }],
  tag: [{ name: 'action', required: true }, { name: 'name' }, { name: 'content' }],
  thread: [{ name: 'text', required: true }],
  'create-category': [{ name: 'name', required: true }],
  'create-text-channel': [{ name: 'name', required: true }],
  'create-voice': [{ name: 'name', required: true }],
  quote: [{ name: 'message-id', required: true }],
  lock: [{ name: 'channel', required: true }],
  unlock: [{ name: 'channel', required: true }],
  'user-info': [{ name: 'user', required: true }],
  'role-info': [{ name: 'role', required: true }],
  poll: [
    { name: 'channel', required: true },
    { name: 'text', required: true },
    { name: 'choice-one', required: true },
    { name: 'choice-two', required: true },
  ],
  announce: [
    { name: 'channel', required: true },
    { name: 'text', required: true },
  ],
  'set-nickname': [
    { name: 'user', required: true },
    { name: 'nickname', required: true },
  ],
  'reset-nickname': [{ name: 'user', required: true }],
  'create-role': [{ name: 'name', required: true }],
  'channel-topic': [
    { name: 'channel', required: true },
    { name: 'text', required: true },
  ],
  'auto-role': [{ name: 'action', required: true }, { name: 'role' }],
  'reaction-role': [
    { name: 'action', required: true },
    { name: 'message-id', required: true },
    { name: 'emoji', required: true },
    { name: 'channel' },
    { name: 'role' },
  ],
  balance: [{ name: 'user' }],
  dice: [{ name: 'sides' }],
  'anti-link': [{ name: 'action', required: true }],
});

export function slashRoute(commandName, categoryId, topLevel) {
  if (topLevel) return `/${commandName}`;
  const group = CATEGORY_SLASH_NAMES[categoryId] ?? categoryId;
  const subcommand = SUBCOMMAND_NAMES[commandName] ?? commandName;
  return `/${group} ${subcommand}`;
}

export function slashSubcommandName(commandName) {
  return SUBCOMMAND_NAMES[commandName] ?? commandName;
}

export function commandOptionPresentation(commandName, topLevel) {
  const schema = topLevel
    ? (TOP_LEVEL_HELP_OPTIONS[commandName] ?? [])
    : (GROUPED_COMMAND_OPTIONS[commandName] ?? []);
  return schema.map(({ name, required = false, descriptionKey }) => ({
    name,
    required,
    descriptionKey,
  }));
}

function configureOption(option, definition, t) {
  option
    .setName(definition.name)
    .setDescription(t(definition.descriptionKey))
    .setRequired(definition.required);

  if (definition.minLength !== undefined) option.setMinLength(definition.minLength);
  if (definition.maxLength !== undefined) option.setMaxLength(definition.maxLength);
  if (definition.minValue !== undefined) option.setMinValue(definition.minValue);
  if (definition.maxValue !== undefined) option.setMaxValue(definition.maxValue);
  if (definition.channelTypes) option.addChannelTypes(...definition.channelTypes);
  if (definition.choices) {
    option.addChoices(
      ...definition.choices.map(({ labelKey, value }) => ({ name: t(labelKey), value })),
    );
  }
  return option;
}

export function addGroupedCommandOptions(subcommand, commandName, t) {
  const schema = GROUPED_COMMAND_OPTIONS[commandName];
  if (!schema) throw new Error(`Missing grouped option schema for ${commandName}`);

  for (const definition of schema) {
    if (definition.type === 'string') {
      subcommand.addStringOption((option) => configureOption(option, definition, t));
    } else if (definition.type === 'integer') {
      subcommand.addIntegerOption((option) => configureOption(option, definition, t));
    } else if (definition.type === 'user') {
      subcommand.addUserOption((option) => configureOption(option, definition, t));
    } else if (definition.type === 'role') {
      subcommand.addRoleOption((option) => configureOption(option, definition, t));
    } else if (definition.type === 'channel') {
      subcommand.addChannelOption((option) => configureOption(option, definition, t));
    }
  }
  return subcommand;
}

export function readGroupedCommandOptions(commandName, resolver) {
  const result = {
    action: null,
    amount: null,
    channel: null,
    id: null,
    role: null,
    text: null,
    user: null,
  };

  for (const definition of GROUPED_COMMAND_OPTIONS[commandName] ?? []) {
    const getter = {
      string: 'getString',
      integer: 'getInteger',
      user: 'getUser',
      role: 'getRole',
      channel: 'getChannel',
    }[definition.type];
    result[definition.key] = resolver[getter](definition.name);
  }
  return result;
}
