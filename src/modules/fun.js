import { componentMessage } from '../ui/components.js';

export function flipCoin(interaction, t) {
  const result = Math.random() < 0.5 ? t('modules.heads') : t('modules.tails');
  return interaction.reply(
    componentMessage({ title: t('modules.coinFlip'), description: result }),
  );
}

export function rollDice(interaction, t) {
  const sides = interaction.options.getInteger('sides') ?? 6;
  const result = Math.floor(Math.random() * sides) + 1;
  return interaction.reply(
    componentMessage({
      title: t('modules.diceTitle', { sides }),
      description: t('modules.diceBody', { result }),
    }),
  );
}
