import { AppError, assert } from './errors.js';

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const CUSTOM_EMOJI_PATTERN = /^<a?:[A-Za-z0-9_]{2,32}:(\d{17,20})>$/;
const UNICODE_EMOJI_PATTERN =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3)/u;
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

export function snowflake(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  assert(typeof value === 'string' && SNOWFLAKE_PATTERN.test(value), 'INVALID_INPUT');
  return value;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value, allowed) {
  assert(plainObject(value), 'INVALID_INPUT');
  assert(
    Object.keys(value).every((key) => allowed.has(key)),
    'INVALID_INPUT',
  );
}

function boolean(value) {
  assert(typeof value === 'boolean', 'INVALID_INPUT');
  return value;
}

function integer(value, minimum, maximum) {
  assert(
    Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    'INVALID_INPUT',
  );
  return value;
}

function text(value, maximumLength, { allowEmpty = true } = {}) {
  assert(typeof value === 'string', 'INVALID_INPUT');
  const normalized = value.trim();
  assert(normalized.length <= maximumLength, 'INVALID_INPUT');
  if (!allowEmpty) assert(normalized.length > 0, 'INVALID_INPUT');
  assert(!normalized.includes('\0'), 'INVALID_INPUT');
  return normalized;
}

const AUTOMOD_FIELDS = new Set([
  'enabled',
  'antiLink',
  'antiAlt',
  'antiBot',
  'antiRaid',
  'antiSwear',
  'antiSpam',
  'antiMentionSpam',
  'antiCaps',
  'antiEmojiSpam',
  'antiAttachmentSpam',
  'antiLinkSpam',
  'minimumAccountAgeDays',
  'raidJoinThreshold',
  'warningThreshold',
  'timeoutSeconds',
  'spamMessageThreshold',
  'spamWindowSeconds',
  'duplicateThreshold',
  'duplicateWindowSeconds',
  'mentionThreshold',
  'capsPercentage',
  'capsMinimumCharacters',
  'emojiThreshold',
  'attachmentThreshold',
  'attachmentWindowSeconds',
  'linkThreshold',
  'linkWindowSeconds',
  'blockedWords',
  'exemptUserIds',
  'exemptRoleIds',
  'exemptChannelIds',
]);
const MODULE_FIELDS = new Set([
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
]);

