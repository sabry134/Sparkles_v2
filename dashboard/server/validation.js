import { catalog } from '../../src/catalog.js';
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
  'blockedRoleIds',
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
      'automod',
      'welcome',
      'goodbye',
      'giveaways',
      'music',
      'economy',
      'actionLog',
      'autoresponders',
      'starboard',
      'modules',
      'disabledCommands',
      'commandPermissions',
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
    for (const field of [
      'blockedRoleIds',
      'exemptRoleIds',
      'exemptChannelIds',
    ]) {
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

  if (Object.hasOwn(value, 'actionLog')) {
    onlyKeys(
      value.actionLog,
      new Set([
        'enabled',
        'channelId',
        'messageDelete',
        'messageEdit',
        'memberJoin',
        'memberLeave',
        'roleChanges',
        'ignoreRoleIds',
        'ignoreChannelIds',
      ]),
    );
    patch.actionLog = {
      enabled: boolean(value.actionLog.enabled),
      channelId: snowflake(value.actionLog.channelId, 'channelId', {
        nullable: true,
      }),
      messageDelete: boolean(value.actionLog.messageDelete),
      messageEdit: boolean(value.actionLog.messageEdit),
      memberJoin: boolean(value.actionLog.memberJoin),
      memberLeave: boolean(value.actionLog.memberLeave),
      roleChanges: boolean(value.actionLog.roleChanges),
      ignoreRoleIds: Array.isArray(value.actionLog.ignoreRoleIds)
        ? [...new Set(value.actionLog.ignoreRoleIds.map((id) => snowflake(id, 'roleId')))]
        : [],
      ignoreChannelIds: Array.isArray(value.actionLog.ignoreChannelIds)
        ? [
            ...new Set(
              value.actionLog.ignoreChannelIds.map((id) =>
                snowflake(id, 'channelId'),
              ),
            ),
          ]
        : [],
    };
  }

  if (Object.hasOwn(value, 'autoresponders')) {
    assert(Array.isArray(value.autoresponders), 'INVALID_INPUT');
    assert(value.autoresponders.length <= 50, 'INVALID_INPUT');
    patch.autoresponders = value.autoresponders.map((entry) => {
      onlyKeys(entry, new Set(['id', 'trigger', 'response', 'match', 'enabled']));
      assert(
        typeof entry.id === 'string' && /^[a-z0-9-]{1,64}$/u.test(entry.id),
        'INVALID_INPUT',
      );
      assert(['contains', 'exact'].includes(entry.match), 'INVALID_INPUT');
      return {
        id: entry.id,
        trigger: text(entry.trigger, 100, { allowEmpty: false }),
        response: text(entry.response, 1_900, { allowEmpty: false }),
        match: entry.match,
        enabled: boolean(entry.enabled),
      };
    });
  }

  if (Object.hasOwn(value, 'starboard')) {
    onlyKeys(
      value.starboard,
      new Set(['enabled', 'channelId', 'threshold', 'emoji', 'ignoreChannelIds']),
    );
    assert(Array.isArray(value.starboard.ignoreChannelIds), 'INVALID_INPUT');
    assert(value.starboard.ignoreChannelIds.length <= 50, 'INVALID_INPUT');
    patch.starboard = {
      enabled: boolean(value.starboard.enabled),
      channelId: snowflake(value.starboard.channelId, 'channelId', {
        nullable: true,
      }),
      threshold: integer(value.starboard.threshold, 1, 100),
      emoji: emojiInput(value.starboard.emoji).emoji,
      ignoreChannelIds: [
        ...new Set(
          value.starboard.ignoreChannelIds.map((id) =>
            snowflake(id, 'channelId'),
          ),
        ),
      ],
    };
  }

  if (Object.hasOwn(value, 'modules')) {
    onlyKeys(value.modules, MODULE_FIELDS);
    patch.modules = Object.fromEntries(
      Object.entries(value.modules).map(([key, enabled]) => [key, boolean(enabled)]),
    );
  }

  if (Object.hasOwn(value, 'disabledCommands')) {
    assert(Array.isArray(value.disabledCommands), 'INVALID_INPUT');
    assert(value.disabledCommands.length <= 250, 'INVALID_INPUT');
    const commandNames = new Set(catalog.map(({ name }) => name));
    patch.disabledCommands = [
      ...new Set(
        value.disabledCommands.map((name) => {
          assert(
            typeof name === 'string' &&
              /^[a-z0-9-]{1,64}$/u.test(name) &&
              commandNames.has(name),
            'INVALID_INPUT',
          );
          return name;
        }),
      ),
    ];
  }

  if (Object.hasOwn(value, 'commandPermissions')) {
    assert(plainObject(value.commandPermissions), 'INVALID_INPUT');
    const commandNames = new Set(catalog.map(({ name }) => name));
    const entries = Object.entries(value.commandPermissions);
    assert(entries.length <= 250, 'INVALID_INPUT');
    patch.commandPermissions = Object.fromEntries(
      entries.map(([name, rule]) => {
        assert(commandNames.has(name), 'INVALID_INPUT');
        assert(plainObject(rule), 'INVALID_INPUT');
        onlyKeys(rule, new Set(['roleMode', 'roleIds', 'channelMode', 'channelIds']));
        assert(
          ['allow-all-except', 'deny-all-except'].includes(rule.roleMode),
          'INVALID_INPUT',
        );
        assert(
          ['allow-all-except', 'deny-all-except'].includes(rule.channelMode),
          'INVALID_INPUT',
        );
        assert(Array.isArray(rule.roleIds) && rule.roleIds.length <= 50, 'INVALID_INPUT');
        assert(
          Array.isArray(rule.channelIds) && rule.channelIds.length <= 50,
          'INVALID_INPUT',
        );
        return [
          name,
          {
            roleMode: rule.roleMode,
            roleIds: [...new Set(rule.roleIds.map((id) => snowflake(id, 'roleId')))],
            channelMode: rule.channelMode,
            channelIds: [
              ...new Set(rule.channelIds.map((id) => snowflake(id, 'channelId'))),
            ],
          },
        ];
      }),
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

function emojiInput(value) {
  const emoji = typeof value === 'string' ? value.trim() : '';
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

  return {
    emoji,
    emojiKey: customMatch?.[1] ?? emoji,
  };
}

function webUrl(value, field, { nullable = true } = {}) {
  if (nullable && (value === null || value === '')) return null;
  assert(typeof value === 'string' && value.length <= 2_048, 'INVALID_INPUT');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError('INVALID_INPUT', 400);
  }
  assert(['http:', 'https:'].includes(url.protocol), 'INVALID_INPUT');
  return url.toString();
}

function messageLink(value, expectedGuildId) {
  assert(typeof value === 'string' && value.length <= 256, 'INVALID_MESSAGE_LINK');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError('INVALID_MESSAGE_LINK', 400);
  }

  assert(
    ['discord.com', 'ptb.discord.com', 'canary.discord.com'].includes(url.hostname),
    'INVALID_MESSAGE_LINK',
  );
  const match = /^\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})\/?$/u.exec(
    url.pathname,
  );
  assert(Boolean(match), 'INVALID_MESSAGE_LINK');
  if (expectedGuildId) assert(match[1] === expectedGuildId, 'INVALID_MESSAGE_LINK');
  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  };
}

