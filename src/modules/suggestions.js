import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { guildConfig, saveStore } from '../store.js';
import { componentMessage, errorMessage, successMessage } from '../ui/components.js';

export async function submitSuggestion(interaction, t) {
  const config = guildConfig(interaction.guildId);
  const channel = config.suggestionsChannelId
    ? await interaction.guild.channels
        .fetch(config.suggestionsChannelId)
        .catch(() => null)
    : null;

  if (!channel?.isTextBased()) {
    return interaction.reply(
      errorMessage(t('modules.suggestionsUnavailable'), t('modules.suggestionsSetup')),
    );
  }

  const suggestionId = `${Date.now()}-${interaction.user.id}`;
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggestion:approve:${suggestionId}`)
      .setLabel(t('modules.approve'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`suggestion:deny:${suggestionId}`)
      .setLabel(t('modules.deny'))
      .setStyle(ButtonStyle.Danger),
  );

  const message = await channel.send(
    componentMessage({
      title: t('modules.newSuggestion'),
      description: interaction.options.getString('text', true),
      footer: t('modules.submittedBy', { user: interaction.user.tag }),
      actionRows: [actions],
    }),
  );

  config.suggestions ??= {};
  config.suggestions[suggestionId] = {
    authorId: interaction.user.id,
    content: interaction.options.getString('text', true),
    messageId: message.id,
    status: 'pending',
  };
  await saveStore();

  return interaction.reply(
    successMessage(
      t('modules.suggestionSubmitted'),
      t('modules.suggestionPosted', { channel }),
      {
        ephemeral: true,
      },
    ),
  );
}

export async function handleSuggestionButton(interaction, t) {
  if (!interaction.customId.startsWith('suggestion:')) return false;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply(
      errorMessage(t('modules.permissionDenied'), t('modules.reviewPermission')),
    );
    return true;
  }

  const [, decision, suggestionId] = interaction.customId.split(':');
  const config = guildConfig(interaction.guildId);
  const suggestion = config.suggestions?.[suggestionId];

  if (!suggestion || suggestion.status !== 'pending') {
    await interaction.reply(
      errorMessage(t('modules.alreadyReviewed'), t('modules.notPending')),
    );
    return true;
  }

  suggestion.status = decision;
  suggestion.reviewerId = interaction.user.id;
  suggestion.reviewedAt = new Date().toISOString();
  await saveStore();

  await interaction.update(
    componentMessage({
      title:
        decision === 'approve'
          ? t('modules.suggestionApproved')
          : t('modules.suggestionDenied'),
      description: `${suggestion.content}\n\n${t('modules.submittedBy', { user: `<@${suggestion.authorId}>` })}\n${t('modules.reviewedBy', { user: interaction.user })}`,
      accentColor: decision === 'approve' ? 0x57f287 : 0xed4245,
    }),
  );
  return true;
}
