import { guildConfig, guildIds, saveStore } from '../store.js';
import { componentMessage } from '../ui/components.js';

const scheduled = new Map();

async function finishGiveaway(client, guildId, giveawayId, t) {
  scheduled.delete(`${guildId}:${giveawayId}`);
  const config = guildConfig(guildId);
  const giveaway = config.giveaways?.[giveawayId];
  if (!giveaway) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const channel = guild
    ? await guild.channels.fetch(giveaway.channelId).catch(() => null)
    : null;
  const message = channel?.isTextBased()
    ? await channel.messages.fetch(giveaway.messageId).catch(() => null)
    : null;
  const reaction = message?.reactions.resolve('🎉');
  const users = reaction
    ? [...(await reaction.users.fetch()).values()].filter((user) => !user.bot)
    : [];
  const winner = users.length
    ? users[crypto.getRandomValues(new Uint32Array(1))[0] % users.length]
    : null;

  if (channel?.isTextBased()) {
    await channel.send(
      componentMessage({
        title: t('modules.giveawayEnded'),
        description: winner
          ? t('modules.giveawayWinner', { prize: giveaway.prize, winner })
          : t('modules.giveawayNoWinner', { prize: giveaway.prize }),
      }),
    );
  }

  delete config.giveaways[giveawayId];
  await saveStore();
}

export function scheduleGiveaway(client, guildId, giveawayId, t) {
  const giveaway = guildConfig(guildId).giveaways?.[giveawayId];
  if (!giveaway) return;

  const key = `${guildId}:${giveawayId}`;
  const existing = scheduled.get(key);
  if (existing) clearTimeout(existing);

  const delay = Math.max(0, Math.min(giveaway.endsAt - Date.now(), 2_147_483_647));
  const timer = setTimeout(() => {
    finishGiveaway(client, guildId, giveawayId, t).catch((error) =>
      console.error('[giveaway-finish]', { giveawayId, guildId }, error),
    );
  }, delay);
  timer.unref();
  scheduled.set(key, timer);
}

export function restoreGiveaways(client, t) {
  for (const guildId of guildIds()) {
    for (const giveawayId of Object.keys(guildConfig(guildId).giveaways ?? {})) {
      scheduleGiveaway(client, guildId, giveawayId, t);
    }
  }
}
