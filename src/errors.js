import { DiscordAPIError } from 'discord.js';
import { errorMessage } from './ui/components.js';

export async function handleInteractionError(interaction, error, translate) {
  const reference = crypto.randomUUID().slice(0, 8);
  const context = {
    command: interaction.commandName ?? interaction.customId ?? 'unknown',
    guildId: interaction.guildId,
    userId: interaction.user?.id,
    reference,
  };

  console.error('[interaction-error]', context, error);

  const description =
    error instanceof DiscordAPIError
      ? translate('errors.discordApi', { reference })
      : translate('errors.genericReference', { reference });
  const response = errorMessage(translate('errors.title'), description);

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(response).catch(() => {});
    return;
  }

  await interaction.reply(response).catch(() => {});
}
