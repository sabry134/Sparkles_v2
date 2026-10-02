import { PermissionFlagsBits } from 'discord.js';
import { addWarning, guildConfig, saveStore } from '../store.js';
import { componentMessage, errorMessage, successMessage } from '../ui/components.js';
import { botConfig } from '../config.js';

const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<]+|discord(?:app)?\.com\/invite\/[^\s<]+|discord\.gg\/[^\s<]+/giu;
const HTTP_URL_PATTERN = /\bhttp:\/\/[^\s<]+/iu;
const HTTPS_URL_PATTERN = /\bhttps:\/\/[^\s<]+/iu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const recentJoins = new Map();
const recentMessages = new Map();

function escapePattern(value) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

function normalizeContent(value) {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').trim();
}

function blockedTermPattern(term) {
  const normalized = normalizeContent(term);
  if (!normalized) return null;
  const pieces = normalized.split('*').map(escapePattern);
  const body = pieces.join('[\\p{L}\\p{N}_-]*');
  const first = normalized.replace(/^\*+/u, '')[0] ?? '';
  const last = normalized.replace(/\*+$/u, '').slice(-1);
  const left = /[\p{L}\p{N}_]/u.test(first) ? '(?<![\\p{L}\\p{N}_])' : '';
  const right = /[\p{L}\p{N}_]/u.test(last) ? '(?![\\p{L}\\p{N}_])' : '';
  return new RegExp(left + body + right, 'iu');
}

export function containsBlockedWord(content, blockedWords) {
  const normalized = normalizeContent(content);
  return blockedWords.some((word) => blockedTermPattern(word)?.test(normalized) === true);
}

export function hasBlockedLink(content, linkProtocols) {
  if (!Array.isArray(linkProtocols) || linkProtocols.length === 0) {
    URL_PATTERN.lastIndex = 0;
    return URL_PATTERN.test(content);
  }

  const protocols = new Set(linkProtocols);
  return (
    (protocols.has('http') && HTTP_URL_PATTERN.test(content)) ||
    (protocols.has('https') && HTTPS_URL_PATTERN.test(content))
  );
}

function countLinks(content) {
  URL_PATTERN.lastIndex = 0;
  return [...content.matchAll(URL_PATTERN)].length;
}

function countEmoji(content) {
  EMOJI_PATTERN.lastIndex = 0;
  return [...content.matchAll(EMOJI_PATTERN)].length;
}

function capsRatio(content) {
  const letters = [...content].filter((character) => /\p{L}/u.test(character));
  if (!letters.length) return { letters: 0, percentage: 0 };
  const uppercase = letters.filter(
    (character) =>
      character === character.toLocaleUpperCase() &&
      character !== character.toLocaleLowerCase(),
  ).length;
  return {
    letters: letters.length,
    percentage: Math.round((uppercase / letters.length) * 100),
  };
}

function uniqueMentionCount(message) {
  return (
    message.mentions.users.size +
    message.mentions.roles.size +
    (message.mentions.everyone ? 1 : 0)
  );
}

function memberRoleIds(member) {
  return new Set(member?.roles?.cache?.keys?.() ?? []);
}

export function isAutomodExempt(message, config) {
  const automod = config.automod ?? {};
  if ((config.whitelist ?? []).includes(message.author.id)) return true;
  if ((automod.exemptUserIds ?? []).includes(message.author.id)) return true;
  if ((automod.exemptChannelIds ?? []).includes(message.channelId)) return true;

  const roles = memberRoleIds(message.member);
  return (automod.exemptRoleIds ?? []).some((roleId) => roles.has(roleId));
}

function isMemberExempt(member, config) {
  const automod = config.automod ?? {};
  if ((config.whitelist ?? []).includes(member.id)) return true;
  if ((automod.exemptUserIds ?? []).includes(member.id)) return true;
  const roles = memberRoleIds(member);
  return (automod.exemptRoleIds ?? []).some((roleId) => roles.has(roleId));
}

function historyKey(message) {
  return `${message.guildId}:${message.channelId}:${message.author.id}`;
}

