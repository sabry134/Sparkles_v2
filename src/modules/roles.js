import { PermissionFlagsBits } from 'discord.js';
import { guildConfig, saveStore } from '../store.js';
import { errorMessage, successMessage } from '../ui/components.js';

function reactionKey(emoji) {
  const customEmoji = /^<a?:[^:]+:(\d+)>$/.exec(emoji);
  return customEmoji?.[1] ?? emoji;
}

export async function configureAutoRole(interaction, t) {
  const action = interaction.options.getString('action', true);
  const config = guildConfig(interaction.guildId);

  if (action === 'disable') {
    config.autoRoleId = null;
    await saveStore();
    return interaction.reply(
      successMessage(t('modules.autoRoleTitle'), t('modules.autoRoleDisabled'), {
        ephemeral: true,
      }),
    );
  }

  const role = interaction.options.getRole('role');
  if (!role) {
    return interaction.reply(
      errorMessage(t('modules.invalidConfiguration'), t('modules.reactionRoleInvalid')),
    );
  }

  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply(
      errorMessage(t('modules.missingPermissionTitle'), t('modules.manageRolesRequired')),
    );
  }

  if (!role.editable) {
    return interaction.reply(
      errorMessage(t('modules.roleHierarchyTitle'), t('modules.roleHierarchyBody')),
    );
  }

  config.autoRoleId = role.id;
  await saveStore();

  return interaction.reply(
    successMessage(t('modules.autoRoleTitle'), t('modules.autoRoleEnabled', { role }), {
      ephemeral: true,
    }),
  );
}

export async function configureReactionRole(interaction, t) {
  const action = interaction.options.getString('action', true);
  const messageId = interaction.options.getString('message-id', true);
  const emoji = interaction.options.getString('emoji', true).trim();
  const key = `${messageId}:${reactionKey(emoji)}`;
  const config = guildConfig(interaction.guildId);
  config.reactionRoles ??= {};

  if (action === 'remove') {
    delete config.reactionRoles[key];
    await saveStore();
    return interaction.reply(
      successMessage(
        t('modules.reactionRoleTitle'),
        t('modules.reactionRoleRemoved', { emoji }),
        { ephemeral: true },
      ),
    );
  }

  const channel = interaction.options.getChannel('channel');
  const role = interaction.options.getRole('role');

  if (!channel?.isTextBased() || !role?.editable) {
    return interaction.reply(
      errorMessage(t('modules.invalidConfiguration'), t('modules.reactionRoleInvalid')),
    );
  }

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    return interaction.reply(
      errorMessage(t('modules.messageNotFound'), t('modules.messageNotFoundBody')),
    );
  }

  config.reactionRoles[key] = { channelId: channel.id, roleId: role.id, emoji };
  await message.react(emoji);

  await saveStore();
  return interaction.reply(
    successMessage(
      t('modules.reactionRoleTitle'),
      t('modules.reactionRoleAdded', { emoji, url: message.url, role }),
      { ephemeral: true },
    ),
  );
}

export async function assignAutoRole(member) {
  const roleId = guildConfig(member.guild.id).autoRoleId;
  if (!roleId) return;

  const role = await member.guild.roles.fetch(roleId).catch(() => null);
  if (role?.editable) {
    await member.roles.add(role, 'Configured automatic role').catch(() => {});
  }
}

export async function applyReactionRole(reaction, user, shouldAdd) {
  if (user.bot || !reaction.message.guild) return;

  if (reaction.partial) await reaction.fetch().catch(() => null);
  const emoji = reaction.emoji.id ?? reaction.emoji.name;
  const mapping = guildConfig(reaction.message.guild.id).reactionRoles?.[
    `${reaction.message.id}:${emoji}`
  ];
  if (!mapping) return;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  const role = await reaction.message.guild.roles.fetch(mapping.roleId).catch(() => null);
  if (!member || !role?.editable) return;

  await member.roles[shouldAdd ? 'add' : 'remove'](
    role,
    'Configured reaction role',
  ).catch(() => {});
}
