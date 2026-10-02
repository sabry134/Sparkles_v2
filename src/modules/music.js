import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import play from 'play-dl';
import { errorMessage, successMessage } from '../ui/components.js';
import { botConfig } from '../config.js';
import { guildConfig } from '../store.js';

const guildPlayers = new Map();

function stateFor(guildId) {
  if (!guildPlayers.has(guildId)) {
    guildPlayers.set(guildId, {
      connection: null,
      current: null,
      player: createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
      }),
      queue: [],
      volume:
        guildConfig(guildId).musicSettings?.defaultVolume ??
        botConfig.music.defaultVolume,
    });
  }
  return guildPlayers.get(guildId);
}

async function resolveTrack(query, requestedBy) {
  const isUrl = /^https?:\/\//iu.test(query);
  const result = isUrl
    ? { title: query, url: query }
    : (await play.search(query, { limit: 1 }))[0];

  if (!result?.url) return null;
  return { title: result.title ?? query, url: result.url, requestedBy };
}

async function playNext(guildId) {
  const state = stateFor(guildId);
  const track = state.queue.shift();
  if (!track) {
    state.current = null;
    return;
  }

  state.current = track;
  const source = await play.stream(track.url);
  const resource = createAudioResource(source.stream, {
    inputType: source.type,
    inlineVolume: true,
  });
  resource.volume?.setVolume(state.volume / 100);
  state.player.play(resource);
}

export async function joinMemberVoice(interaction, t) {
  const channel = interaction.member.voice?.channel;
  if (!channel) {
    return interaction.reply(
      errorMessage(t('extended.missingInputTitle'), t('extended.voiceRequired')),
    );
  }

  const state = stateFor(interaction.guildId);
  state.volume =
    guildConfig(interaction.guildId).musicSettings?.defaultVolume ??
    botConfig.music.defaultVolume;
  state.connection?.destroy();
  state.connection = joinVoiceChannel({
    adapterCreator: interaction.guild.voiceAdapterCreator,
    channelId: channel.id,
    guildId: interaction.guildId,
    selfDeaf: true,
  });
  state.connection.subscribe(state.player);
  await entersState(state.connection, VoiceConnectionStatus.Ready, 15_000);

  if (!state.listenersAttached) {
    state.listenersAttached = true;
    state.player.on(AudioPlayerStatus.Idle, () => {
      playNext(interaction.guildId).catch((error) =>
        console.error('[music-next]', { guildId: interaction.guildId }, error),
      );
    });
    state.player.on('error', (error) =>
      console.error('[music-player]', { guildId: interaction.guildId }, error),
    );
  }

  return interaction.reply(
    successMessage(
      t('extended.completedTitle', { command: 'join-voice' }),
      t('extended.voiceJoined', { channel }),
    ),
  );
}

export async function enqueueTrack(interaction, t, query) {
  if (!query) {
    return interaction.reply(
      errorMessage(
        t('extended.missingInputTitle'),
        t('extended.missingInput', { option: 'text' }),
      ),
    );
  }

  const state = stateFor(interaction.guildId);
  if (!state.connection) {
    const joinResponse = await joinMemberVoice(interaction, t);
    if (!state.connection) return joinResponse;
  }

  const track = await resolveTrack(query, interaction.user.id);
  if (!track) {
    return interaction.replied
      ? interaction.followUp(errorMessage(t('extended.notFound'), t('extended.notFound')))
      : interaction.reply(errorMessage(t('extended.notFound'), t('extended.notFound')));
  }

  state.queue.push(track);
  if (state.player.state.status === AudioPlayerStatus.Idle && !state.current) {
    await playNext(interaction.guildId);
  }

  const response = successMessage(
    t('extended.completedTitle', { command: 'play' }),
    t('extended.queueAdded', { track: track.title }),
  );
  return interaction.replied
    ? interaction.followUp(response)
    : interaction.reply(response);
}

export function showQueue(interaction, t) {
  const state = stateFor(interaction.guildId);
  const tracks = [state.current, ...state.queue].filter(Boolean);
  return interaction.reply(
    successMessage(
      t('extended.completedTitle', { command: 'queue' }),
      tracks.length
        ? t('extended.queue', {
            tracks: tracks
              .slice(0, 20)
              .map((track, index) => `${index + 1}. ${track.title}`)
              .join('\n'),
          })
        : t('extended.queueEmpty'),
    ),
  );
}

export function showNowPlaying(interaction, t) {
  const current = stateFor(interaction.guildId).current;
  return interaction.reply(
    successMessage(
      t('extended.completedTitle', { command: 'now-playing' }),
      current
        ? t('extended.externalResult', { result: current.title })
        : t('extended.queueEmpty'),
    ),
  );
}

export function skipTrack(interaction, t) {
  const state = stateFor(interaction.guildId);
  const skipped = state.current;
  if (!skipped) {
    return interaction.reply(
      errorMessage(t('extended.notFound'), t('extended.queueEmpty')),
    );
  }
  state.player.stop(true);
  return interaction.reply(
    successMessage(
      t('extended.completedTitle', { command: 'skip' }),
      t('extended.skipped', { track: skipped.title }),
    ),
  );
}

export function setVolume(interaction, t, volume) {
  if (!Number.isInteger(volume) || volume < 0 || volume > botConfig.music.maximumVolume) {
    return interaction.reply(
      errorMessage(
        t('extended.missingInputTitle'),
        t('extended.missingInput', {
          option: `amount (0-${botConfig.music.maximumVolume})`,
        }),
      ),
    );
  }
  const state = stateFor(interaction.guildId);
  state.volume = volume;
  state.player.state.resource?.volume?.setVolume(volume / 100);
  return interaction.reply(
    successMessage(
      t('extended.completedTitle', { command: 'volume' }),
      t('extended.volume', { volume }),
    ),
  );
}

export async function searchTracks(interaction, t, query) {
  if (!query) {
    return interaction.reply(
      errorMessage(
        t('extended.missingInputTitle'),
        t('extended.missingInput', { option: 'text' }),
      ),
    );
  }
  const results = await play.search(query, {
    limit: botConfig.music.searchResultLimit,
  });
  const list = results
    .map((track, index) => `${index + 1}. [${track.title}](${track.url})`)
    .join('\n');
  return interaction.reply(
    successMessage(
      t('extended.completedTitle', { command: 'song-search' }),
      t('extended.list', { values: list || t('extended.notFound') }),
    ),
  );
}