function embedPayload(value) {
  onlyKeys(
    value,
    new Set([
      'title',
      'description',
      'color',
      'url',
      'authorName',
      'authorUrl',
      'authorIconUrl',
      'thumbnailUrl',
      'imageUrl',
      'footerText',
      'footerIconUrl',
      'timestamp',
      'fields',
    ]),
  );

  const result = {};
  if (Object.hasOwn(value, 'title')) result.title = text(value.title, 256);
  if (Object.hasOwn(value, 'description')) {
    result.description = text(value.description, 4_096);
  }
  if (Object.hasOwn(value, 'url')) result.url = webUrl(value.url, 'url');
  if (Object.hasOwn(value, 'color')) {
    assert(
      typeof value.color === 'string' && /^#?[0-9a-f]{6}$/iu.test(value.color),
      'INVALID_INPUT',
    );
    result.color = Number.parseInt(value.color.replace('#', ''), 16);
  }
  if (Object.hasOwn(value, 'authorName') && value.authorName.trim()) {
    result.author = {
      name: text(value.authorName, 256, { allowEmpty: false }),
    };
    const authorUrl = webUrl(value.authorUrl ?? null, 'authorUrl');
    const iconUrl = webUrl(value.authorIconUrl ?? null, 'authorIconUrl');
    if (authorUrl) result.author.url = authorUrl;
    if (iconUrl) result.author.icon_url = iconUrl;
  }
  const thumbnail = webUrl(value.thumbnailUrl ?? null, 'thumbnailUrl');
  if (thumbnail) result.thumbnail = { url: thumbnail };
  const image = webUrl(value.imageUrl ?? null, 'imageUrl');
  if (image) result.image = { url: image };
  if (Object.hasOwn(value, 'footerText') && value.footerText.trim()) {
    result.footer = {
      text: text(value.footerText, 2_048, { allowEmpty: false }),
    };
    const iconUrl = webUrl(value.footerIconUrl ?? null, 'footerIconUrl');
    if (iconUrl) result.footer.icon_url = iconUrl;
  }
  if (Object.hasOwn(value, 'timestamp')) {
    result.timestamp = boolean(value.timestamp) ? new Date().toISOString() : undefined;
  }
  if (Object.hasOwn(value, 'fields')) {
    assert(Array.isArray(value.fields) && value.fields.length <= 25, 'INVALID_INPUT');
    result.fields = value.fields.map((field) => {
      onlyKeys(field, new Set(['name', 'value', 'inline']));
      return {
        name: text(field.name, 256, { allowEmpty: false }),
        value: text(field.value, 1_024, { allowEmpty: false }),
        inline: field.inline === true,
      };
    });
  }

  assert(
    Boolean(
      result.title ||
        result.description ||
        result.author ||
        result.thumbnail ||
        result.image ||
        result.footer ||
        result.timestamp ||
        result.fields?.length,
    ),
    'INVALID_INPUT',
  );
  return result;
}