function spamDefaults(automod) {
  return {
    messageThreshold:
      automod.spamMessageThreshold ?? botConfig.automod.defaultSpamMessageThreshold,
    windowSeconds:
      automod.spamWindowSeconds ?? botConfig.automod.defaultSpamWindowSeconds,
    duplicateThreshold:
      automod.duplicateThreshold ?? botConfig.automod.defaultDuplicateThreshold,
    duplicateWindowSeconds:
      automod.duplicateWindowSeconds ??
      botConfig.automod.defaultDuplicateWindowSeconds,
    mentionThreshold:
      automod.mentionThreshold ?? botConfig.automod.defaultMentionThreshold,
    capsPercentage:
      automod.capsPercentage ?? botConfig.automod.defaultCapsPercentage,
    capsMinimumCharacters:
      automod.capsMinimumCharacters ??
      botConfig.automod.defaultCapsMinimumCharacters,
    emojiThreshold:
      automod.emojiThreshold ?? botConfig.automod.defaultEmojiThreshold,
    attachmentThreshold:
      automod.attachmentThreshold ?? botConfig.automod.defaultAttachmentThreshold,
    attachmentWindowSeconds:
      automod.attachmentWindowSeconds ??
      botConfig.automod.defaultAttachmentWindowSeconds,
    linkThreshold:
      automod.linkThreshold ?? botConfig.automod.defaultLinkThreshold,
    linkWindowSeconds:
      automod.linkWindowSeconds ?? botConfig.automod.defaultLinkWindowSeconds,
  };
}

export function detectSpam(message, automod) {
  const settings = spamDefaults(automod);
  const now = Date.now();
  const maximumWindow =
    Math.max(
      settings.windowSeconds,
      settings.duplicateWindowSeconds,
      settings.attachmentWindowSeconds,
      settings.linkWindowSeconds,
    ) * 1000;
  const key = historyKey(message);
  const history = (recentMessages.get(key) ?? []).filter(
    (entry) => now - entry.at <= maximumWindow,
  );
  const normalized = normalizeContent(message.content);
  const current = {
    at: now,
    content: normalized,
    attachments: message.attachments.size,
    links: countLinks(message.content),
  };
  history.push(current);
  recentMessages.set(key, history);

  if (automod.antiSpam) {
    const burst = history.filter(
      (entry) => now - entry.at <= settings.windowSeconds * 1000,
    );
    if (burst.length >= settings.messageThreshold) return 'message-spam';

    if (normalized) {
      const duplicates = history.filter(
        (entry) =>
          entry.content === normalized &&
          now - entry.at <= settings.duplicateWindowSeconds * 1000,
      );
      if (duplicates.length >= settings.duplicateThreshold) return 'duplicate-spam';
    }
  }

  if (
    automod.antiMentionSpam &&
    uniqueMentionCount(message) >= settings.mentionThreshold
  ) {
    return 'mention-spam';
  }

  if (automod.antiCaps) {
    const caps = capsRatio(message.content);
    if (
      caps.letters >= settings.capsMinimumCharacters &&
      caps.percentage >= settings.capsPercentage
    ) {
      return 'caps-spam';
    }
  }

  if (automod.antiEmojiSpam && countEmoji(message.content) >= settings.emojiThreshold) {
    return 'emoji-spam';
  }

  if (automod.antiAttachmentSpam) {
    const attachments = history
      .filter(
        (entry) => now - entry.at <= settings.attachmentWindowSeconds * 1000,
      )
      .reduce((total, entry) => total + entry.attachments, 0);
    if (attachments >= settings.attachmentThreshold) return 'attachment-spam';
  }

  if (automod.antiLinkSpam) {
    const links = history
      .filter((entry) => now - entry.at <= settings.linkWindowSeconds * 1000)
      .reduce((total, entry) => total + entry.links, 0);
    if (links >= settings.linkThreshold) return 'link-spam';
  }

  return null;
}

