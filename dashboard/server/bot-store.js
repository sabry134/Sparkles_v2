import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';

const MAX_STORE_BYTES = 64 * 1024 * 1024;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const TRANSIENT_FILE_ERRORS = new Set(['EACCES', 'EBUSY', 'EPERM']);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validRoot(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function emptyStore() {
  return { guilds: {}, warnings: {}, moderationCases: {}, dashboardAudit: {} };
}

function normalizeRoot(value) {
  if (!validRoot(value)) {
    throw new AppError('STORE_INVALID', 500);
  }

  if (!validRoot(value.guilds)) value.guilds = {};
  if (!validRoot(value.warnings)) value.warnings = {};
  if (!validRoot(value.moderationCases)) value.moderationCases = {};
  if (!validRoot(value.dashboardAudit)) value.dashboardAudit = {};
  return value;
}

async function readStore(file) {
  try {
    const metadata = await stat(file);
    if (metadata.size > MAX_STORE_BYTES) {
      throw new AppError('STORE_TOO_LARGE', 500);
    }

    return normalizeRoot(JSON.parse(await readFile(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStore();
    if (error instanceof SyntaxError) throw new AppError('STORE_INVALID', 500);
    throw error;
  }
}

async function acquireLock(file) {
  const lockFile = `${file}.dashboard.lock`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      const handle = await open(lockFile, 'wx', 0o600);
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
        'utf8',
      );
      return async () => {
        await handle.close().catch(() => {});
        await unlink(lockFile).catch(() => {});
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      const lockMetadata = await stat(lockFile).catch(() => null);
      if (lockMetadata && Date.now() - lockMetadata.mtimeMs > STALE_LOCK_MS) {
        await unlink(lockFile).catch(() => {});
        continue;
      }

      await delay(50 + Math.floor(Math.random() * 50));
    }
  }

  throw new AppError('STORE_BUSY', 503);
}

async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!TRANSIENT_FILE_ERRORS.has(error.code)) throw error;
      if (attempt >= 5) {
        throw new AppError('STORE_BUSY', 503, { cause: error });
      }
      await delay(40 * 2 ** attempt);
    }
  }
}

