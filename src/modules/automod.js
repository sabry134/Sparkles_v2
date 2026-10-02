import { PermissionFlagsBits } from 'discord.js';
import { addWarning, guildConfig, saveStore } from '../store.js';
import { componentMessage, errorMessage, successMessage } from '../ui/components.js';
import { botConfig } from '../config.js';

const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<]+|discord(?:app)?\.com\/invite\/[^\s<]+|discord\.gg\/[^\s<]+/iu;
const recentJoins = new Map();

export async function configureLinkFilter(interaction, t) {
  const action = interaction.options.getString('action', true);
  const config = guildConfig(interaction.guildId);
  config.automod ??= {};

  if (action === 'status') {
    const enabled = config.automod.antiLink === true;
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
  if (config.automod.antiLink) delete config.automod.linkProtocols;
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
  if (!message.inGuild() || message.author.bot || !message.content) return;
  const config = guildConfig(message.guildId);
  if (config.whitelist?.includes(message.author.id)) return;
  const automod = config.automod;
  if (automod?.enabled === false || !automod?.antiLink) return;
  if (!hasBlockedLink(message.content, automod.linkProtocols)) return;

  const deleted = await message
    .delete()
    .then(() => true)
    .catch(() => false);
  if (!deleted) return;

  const notice = await message.channel
    .send(
      errorMessage(
        t('modules.linkRemovedTitle'),
        t('modules.linkRemovedBody', { user: message.author }),
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

  const logChannelId = config.logsChannelId;
  if (!logChannelId) return;

  const logChannel = await message.guild.channels.fetch(logChannelId).catch(() => null);
  if (logChannel?.isTextBased()) {
    await logChannel
      .send(
        componentMessage({
          title: t('modules.antiLinkLogTitle'),
          description: t('modules.antiLinkLogBody', {
            user: message.author.tag,
            channel: message.channel,
          }),
          footer: t('modules.userIdFooter', { id: message.author.id }),
        }),
      )
      .catch(() => {});
  }
}

export async function filterAutomodMessage(message, t) {
  if (!message.inGuild() || message.author.bot || !message.content) return;

  const config = guildConfig(message.guildId);
  if (config.whitelist?.includes(message.author.id)) return;

  const isBlacklisted = config.blacklist?.includes(message.author.id);
  const blockedWords = config.automod?.blockedWords ?? [];
  const blockedWordDetected =
    config.automod?.enabled !== false &&
    config.automod?.antiSwear === true &&
    containsBlockedWord(message.content, blockedWords);

  if (!isBlacklisted && !blockedWordDetected) return;
  const deleted = await message
    .delete()
    .then(() => true)
    .catch(() => false);
  if (!deleted) return;

  if (blockedWordDetected) {
    const count = addWarning(message.guildId, message.author.id, {
      at: new Date().toISOString(),
      moderatorId: message.client.user.id,
      reason: 'Automod blocked-word filter',
    });
    await saveStore();

    const threshold =
      config.automod?.warningThreshold ?? botConfig.automod.defaultWarningThreshold;
    if (config.automod?.enabled && count >= threshold && message.member?.moderatable) {
      await message.member
        .timeout(botConfig.automod.timeoutMs, 'Automod warning threshold')
        .catch(() => {});
    }
  }

  const notice = await message.channel
    .send(
      errorMessage(
        t('modules.automodRemovedTitle'),
        t('modules.automodRemovedBody', { user: message.author }),
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
}

export async function protectNewMember(member, t) {
  const config = guildConfig(member.guild.id);
  if (config.whitelist?.includes(member.id)) return;

  const now = Date.now();
  const guildJoins = (recentJoins.get(member.guild.id) ?? []).filter(
    (timestamp) => now - timestamp < 10_000,
  );
  guildJoins.push(now);
  recentJoins.set(member.guild.id, guildJoins);

  let reason = null;
  const automodEnabled = config.automod?.enabled !== false;
  if (config.blacklist?.includes(member.id)) {
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

  if (!reason) return;
  await member.send(reason).catch(() => {});
  if (member.kickable) await member.kick(reason).catch(() => {});
}
