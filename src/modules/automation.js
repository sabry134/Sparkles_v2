import { EmbedBuilder } from 'discord.js';
import { guildConfig, saveStore } from '../store.js';

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').trim();
}

function responseText(template, message) {
  return template
    .replaceAll('{user}', message.author.toString())
    .replaceAll('{username}', message.author.username)
    .replaceAll('{server}', message.guild.name)
    .replaceAll('{channel}', message.channel.toString());
}

export async function handleAutoresponder(message) {
  if (!message.inGuild() || message.author.bot || !message.content) return false;
  const config = guildConfig(message.guildId);
  if (config.modules?.community === false) return false;

  const content = normalize(message.content);
  const responder = (config.autoresponders ?? []).find((entry) => {
    if (!entry?.enabled || !entry.trigger || !entry.response) return false;
    const trigger = normalize(entry.trigger);
    return entry.match === 'exact'
      ? content === trigger
      : content.includes(trigger);
  });
  if (!responder) return false;

  await message.channel
    .send({
      content: responseText(responder.response, message),
      allowedMentions: {
        parse: [],
        repliedUser: false,
      },
      reply: {
        messageReference: message.id,
        failIfNotExists: false,
      },
    })
    .catch(() => {});
  return true;
}

function configuredEmojiKey(emoji) {
  const custom = /^<a?:[A-Za-z0-9_]{2,32}:(\d{17,20})>$/u.exec(emoji ?? '');
  return custom?.[1] ?? emoji;
}

function reactionEmojiKey(reaction) {
  return reaction.emoji.id ?? reaction.emoji.name;
}

async function resolvedReaction(reaction) {
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  return reaction;
}

function starboardEmbed(message, count, emoji) {
  const embed = new EmbedBuilder()
    .setColor(0xf2b84b)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(message.content?.slice(0, 4_000) || 'No text content')
    .addFields({
      name: 'Source',
      value: \`[Jump to message](\${message.url})\`,
      inline: true,
    })
    .setFooter({ text: \`\${emoji} \${count} · #\${message.channel.name ?? 'channel'}\` })
    .setTimestamp(message.createdAt);

  const image = [...message.attachments.values()].find((attachment) =>
    attachment.contentType?.startsWith('image/'),
  );
  if (image?.url) embed.setImage(image.url);
  return embed;
}

export async function handleStarboardReaction(reaction, user) {
  if (user.bot) return false;
  await resolvedReaction(reaction);
  const message = reaction.message;
  if (!message.guildId || !message.author) return false;

  const config = guildConfig(message.guildId);
  const starboard = config.starboard;
  if (!starboard?.enabled || !starboard.channelId) return false;
  if (starboard.channelId === message.channelId) return false;
  if ((starboard.ignoreChannelIds ?? []).includes(message.channelId)) return false;
  if (message.author.id === user.id) return false;
  if (reactionEmojiKey(reaction) !== configuredEmojiKey(starboard.emoji ?? '⭐')) {
    return false;
  }

  const count = reaction.count ?? 0;
  if (count < (starboard.threshold ?? 3)) return false;

  const channel = await message.guild.channels
    .fetch(starboard.channelId)
    .catch(() => null);
  if (!channel?.isTextBased()) return false;

  config.starboardPosts ??= {};
  const existing = config.starboardPosts[message.id];
  const payload = {
    content: \`\${starboard.emoji ?? '⭐'} **\${count}**\`,
    embeds: [starboardEmbed(message, count, starboard.emoji ?? '⭐')],
    allowedMentions: { parse: [] },
  };

  if (existing?.messageId) {
    const starMessage = await channel.messages.fetch(existing.messageId).catch(() => null);
    if (starMessage) {
      await starMessage.edit(payload).catch(() => {});
      return true;
    }
  }

  const posted = await channel.send(payload).catch(() => null);
  if (!posted) return false;
  config.starboardPosts[message.id] = {
    channelId: channel.id,
    messageId: posted.id,
  };
  await saveStore();
  return true;
}