async function atomicWrite(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await renameWithRetry(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function guildConfig(store, guildId) {
  const current = store.guilds[guildId];
  if (!validRoot(current)) {
    store.guilds[guildId] = { tags: {} };
  }
  return store.guilds[guildId];
}

function reactionRoles(config) {
  if (!validRoot(config.reactionRoles)) return [];

  return Object.entries(config.reactionRoles).flatMap(([key, mapping]) => {
    if (!validRoot(mapping)) return [];
    const separator = key.indexOf(':');
    if (separator === -1) return [];

    return [
      {
        key,
        messageId: key.slice(0, separator),
        emojiKey: key.slice(separator + 1),
        emoji:
          typeof mapping.emoji === 'string' ? mapping.emoji : key.slice(separator + 1),
        channelId: mapping.channelId ?? null,
        roleId: mapping.roleId ?? null,
      },
    ];
  });
}

const MODULE_KEYS = Object.freeze([
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

function moduleSettings(config) {
  return Object.fromEntries(
    MODULE_KEYS.map((key) => [key, config.modules?.[key] !== false]),
  );
}

function publicSettings(config, defaults) {
  return {
    logsChannelId: config.logsChannelId ?? null,
    suggestionsChannelId: config.suggestionsChannelId ?? null,
    giveawayChannelId: config.giveawayChannelId ?? null,
    ticketCategoryId: config.ticketCategoryId ?? null,
    autoRoleId: config.autoRoleId ?? null,
    verificationRoleId: config.verificationRoleId ?? null,
    rules: typeof config.rules === 'string' ? config.rules : '',
    currency: config.currency ?? defaults.economy.currency,
    economy: {
      begReward: config.economySettings?.begReward ?? defaults.economy.rewards.beg.amount,
      dailyReward:
        config.economySettings?.dailyReward ?? defaults.economy.rewards.daily.amount,
      weeklyReward:
        config.economySettings?.weeklyReward ?? defaults.economy.rewards.weekly.amount,
      boxPrice: config.economySettings?.boxPrice ?? defaults.economy.boxPrice,
      robberySuccessPercent:
        config.economySettings?.robberySuccessPercent ??
        defaults.economy.robberySuccessPercent,
    },
    aiChatEnabled: config.aiChatEnabled === true,
    automod: {
      enabled: config.automod?.enabled !== false,
      antiLink: config.automod?.antiLink === true,
      antiAlt: config.automod?.antiAlt === true,
      antiBot: config.features?.antiBot === true,
      antiRaid: config.automod?.antiRaid === true,
      antiSwear: config.automod?.antiSwear === true,
      antiSpam: config.automod?.antiSpam === true,
      antiMentionSpam: config.automod?.antiMentionSpam === true,
      antiCaps: config.automod?.antiCaps === true,
      antiEmojiSpam: config.automod?.antiEmojiSpam === true,
      antiAttachmentSpam: config.automod?.antiAttachmentSpam === true,
      antiLinkSpam: config.automod?.antiLinkSpam === true,
      minimumAccountAgeDays:
        config.automod?.minimumAccountAgeDays ?? defaults.automod.defaultAccountAgeDays,
      raidJoinThreshold:
        config.automod?.raidJoinThreshold ?? defaults.automod.defaultRaidJoinThreshold,
      warningThreshold:
        config.automod?.warningThreshold ?? defaults.automod.defaultWarningThreshold,
      timeoutSeconds:
        config.automod?.timeoutSeconds ?? defaults.automod.defaultTimeoutSeconds,
      spamMessageThreshold:
        config.automod?.spamMessageThreshold ??
        defaults.automod.defaultSpamMessageThreshold,
      spamWindowSeconds:
        config.automod?.spamWindowSeconds ?? defaults.automod.defaultSpamWindowSeconds,
      duplicateThreshold:
        config.automod?.duplicateThreshold ?? defaults.automod.defaultDuplicateThreshold,
      duplicateWindowSeconds:
        config.automod?.duplicateWindowSeconds ??
        defaults.automod.defaultDuplicateWindowSeconds,
      mentionThreshold:
        config.automod?.mentionThreshold ?? defaults.automod.defaultMentionThreshold,
      capsPercentage:
        config.automod?.capsPercentage ?? defaults.automod.defaultCapsPercentage,
      capsMinimumCharacters:
        config.automod?.capsMinimumCharacters ??
        defaults.automod.defaultCapsMinimumCharacters,
      emojiThreshold:
        config.automod?.emojiThreshold ?? defaults.automod.defaultEmojiThreshold,
      attachmentThreshold:
        config.automod?.attachmentThreshold ??
        defaults.automod.defaultAttachmentThreshold,
      attachmentWindowSeconds:
        config.automod?.attachmentWindowSeconds ??
        defaults.automod.defaultAttachmentWindowSeconds,
      linkThreshold:
        config.automod?.linkThreshold ?? defaults.automod.defaultLinkThreshold,
      linkWindowSeconds:
        config.automod?.linkWindowSeconds ?? defaults.automod.defaultLinkWindowSeconds,
      blockedWords: Array.isArray(config.automod?.blockedWords)
        ? config.automod.blockedWords
        : [],
      blockedRoleIds: Array.isArray(config.automod?.blockedRoleIds)
        ? config.automod.blockedRoleIds
        : [],
      exemptRoleIds: Array.isArray(config.automod?.exemptRoleIds)
        ? config.automod.exemptRoleIds
        : [],
      exemptChannelIds: Array.isArray(config.automod?.exemptChannelIds)
        ? config.automod.exemptChannelIds
        : [],
    },
    welcome: {
      enabled: config.welcome?.enabled === true,
      channelId: config.welcome?.channelId ?? null,
      message: typeof config.welcome?.message === 'string' ? config.welcome.message : '',
    },
    goodbye: {
      enabled: config.goodbye?.enabled === true,
      channelId: config.goodbye?.channelId ?? null,
      message: typeof config.goodbye?.message === 'string' ? config.goodbye.message : '',
    },
    giveaways: {
      defaultDurationSeconds:
        config.giveawaySettings?.defaultDurationSeconds ??
        defaults.giveaways.defaultDurationSeconds,
    },
    music: {
      defaultVolume: config.musicSettings?.defaultVolume ?? defaults.music.defaultVolume,
    },
    actionLog: {
      enabled: config.actionLog?.enabled === true,
      channelId: config.actionLog?.channelId ?? null,
      messageDelete: config.actionLog?.messageDelete !== false,
      messageEdit: config.actionLog?.messageEdit !== false,
      memberJoin: config.actionLog?.memberJoin !== false,
      memberLeave: config.actionLog?.memberLeave !== false,
      roleChanges: config.actionLog?.roleChanges !== false,
      ignoreRoleIds: Array.isArray(config.actionLog?.ignoreRoleIds)
        ? config.actionLog.ignoreRoleIds
        : [],
      ignoreChannelIds: Array.isArray(config.actionLog?.ignoreChannelIds)
        ? config.actionLog.ignoreChannelIds
        : [],
    },
    autoresponders: Array.isArray(config.autoresponders)
      ? config.autoresponders
          .filter((entry) => validRoot(entry))
          .slice(0, 50)
          .map((entry) => ({
            id: typeof entry.id === 'string' ? entry.id : '',
            trigger: typeof entry.trigger === 'string' ? entry.trigger : '',
            response: typeof entry.response === 'string' ? entry.response : '',
            match: entry.match === 'exact' ? 'exact' : 'contains',
            enabled: entry.enabled !== false,
          }))
      : [],
    starboard: {
      enabled: config.starboard?.enabled === true,
      channelId: config.starboard?.channelId ?? null,
      threshold: config.starboard?.threshold ?? 3,
      emoji: typeof config.starboard?.emoji === 'string' ? config.starboard.emoji : '⭐',
      ignoreChannelIds: Array.isArray(config.starboard?.ignoreChannelIds)
        ? config.starboard.ignoreChannelIds
        : [],
    },
    modules: moduleSettings(config),
    disabledCommands: Array.isArray(config.disabledCommands)
      ? [...new Set(config.disabledCommands.filter((name) => typeof name === 'string'))]
      : [],
    customCommands: validRoot(config.customCommands)
      ? Object.fromEntries(
          Object.entries(config.customCommands).filter(
            ([name, response]) =>
              /^[a-z0-9-]{1,32}$/u.test(name) && typeof response === 'string',
          ),
        )
      : {},
    reactionRoles: reactionRoles(config),
    legacyUserPolicies: {
      blockedCount: Array.isArray(config.blacklist) ? config.blacklist.length : 0,
      exemptCount: new Set([
        ...(Array.isArray(config.whitelist) ? config.whitelist : []),
        ...(Array.isArray(config.automod?.exemptUserIds)
          ? config.automod.exemptUserIds
          : []),
      ]).size,
    },
  };
}

export class BotStore {
  #file;
  #defaults;
  #writeQueue = Promise.resolve();

  constructor(file, defaults) {
    this.#file = file;
    this.#defaults = defaults;
  }

  async getGuildSettings(guildId) {
    const store = await readStore(this.#file);
    return publicSettings(guildConfig(store, guildId), this.#defaults);
  }

  async getModerationCases(guildId, { limit = 100, userId = null } = {}) {
    const store = await readStore(this.#file);
    const raw = Array.isArray(store.moderationCases[guildId])
      ? store.moderationCases[guildId]
      : [];
    const filtered = userId
      ? raw.filter((entry) => entry?.targetId === userId)
      : raw;
    return filtered
      .slice(-Math.min(250, Math.max(1, limit)))
      .reverse()
      .map((entry) => ({
        id: Number.isSafeInteger(entry?.id) ? entry.id : null,
        at: typeof entry?.at === 'string' ? entry.at : null,
        action: typeof entry?.action === 'string' ? entry.action : 'unknown',
        actorId: typeof entry?.actorId === 'string' ? entry.actorId : null,
        actorTag: typeof entry?.actorTag === 'string' ? entry.actorTag : null,
        targetId: typeof entry?.targetId === 'string' ? entry.targetId : null,
        targetTag: typeof entry?.targetTag === 'string' ? entry.targetTag : null,
        reason: typeof entry?.reason === 'string' ? entry.reason : null,
        duration: typeof entry?.duration === 'string' ? entry.duration : null,
        source: entry?.source === 'automod' ? 'automod' : 'command',
        evidence: validRoot(entry?.evidence)
          ? {
              channelId:
                typeof entry.evidence.channelId === 'string'
                  ? entry.evidence.channelId
                  : null,
              messageId:
                typeof entry.evidence.messageId === 'string'
                  ? entry.evidence.messageId
                  : null,
              content:
                typeof entry.evidence.content === 'string'
                  ? entry.evidence.content.slice(0, 2_000)
                  : null,
              reference:
                typeof entry.evidence.reference === 'string'
                  ? entry.evidence.reference.slice(0, 500)
                  : null,
              attachments: Array.isArray(entry.evidence.attachments)
                ? entry.evidence.attachments.slice(0, 10).map((attachment) => ({
                    name:
                      typeof attachment?.name === 'string'
                        ? attachment.name
                        : null,
                    url:
                      typeof attachment?.url === 'string'
                        ? attachment.url
                        : null,
                  }))
                : [],
            }
          : null,
      }));
  }

  async getDashboardAudit(guildId, { limit = 100 } = {}) {
    const store = await readStore(this.#file);
    const raw = Array.isArray(store.dashboardAudit[guildId])
      ? store.dashboardAudit[guildId]
      : [];
    return raw
      .slice(-Math.min(250, Math.max(1, limit)))
      .reverse()
      .map((entry) => ({
        id: Number.isSafeInteger(entry?.id) ? entry.id : null,
        at: typeof entry?.at === 'string' ? entry.at : null,
        actorId: typeof entry?.actorId === 'string' ? entry.actorId : null,
        actorTag: typeof entry?.actorTag === 'string' ? entry.actorTag : null,
        changes: Array.isArray(entry?.changes)
          ? entry.changes.filter((item) => typeof item === 'string').slice(0, 100)
          : [],
      }));
  }

  appendDashboardAudit(guildId, entry) {
    const operation = this.#writeQueue.then(async () => {
      await mkdir(path.dirname(this.#file), { recursive: true });
      const release = await acquireLock(this.#file);

      try {
        const store = await readStore(this.#file);
        store.dashboardAudit[guildId] ??= [];
        const entries = store.dashboardAudit[guildId];
        const id = (entries.at(-1)?.id ?? 0) + 1;
        entries.push({
          id,
          at: new Date().toISOString(),
          actorId: entry.actorId,
          actorTag: entry.actorTag,
          changes: [...new Set(entry.changes ?? [])].slice(0, 100),
        });
        if (entries.length > 2_000) entries.splice(0, entries.length - 2_000);
        await atomicWrite(this.#file, store);
        return id;
      } finally {
        await release();
      }
    });

    this.#writeQueue = operation.catch(() => {});
    return operation;
  }

  updateGuildSettings(guildId, patch) {
    return this.#mutate(guildId, (config) => {
      if (Object.hasOwn(patch, 'logsChannelId')) {
        config.logsChannelId = patch.logsChannelId;
      }
      if (Object.hasOwn(patch, 'suggestionsChannelId')) {
        config.suggestionsChannelId = patch.suggestionsChannelId;
      }
      if (Object.hasOwn(patch, 'giveawayChannelId')) {
        config.giveawayChannelId = patch.giveawayChannelId;
      }
      if (Object.hasOwn(patch, 'ticketCategoryId')) {
        config.ticketCategoryId = patch.ticketCategoryId;
      }
      if (Object.hasOwn(patch, 'autoRoleId')) {
        config.autoRoleId = patch.autoRoleId;
      }
      if (Object.hasOwn(patch, 'verificationRoleId')) {
        config.verificationRoleId = patch.verificationRoleId;
      }
      for (const field of ['rules', 'currency', 'aiChatEnabled']) {
        if (Object.hasOwn(patch, field)) config[field] = patch[field];
      }
      if (patch.automod) {
        if (!validRoot(config.automod)) config.automod = {};
        if (!validRoot(config.features)) config.features = {};
        for (const field of [
          'enabled',
          'antiLink',
          'antiAlt',
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
        ]) {
          if (Object.hasOwn(patch.automod, field)) {
            config.automod[field] = patch.automod[field];
          }
        }
        if (Object.hasOwn(patch.automod, 'antiBot')) {
          config.features.antiBot = patch.automod.antiBot;
        }
        if (Object.hasOwn(patch.automod, 'antiLink')) {
          delete config.automod.linkProtocols;
        }
      }
      for (const field of ['welcome', 'goodbye']) {
        if (patch[field]) config[field] = { ...(config[field] ?? {}), ...patch[field] };
      }
      if (patch.giveaways) {
        config.giveawaySettings = {
          ...(config.giveawaySettings ?? {}),
          ...patch.giveaways,
        };
      }
      if (patch.music) {
        config.musicSettings = { ...(config.musicSettings ?? {}), ...patch.music };
      }
      if (patch.actionLog) {
        config.actionLog = { ...(config.actionLog ?? {}), ...patch.actionLog };
      }
      if (patch.autoresponders) {
        config.autoresponders = patch.autoresponders.map((entry) => ({ ...entry }));
      }
      if (patch.starboard) {
        config.starboard = { ...(config.starboard ?? {}), ...patch.starboard };
      }
      if (patch.economy) {
        config.economySettings = {
          ...(config.economySettings ?? {}),
          ...patch.economy,
        };
      }
      if (patch.modules) {
        config.modules = { ...(config.modules ?? {}), ...patch.modules };
      }
      if (patch.disabledCommands) {
        config.disabledCommands = [...patch.disabledCommands];
      }
      if (patch.customCommands) {
        config.customCommands = { ...patch.customCommands };
      }
    });
  }

  setReactionRole(guildId, mapping) {
    return this.#mutate(guildId, (config) => {
      if (!validRoot(config.reactionRoles)) config.reactionRoles = {};
      config.reactionRoles[mapping.key] = {
        channelId: mapping.channelId,
        roleId: mapping.roleId,
        emoji: mapping.emoji,
      };
    });
  }

  removeReactionRole(guildId, key) {
    return this.#mutate(guildId, (config) => {
      if (validRoot(config.reactionRoles)) {
        delete config.reactionRoles[key];
      }
    });
  }

  clearLegacyUserPolicies(guildId) {
    return this.#mutate(guildId, (config) => {
      config.blacklist = [];
      config.whitelist = [];
      if (validRoot(config.automod)) delete config.automod.exemptUserIds;
    });
  }

  #mutate(guildId, mutation) {
    const operation = this.#writeQueue.then(async () => {
      await mkdir(path.dirname(this.#file), { recursive: true });
      const release = await acquireLock(this.#file);

      try {
        const store = await readStore(this.#file);
        const config = guildConfig(store, guildId);
        mutation(config);
        await atomicWrite(this.#file, store);
        return publicSettings(config, this.#defaults);
      } finally {
        await release();
      }
    });

    this.#writeQueue = operation.catch(() => {});
    return operation;
  }
}
