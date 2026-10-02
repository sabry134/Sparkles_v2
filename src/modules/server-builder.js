import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { errorMessage, successMessage } from '../ui/components.js';

export async function createServerChannel(interaction, type, t) {
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply(
      errorMessage(
        t('modules.missingPermissionTitle'),
        t('modules.manageChannelsRequired'),
      ),
    );
  }

  const channel = await interaction.guild.channels.create({
    name: interaction.options.getString('name', true),
    type,
    reason: `Created by ${interaction.user.tag}`,
  });

  return interaction.reply(
    successMessage(
      t('modules.channelCreated'),
      t('modules.channelCreatedBody', { channel }),
    ),
  );
}

export async function buildStarterServer(interaction, t) {
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply(
      errorMessage(
        t('modules.missingPermissionTitle'),
        t('modules.manageChannelsRequired'),
      ),
    );
  }

  await interaction.deferReply({ ephemeral: true });
  const categoryName = t('modules.communityCategory');
  let category = interaction.guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory && channel.name === categoryName,
  );

  category ??= await interaction.guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
    reason: `Starter layout requested by ${interaction.user.tag}`,
  });

  const channelNames = [
    t('modules.welcomeChannel'),
    t('modules.rulesChannel'),
    t('modules.generalChannel'),
    t('modules.suggestionsChannel'),
  ];
  const created = [];

  for (const name of channelNames) {
    const existing = interaction.guild.channels.cache.find(
      (channel) => channel.parentId === category.id && channel.name === name,
    );
    if (existing) continue;

    const channel = await interaction.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: category.id,
      reason: `Starter layout requested by ${interaction.user.tag}`,
    });
    created.push(channel);
  }

  return interaction.editReply(
    successMessage(
      t('modules.serverBuilt'),
      t('modules.serverBuiltBody', { count: created.length, category }),
    ),
  );
}