export function reactionRoleInput(value, expectedGuildId) {
  onlyKeys(value, new Set(['messageLink', 'roleId', 'emoji']));
  const target = messageLink(value.messageLink, expectedGuildId);
  const { emoji, emojiKey } = emojiInput(value.emoji);

  return {
    channelId: target.channelId,
    messageId: target.messageId,
    roleId: snowflake(value.roleId, 'roleId'),
    emoji,
    emojiKey,
    key: `${target.messageId}:${emojiKey}`,
  };
}

export function reactionRoleEmbedInput(value) {
  onlyKeys(value, new Set(['channelId', 'roleId', 'emoji', 'content', 'embed']));
  const { emoji, emojiKey } = emojiInput(value.emoji);
  return {
    channelId: snowflake(value.channelId, 'channelId'),
    roleId: snowflake(value.roleId, 'roleId'),
    emoji,
    emojiKey,
    content:
      value.content == null || value.content === ''
        ? ''
        : text(value.content, 2_000),
    embed: embedPayload(value.embed),
  };
}

export function dashboardEmbedInput(value) {
  onlyKeys(value, new Set(['channelId', 'content', 'embed']));
  return {
    channelId: snowflake(value.channelId, 'channelId'),
    content:
      value.content == null || value.content === ''
        ? ''
        : text(value.content, 2_000),
    embed: embedPayload(value.embed),
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
