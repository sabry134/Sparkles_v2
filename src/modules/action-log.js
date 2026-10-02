import { componentMessage } from '../ui/components.js';
import { guildConfig } from '../store.js';

async function logChannel(guild) {
  const config = guildConfig(guild.id);
  if (!config.actionLog?.enabled || !config.actionLog.channelId) return null;
  const channel = await guild.channels
    .fetch(config.actionLog.channelId)
    .catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

function hasIgnoredRole(member, config) {
  if (!member?.roles?.cache) return false;
  return (config.actionLog?.ignoreRoleIds ?? []).some((roleId) =>
    member.roles.cache.has(roleId),
  );
}

function ignoredChannel(channelId, config) {
  return (config.actionLog?.ignoreChannelIds ?? []).includes(channelId);
}

async function sendLog(guild, title, description) {
  const channel = await logChannel(guild);
  if (!channel) return;
  await channel
    .send(
      componentMessage({
        title,
        description,
        footer: new Date().toISOString(),
      }),
    )
    .catch(() => {});
}

export async function logMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  const config = guildConfig(message.guild.id);
  if (!config.actionLog?.enabled || !config.actionLog.messageDelete) return;
  if (ignoredChannel(message.channelId, config) || hasIgnoredRole(message.member, config)) return;
  const content = message.content?.slice(0, 1_500) || 'No cached text content';
  await sendLog(
    message.guild,
    'Message deleted',
    `**User:** ${message.author?.tag ?? 'Unknown'}\n**Channel:** ${message.channel}\n**Content:**\n${content}`,
  );
}

export async function logMessageUpdate(before, after) {
  if (!after.guild || after.author?.bot) return;
  const config = guildConfig(after.guild.id);
  if (!config.actionLog?.enabled || !config.actionLog.messageEdit) return;
  if (ignoredChannel(after.channelId, config) || hasIgnoredRole(after.member, config)) return;
  if (before.content === after.content) return;
  await sendLog(
    after.guild,
    'Message edited',
    `**User:** ${after.author?.tag ?? 'Unknown'}\n**Channel:** ${after.channel}\n**Before:**\n${(before.content ?? 'Unavailable').slice(0, 700)}\n**After:**\n${(after.content ?? 'Unavailable').slice(0, 700)}`,
  );
}

export async function logMemberJoin(member) {
  const config = guildConfig(member.guild.id);
  if (!config.actionLog?.enabled || !config.actionLog.memberJoin) return;
  if (hasIgnoredRole(member, config)) return;
  await sendLog(
    member.guild,
    'Member joined',
    `**User:** ${member.user.tag}\n**User ID:** ${member.id}\n**Account created:** ${member.user.createdAt.toISOString()}`,
  );
}

export async function logMemberLeave(member) {
  const config = guildConfig(member.guild.id);
  if (!config.actionLog?.enabled || !config.actionLog.memberLeave) return;
  if (hasIgnoredRole(member, config)) return;
  await sendLog(
    member.guild,
    'Member left',
    `**User:** ${member.user.tag}\n**User ID:** ${member.id}`,
  );
}

export async function logRoleChanges(before, after) {
  const config = guildConfig(after.guild.id);
  if (!config.actionLog?.enabled || !config.actionLog.roleChanges) return;
  if (hasIgnoredRole(after, config) || hasIgnoredRole(before, config)) return;

  const beforeIds = new Set(before.roles.cache.keys());
  const afterIds = new Set(after.roles.cache.keys());
  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  if (!added.length && !removed.length) return;

  const addedText = added
    .map((id) => after.guild.roles.cache.get(id)?.name ?? id)
    .join(', ');
  const removedText = removed
    .map((id) => before.guild.roles.cache.get(id)?.name ?? id)
    .join(', ');

  await sendLog(
    after.guild,
    'Member roles changed',
    `**User:** ${after.user.tag}\n**Added:** ${addedText || 'None'}\n**Removed:** ${removedText || 'None'}`,
  );
}