export function settingsPatch(value) {
  onlyKeys(
    value,
    new Set([
      'logsChannelId',
      'suggestionsChannelId',
      'giveawayChannelId',
      'ticketCategoryId',
      'autoRoleId',
      'verificationRoleId',
      'rules',
      'currency',
      'aiChatEnabled',
      'automod',
      'welcome',
      'goodbye',
      'giveaways',
      'music',
      'economy',
      'modules',
      'customCommands',
    ]),
  );

  const patch = {};
  for (const field of [
    'logsChannelId',
    'suggestionsChannelId',
    'giveawayChannelId',
    'ticketCategoryId',
    'autoRoleId',
    'verificationRoleId',
  ]) {
    if (Object.hasOwn(value, field)) {
      patch[field] = snowflake(value[field], field, { nullable: true });
    }
  }

  if (Object.hasOwn(value, 'rules')) patch.rules = text(value.rules, 1_900);
  if (Object.hasOwn(value, 'currency')) {
    patch.currency = text(value.currency, 24, { allowEmpty: false });
  }
  if (Object.hasOwn(value, 'aiChatEnabled')) {
    patch.aiChatEnabled = boolean(value.aiChatEnabled);
  }

  if (Object.hasOwn(value, 'automod')) {
    onlyKeys(value.automod, AUTOMOD_FIELDS);
    patch.automod = {};
    for (const field of [
      'enabled',
      'antiLink',
      'antiAlt',
      'antiBot',
      'antiRaid',
      'antiSwear',
      'antiSpam',
      'antiMentionSpam',
      'antiCaps',
      'antiEmojiSpam',
      'antiAttachmentSpam',
      'antiLinkSpam',
    ]) {
      if (Object.hasOwn(value.automod, field)) {
        patch.automod[field] = boolean(value.automod[field]);
      }
    }
    if (Object.hasOwn(value.automod, 'minimumAccountAgeDays')) {
      patch.automod.minimumAccountAgeDays = integer(
        value.automod.minimumAccountAgeDays,
        0,
        365,
      );
    }
    if (Object.hasOwn(value.automod, 'raidJoinThreshold')) {
      patch.automod.raidJoinThreshold = integer(value.automod.raidJoinThreshold, 3, 100);
    }
    if (Object.hasOwn(value.automod, 'warningThreshold')) {
      patch.automod.warningThreshold = integer(value.automod.warningThreshold, 1, 100);
    }
    if (Object.hasOwn(value.automod, 'timeoutSeconds')) {
      patch.automod.timeoutSeconds = integer(value.automod.timeoutSeconds, 10, 2_419_200);
    }
    for (const [field, minimum, maximum] of [
      ['spamMessageThreshold', 2, 50],
      ['spamWindowSeconds', 1, 120],
      ['duplicateThreshold', 2, 20],
      ['duplicateWindowSeconds', 2, 300],
      ['mentionThreshold', 2, 50],
      ['capsPercentage', 50, 100],
      ['capsMinimumCharacters', 4, 500],
      ['emojiThreshold', 3, 100],
      ['attachmentThreshold', 2, 50],
      ['attachmentWindowSeconds', 1, 120],
      ['linkThreshold', 2, 50],
      ['linkWindowSeconds', 1, 120],
    ]) {
      if (Object.hasOwn(value.automod, field)) {
        patch.automod[field] = integer(value.automod[field], minimum, maximum);
      }
    }
    for (const field of ['exemptUserIds', 'exemptRoleIds', 'exemptChannelIds']) {
      if (!Object.hasOwn(value.automod, field)) continue;
      assert(Array.isArray(value.automod[field]) && value.automod[field].length <= 50, 'INVALID_INPUT');
      patch.automod[field] = [
        ...new Set(value.automod[field].map((id) => snowflake(id, field))),
      ];
    }
    if (Object.hasOwn(value.automod, 'blockedWords')) {
      assert(
        Array.isArray(value.automod.blockedWords) &&
          value.automod.blockedWords.length <= 100,
        'INVALID_INPUT',
      );
      patch.automod.blockedWords = [
        ...new Set(
          value.automod.blockedWords.map((word) =>
            text(word, 64, { allowEmpty: false }).toLocaleLowerCase('en-US'),
          ),
        ),
      ];
    }
  }

  for (const field of ['welcome', 'goodbye']) {
    if (!Object.hasOwn(value, field)) continue;
    onlyKeys(value[field], new Set(['enabled', 'channelId', 'message']));
    patch[field] = {};
    if (Object.hasOwn(value[field], 'enabled')) {
      patch[field].enabled = boolean(value[field].enabled);
    }
    if (Object.hasOwn(value[field], 'channelId')) {
      patch[field].channelId = snowflake(value[field].channelId, 'channelId', {
        nullable: true,
      });
    }
    if (Object.hasOwn(value[field], 'message')) {
      patch[field].message = text(value[field].message, 1_900);
    }
    if (patch[field].enabled === true && patch[field].channelId === null) {
      throw new AppError('INVALID_CHANNEL', 400);
    }
  }

  if (Object.hasOwn(value, 'giveaways')) {
    onlyKeys(value.giveaways, new Set(['defaultDurationSeconds']));
    patch.giveaways = {
      defaultDurationSeconds: integer(
        value.giveaways.defaultDurationSeconds,
        10,
        604_800,
      ),
    };
  }

  if (Object.hasOwn(value, 'music')) {
    onlyKeys(value.music, new Set(['defaultVolume']));
    patch.music = {
      defaultVolume: integer(value.music.defaultVolume, 1, 200),
    };
  }

  if (Object.hasOwn(value, 'economy')) {
    onlyKeys(
      value.economy,
      new Set([
        'begReward',
        'dailyReward',
        'weeklyReward',
        'boxPrice',
        'robberySuccessPercent',
      ]),
    );
    patch.economy = {};
    for (const field of ['begReward', 'dailyReward', 'weeklyReward', 'boxPrice']) {
      if (Object.hasOwn(value.economy, field)) {
        patch.economy[field] = integer(value.economy[field], 1, 2_000_000_000);
      }
    }
    if (Object.hasOwn(value.economy, 'robberySuccessPercent')) {
      patch.economy.robberySuccessPercent = integer(
        value.economy.robberySuccessPercent,
        0,
        100,
      );
    }
  }

  if (Object.hasOwn(value, 'modules')) {
    onlyKeys(value.modules, MODULE_FIELDS);
    patch.modules = Object.fromEntries(
      Object.entries(value.modules).map(([key, enabled]) => [key, boolean(enabled)]),
    );
  }

  if (Object.hasOwn(value, 'customCommands')) {
    assert(plainObject(value.customCommands), 'INVALID_INPUT');
    const entries = Object.entries(value.customCommands);
    assert(entries.length <= 100, 'INVALID_INPUT');
    patch.customCommands = Object.fromEntries(
      entries.map(([name, response]) => {
        assert(/^[a-z0-9-]{1,32}$/u.test(name), 'INVALID_INPUT');
        return [name, text(response, 1_900, { allowEmpty: false })];
      }),
    );
  }

  assert(Object.keys(patch).length > 0, 'INVALID_INPUT');
  return patch;
}

export function reactionRoleInput(value) {
  onlyKeys(value, new Set(['channelId', 'messageId', 'roleId', 'emoji']));

  const emoji = typeof value.emoji === 'string' ? value.emoji.trim() : '';
  const emojiLength = [...emoji].length;
  assert(emojiLength >= 1 && emojiLength <= 64, 'INVALID_EMOJI');
  assert(!/[\r\n\0]/u.test(emoji), 'INVALID_EMOJI');

  const customMatch = CUSTOM_EMOJI_PATTERN.exec(emoji);
  const unicodeEmojiIsValid =
    !customMatch &&
    !/\s/u.test(emoji) &&
    [...graphemeSegmenter.segment(emoji)].length === 1 &&
    UNICODE_EMOJI_PATTERN.test(emoji);
  assert(Boolean(customMatch) || unicodeEmojiIsValid, 'INVALID_EMOJI');
  const emojiKey = customMatch?.[1] ?? emoji;

  return {
    channelId: snowflake(value.channelId, 'channelId'),
    messageId: snowflake(value.messageId, 'messageId'),
    roleId: snowflake(value.roleId, 'roleId'),
    emoji,
    emojiKey,
    key: `${value.messageId}:${emojiKey}`,
  };
}

export function reactionRoleKeyInput(value) {
  onlyKeys(value, new Set(['key']));
  assert(
    typeof value.key === 'string' &&
      value.key.length >= 19 &&
      value.key.length <= 256 &&
      /^\d{17,20}:.+$/u.test(value.key) &&
      !/[\r\n\0]/u.test(value.key),
    'INVALID_INPUT',
  );
  return value.key;
}

export function guildId(value) {
  if (!SNOWFLAKE_PATTERN.test(value)) {
    throw new AppError('GUILD_NOT_AVAILABLE', 404);
  }
  return value;
}