async function automodLog(message, t, reason) {
  const config = guildConfig(message.guildId);
  if (!config.logsChannelId) return;
  const channel = await message.guild.channels.fetch(config.logsChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel
    .send(
      componentMessage({
        title: t('modules.automodLogTitle'),
        description: t('modules.automodLogBody', {
          user: message.author.tag,
          channel: message.channel,
          reason,
        }),
        footer: t('modules.userIdFooter', { id: message.author.id }),
      }),
    )
    .catch(() => {});
}

async function enforceViolation(message, t, reason) {
  const deleted = await message
    .delete()
    .then(() => true)
    .catch((error) => {
      console.error(
        '[automod-delete]',
        {
          guildId: message.guildId,
          channelId: message.channelId,
          userId: message.author.id,
          reason,
        },
        error,
      );
      return false;
    });
  if (!deleted) return false;

  const config = guildConfig(message.guildId);
  const count = addWarning(message.guildId, message.author.id, {
    at: new Date().toISOString(),
    moderatorId: message.client.user.id,
    reason: `Automod: ${reason}`,
  });
  await saveStore();

  const threshold =
    config.automod?.warningThreshold ?? botConfig.automod.defaultWarningThreshold;
  if (count >= threshold && message.member?.moderatable) {
    const timeoutMs =
      (config.automod?.timeoutSeconds ?? botConfig.automod.defaultTimeoutSeconds) *
      1000;
    await message.member.timeout(timeoutMs, `Automod: ${reason}`).catch(() => {});
  }

  const notice = await message.channel
    .send(
      errorMessage(
        t('modules.automodRemovedTitle'),
        t('modules.automodRemovedBody', { user: message.author, reason }),
        { ephemeral: false },
      ),
    )
    .catch(() => null);

  if (notice) {
    setTimeout(
      () => notice.delete().catch(() => {}),
      botConfig.automod.noticeDeleteMs,
    ).unref();
  }

  await automodLog(message, t, reason);
  return true;
}

export async function configureLinkFilter(interaction, t) {
  const action = interaction.options.getString('action', true);
  const config = guildConfig(interaction.guildId);
  config.automod ??= {};

  if (action === 'status') {
    const enabled =
      config.automod.enabled !== false && config.automod.antiLink === true;
    return interaction.reply(
      componentMessage({
        title: t('modules.antiLinkTitle'),
        description: t(enabled ? 'modules.antiLinkEnabled' : 'modules.antiLinkDisabled'),
        ephemeral: true,
      }),
    );
  }

  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply(
      errorMessage(
        t('modules.missingPermissionTitle'),
        t('modules.manageMessagesRequired'),
      ),
    );
  }

  config.automod.antiLink = action === 'enable';
  if (config.automod.antiLink) {
    config.automod.enabled = true;
    delete config.automod.linkProtocols;
  }
  await saveStore();

  return interaction.reply(
    successMessage(
      t('modules.antiLinkTitle'),
      t(config.automod.antiLink ? 'modules.antiLinkEnabled' : 'modules.antiLinkDisabled'),
      { ephemeral: true },
    ),
  );
}

export async function filterLinks(message, t) {
  if (!message.inGuild() || message.author.bot || !message.content) return false;
  const config = guildConfig(message.guildId);
  if (isAutomodExempt(message, config)) return false;
  const automod = config.automod;
  if (automod?.enabled === false || !automod?.antiLink) return false;
  if (!hasBlockedLink(message.content, automod.linkProtocols)) return false;
  return enforceViolation(message, t, 'blocked-link');
}

export async function filterAutomodMessage(message, t) {
  if (!message.inGuild() || message.author.bot || !message.content) return false;

  const config = guildConfig(message.guildId);
  const isBlacklisted = config.blacklist?.includes(message.author.id);
  if (!isBlacklisted && isAutomodExempt(message, config)) return false;

  const automod = config.automod ?? {};
  const blockedWords = automod.blockedWords ?? [];
  const blockedWordDetected =
    automod.enabled !== false &&
    automod.antiSwear === true &&
    containsBlockedWord(message.content, blockedWords);
  const spamEnabled =
    automod.antiSpam ||
    automod.antiMentionSpam ||
    automod.antiCaps ||
    automod.antiEmojiSpam ||
    automod.antiAttachmentSpam ||
    automod.antiLinkSpam;
  const spamReason =
    automod.enabled !== false && spamEnabled ? detectSpam(message, automod) : null;

  if (!isBlacklisted && !blockedWordDetected && !spamReason) return false;

  const reason = isBlacklisted
    ? 'blacklisted-user'
    : blockedWordDetected
      ? 'blocked-word'
      : spamReason;
  return enforceViolation(message, t, reason);
}

export async function protectNewMember(member, t) {
  const config = guildConfig(member.guild.id);
  const blacklisted = config.blacklist?.includes(member.id);
  if (!blacklisted && isMemberExempt(member, config)) return false;

  const now = Date.now();
  const guildJoins = (recentJoins.get(member.guild.id) ?? []).filter(
    (timestamp) => now - timestamp < 10_000,
  );
  guildJoins.push(now);
  recentJoins.set(member.guild.id, guildJoins);

  let reason = null;
  const automodEnabled = config.automod?.enabled !== false;
  if (blacklisted) {
    reason = t('modules.blacklistedMember');
  } else if (automodEnabled && config.features?.antiBot && member.user.bot) {
    reason = t('modules.automaticBotBlocked');
  } else if (automodEnabled && config.automod?.antiAlt) {
    const minimumAge =
      (config.automod.minimumAccountAgeDays ?? botConfig.automod.defaultAccountAgeDays) *
      86_400_000;
    if (now - member.user.createdTimestamp < minimumAge) {
      reason = t('modules.accountTooNew');
    }
  }

  const threshold =
    config.automod?.raidJoinThreshold ?? botConfig.automod.defaultRaidJoinThreshold;
  if (
    !reason &&
    automodEnabled &&
    config.automod?.antiRaid &&
    guildJoins.length >= threshold
  ) {
    reason = t('modules.raidProtection');
  }

  if (!reason) return false;
  await member.send(reason).catch(() => {});
  if (member.kickable) {
    await member.kick(reason).catch(() => {});
  }
  return true;
}
