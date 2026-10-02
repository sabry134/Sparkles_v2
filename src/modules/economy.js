import { guildConfig, saveStore } from '../store.js';
import { errorMessage, successMessage } from '../ui/components.js';
import { botConfig } from '../config.js';

const rewards = botConfig.economy.rewards;

function account(guildId, userId) {
  const config = guildConfig(guildId);
  config.economy ??= {};
  config.economy[userId] ??= { balance: 0, cooldowns: {} };
  return config.economy[userId];
}

export async function claimReward(interaction, rewardName, t) {
  const config = guildConfig(interaction.guildId);
  const reward = rewards[rewardName];
  const configuredAmount =
    config.economySettings?.[
      { beg: 'begReward', daily: 'dailyReward', weekly: 'weeklyReward' }[rewardName]
    ];
  const amount = configuredAmount ?? reward.amount;
  const userAccount = account(interaction.guildId, interaction.user.id);
  const availableAt = userAccount.cooldowns[rewardName] ?? 0;

  if (Date.now() < availableAt) {
    return interaction.reply(
      errorMessage(
        t('modules.rewardUnavailable'),
        t('modules.rewardRetry', { time: `<t:${Math.ceil(availableAt / 1000)}:R>` }),
      ),
    );
  }

  userAccount.balance += amount;
  userAccount.cooldowns[rewardName] = Date.now() + reward.cooldownMs;
  await saveStore();

  return interaction.reply(
    successMessage(
      t('modules.rewardClaimed'),
      t('modules.rewardBody', {
        amount: amount.toLocaleString(),
        balance: userAccount.balance.toLocaleString(),
        currency: config.currency ?? botConfig.economy.currency,
      }),
    ),
  );
}

export async function showBalance(interaction, t) {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const userAccount = account(interaction.guildId, user.id);
  return interaction.reply(
    successMessage(
      t('modules.balanceTitle', { user: user.username }),
      t('modules.balanceBody', {
        balance: userAccount.balance.toLocaleString(),
        currency: guildConfig(interaction.guildId).currency ?? botConfig.economy.currency,
      }),
    ),
  );
}
