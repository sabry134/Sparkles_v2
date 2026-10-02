import {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits,
} from 'discord.js';
import { catalog } from '../catalog.js';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { guildConfig, saveStore } from '../store.js';
import { componentMessage, errorMessage, successMessage } from '../ui/components.js';
import {
  enqueueTrack,
  joinMemberVoice,
  searchTracks,
  setVolume,
  showNowPlaying,
  showQueue,
  skipTrack,
} from './music.js';
import { scheduleGiveaway } from './giveaways.js';
import { botConfig } from '../config.js';
import { readGroupedCommandOptions } from '../command-routes.js';
import { containsBlockedWord, hasBlockedLink } from './automod.js';

const DEFAULT_DASHBOARD_URL = 'http://localhost:5173';
const effectiveCommandNames = new WeakMap();

function options(interaction) {
  return readGroupedCommandOptions(
    effectiveCommandNames.get(interaction),
    interaction.options,
  );
}

function commandTitle(interaction, t) {
  return t('extended.completedTitle', {
    command: effectiveCommandNames.get(interaction) ?? interaction.commandName,
  });
}

function completed(interaction, t, description, fields = []) {
  return interaction.reply(
    successMessage(commandTitle(interaction, t), description, { fields }),
  );
}

function missing(interaction, t, option) {
  return interaction.reply(
    errorMessage(t('extended.missingInputTitle'), t('extended.missingInput', { option })),
  );
}

function denied(interaction, t, permission) {
  return interaction.reply(
    errorMessage(t('extended.permissionTitle'), t('extended.permission', { permission })),
  );
}

function hasPermission(interaction, permission) {
  return interaction.memberPermissions?.has(permission) === true;
}

function featureConfig(interaction) {
  const config = guildConfig(interaction.guildId);
  config.features ??= {};
  return config.features;
}

function economyAccount(interaction, userId) {
  const config = guildConfig(interaction.guildId);
  config.economy ??= {};
  config.economy[userId] ??= {
    balance: 0,
    bank: 0,
    boxes: 0,
    cooldowns: {},
    inventory: {},
    xp: 0,
  };
  return config.economy[userId];
}

function code() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
}

async function setFeature(interaction, t, featureName) {
  const { action } = options(interaction);
  if (!action) return missing(interaction, t, 'action');

  const enabled = !['disable', 'off', 'false'].includes(action.toLowerCase());
  featureConfig(interaction)[featureName] = enabled;
  await saveStore();
  return completed(interaction, t, t(enabled ? 'extended.enabled' : 'extended.disabled'));
}

async function updatePoints(interaction, t, direction) {
  if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
    return denied(interaction, t, 'Manage Server');
  }

  const { amount, user } = options(interaction);
  if (!user) return missing(interaction, t, 'user');
  if (!amount || amount < 1) return missing(interaction, t, 'amount');

  const config = guildConfig(interaction.guildId);
  config.tournamentPoints ??= {};
  const current = config.tournamentPoints[user.id] ?? 0;
  config.tournamentPoints[user.id] = Math.max(0, current + amount * direction);
  await saveStore();

  return completed(
    interaction,
    t,
    t(direction > 0 ? 'extended.added' : 'extended.removed', {
      target: user,
      value: amount,
    }),
  );
}

async function purgeFiltered(interaction, t, predicate) {
  if (!hasPermission(interaction, PermissionFlagsBits.ManageMessages)) {
    return denied(interaction, t, 'Manage Messages');
  }
  if (!interaction.channel?.isTextBased() || typeof interaction.channel.bulkDelete !== 'function') {
    return interaction.reply(
      errorMessage(t('extended.permissionTitle'), t('extended.textChannelRequired')),
    );
  }

  const input = options(interaction);
  const amount = Math.min(100, Math.max(1, input.amount ?? 50));
  const fetched = await interaction.channel.messages.fetch({ limit: 100 });
  const selected = fetched
    .filter((message) => predicate(message))
    .first(amount);
  if (!selected.length) {
    return completed(interaction, t, t('extended.purgeEmpty'));
  }
  const deleted = await interaction.channel.bulkDelete(selected, true);
  return completed(
    interaction,
    t,
    t('extended.purgeCompleted', { count: deleted.size }),
  );
}

async function updatePremium(interaction, t, enabled) {
  if (!hasPermission(interaction, PermissionFlagsBits.Administrator)) {
    return denied(interaction, t, 'Administrator');
  }

  const { user } = options(interaction);
  const targetId = user?.id ?? interaction.guildId;
  const config = guildConfig(interaction.guildId);
  config.premium ??= { guild: false, users: {} };

  if (targetId === interaction.guildId) config.premium.guild = enabled;
  else config.premium.users[targetId] = enabled;

  await saveStore();
  return completed(interaction, t, t(enabled ? 'extended.enabled' : 'extended.disabled'));
}

async function createClaimCode(interaction, t) {
  if (!hasPermission(interaction, PermissionFlagsBits.Administrator)) {
    return denied(interaction, t, 'Administrator');
  }

  const config = guildConfig(interaction.guildId);
  const claimCode = code();
  config.claimCodes ??= {};
  config.claimCodes[claimCode] = {
    createdAt: new Date().toISOString(),
    createdBy: interaction.user.id,
    redeemedBy: null,
  };
  await saveStore();
  return completed(interaction, t, t('extended.codeCreated', { code: claimCode }));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function isPrivateAddress(address) {
  const normalized = address.toLowerCase();
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8')
  ) {
    return true;
  }

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mappedIpv4 ?? normalized;
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;

  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] >= 224 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 0) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 198 && [18, 19, 51].includes(parts[1])) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)
  );
}

export const securityInternals = Object.freeze({ isPrivateAddress });

async function safeWebsiteStatus(rawUrl) {
  const url = new URL(rawUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    url.hostname.toLowerCase() === 'localhost' ||
    url.hostname.toLowerCase().endsWith('.local')
  ) {
    throw new Error('Unsafe URL');
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error('Private network targets are not allowed');
  }

  const pinned = addresses[0];
  const startedAt = performance.now();
  const requester = url.protocol === 'https:' ? httpsRequest : httpRequest;

  const status = await new Promise((resolve, reject) => {
    const request = requester(
      url,
      {
        headers: { 'User-Agent': 'SparklesBot/1.0' },
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions?.all) callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
        method: 'HEAD',
        servername: url.hostname,
        timeout: 8_000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.once('error', reject);
    request.once('timeout', () => request.destroy(new Error('Request timed out')));
    request.end();
  });

  return { duration: Math.round(performance.now() - startedAt), status };
}

function eventStartTime(value) {
  const relative = /^(\d{1,4})\s*(m|h|d)$/i.exec(value.trim());
  if (relative) {
    const milliseconds = { m: 60_000, h: 3_600_000, d: 86_400_000 }[
      relative[2].toLowerCase()
    ];
    return new Date(Date.now() + Number(relative[1]) * milliseconds);
  }
  return new Date(value);
}

export async function handleExtendedCommand(commandName, interaction, t, client) {
  effectiveCommandNames.set(interaction, commandName);
  const input = options(interaction);
  const config = guildConfig(interaction.guildId);

  switch (commandName) {
    case 'achievement': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      if (!input.user) return missing(interaction, t, 'user');
      if (!input.text) return missing(interaction, t, 'text');

      config.achievements ??= {};
      config.achievements[input.user.id] ??= [];
      const shouldRemove = input.action?.toLowerCase() === 'remove';
      if (shouldRemove) {
        config.achievements[input.user.id] = config.achievements[input.user.id].filter(
          (entry) => entry !== input.text,
        );
      } else if (!config.achievements[input.user.id].includes(input.text)) {
        config.achievements[input.user.id].push(input.text);
      }
      await saveStore();
      return completed(
        interaction,
        t,
        t(shouldRemove ? 'extended.removed' : 'extended.added', {
          target: input.user,
          value: input.text,
        }),
      );
    }

    case 'add-points': {
      return updatePoints(interaction, t, 1);
    }

    case 'add-premium': {
      return updatePremium(interaction, t, true);
    }

    case 'alert': {
      if (!hasPermission(interaction, PermissionFlagsBits.Administrator)) {
        return denied(interaction, t, 'Administrator');
      }
      if (!input.text) return missing(interaction, t, 'text');
      const target = input.channel ?? interaction.channel;
      if (!target?.isTextBased()) return missing(interaction, t, 'channel');
      await target.send(
        componentMessage({
          title: commandTitle(interaction, t),
          description: input.text,
          accentColor: 0xfee75c,
        }),
      );
      return completed(interaction, t, t('extended.messageSent'));
    }

    case 'anti-alt': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      config.automod ??= {};
      config.automod.minimumAccountAgeDays = Math.max(
        0,
        input.amount ?? botConfig.automod.defaultAccountAgeDays,
      );
      config.automod.antiAlt = input.action !== 'disable';
      if (config.automod.antiAlt) config.automod.enabled = true;
      await saveStore();
      return completed(interaction, t, t('extended.saved'));
    }

    case 'anti-bot': {
      if (input.action !== 'disable') {
        config.automod ??= {};
        config.automod.enabled = true;
      }
      return setFeature(interaction, t, 'antiBot');
    }

    case 'anti-raid': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      config.automod ??= {};
      config.automod.antiRaid = input.action !== 'disable';
      if (config.automod.antiRaid) config.automod.enabled = true;
      config.automod.raidJoinThreshold = Math.max(
        3,
        input.amount ?? botConfig.automod.defaultRaidJoinThreshold,
      );
      await saveStore();
      return completed(interaction, t, t('extended.saved'));
    }

    case 'anti-spam': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      config.automod ??= {};
      config.automod.antiSpam = input.action !== 'disable';
      if (config.automod.antiSpam) config.automod.enabled = true;
      if (input.spamMessageThreshold !== null) {
        config.automod.spamMessageThreshold = Math.min(
          50,
          Math.max(2, input.spamMessageThreshold),
        );
      }
      if (input.spamWindowSeconds !== null) {
        config.automod.spamWindowSeconds = Math.min(
          120,
          Math.max(1, input.spamWindowSeconds),
        );
      }
      if (input.duplicateThreshold !== null) {
        config.automod.duplicateThreshold = Math.min(
          20,
          Math.max(2, input.duplicateThreshold),
        );
      }
      await saveStore();
      return completed(interaction, t, t('extended.saved'));
    }

    case 'anti-swear': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      config.automod ??= {};
      config.automod.antiSwear = input.action !== 'disable';
      if (config.automod.antiSwear) config.automod.enabled = true;
      if (input.text) {
        config.automod.blockedWords = [
          ...new Set(
            input.text
              .split(',')
              .map((word) => word.trim().toLowerCase().slice(0, 64))
              .filter(Boolean)
              .slice(0, 100),
          ),
        ];
      }
      await saveStore();
      return completed(interaction, t, t('extended.saved'));
    }

    case 'automod-test': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      const automod = config.automod ?? {};
      const exempt =
        (automod.exemptChannelIds ?? []).includes(interaction.channelId) ||
        (automod.exemptRoleIds ?? []).some((roleId) =>
          interaction.member.roles.cache.has(roleId),
        );
      const values = [
        `**engine:** ${automod.enabled !== false ? 'on' : 'off'}`,
        `**you are exempt:** ${exempt ? 'yes' : 'no'}`,
        `**blocked term match:** ${
          automod.antiSwear &&
          containsBlockedWord(input.text ?? '', automod.blockedWords ?? [])
            ? 'yes'
            : 'no'
        }`,
        `**blocked link match:** ${
          automod.antiLink && hasBlockedLink(input.text ?? '', automod.linkProtocols)
            ? 'yes'
            : 'no'
        }`,
      ].join('\n');
      return completed(interaction, t, t('extended.list', { values }));
    }

    case 'auto-status': {
      const automod = config.automod ?? {};
      const values = [
        ...Object.entries(automod).map(
          ([key, value]) => `**${key}:** ${JSON.stringify(value)}`,
        ),
        `**exempt roles:** ${(automod.exemptRoleIds ?? []).length}`,
        `**exempt channels:** ${(automod.exemptChannelIds ?? []).length}`,
        `**blocked roles:** ${(automod.blockedRoleIds ?? []).length}`,
      ].join('\n');
      return completed(
        interaction,
        t,
        t('extended.list', { values: values || t('extended.listEmpty') }),
      );
    }

    case 'automod': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      config.automod ??= {};
      config.automod.enabled = input.action !== 'disable';
      config.automod.warningThreshold = Math.max(
        1,
        input.amount ?? botConfig.automod.defaultWarningThreshold,
      );
      await saveStore();
      return completed(interaction, t, t('extended.saved'));
    }

    case 'backup': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      const safeBackup = {
        guildId: interaction.guildId,
        exportedAt: new Date().toISOString(),
        settings: config,
      };
      const attachment = new AttachmentBuilder(
        Buffer.from(JSON.stringify(safeBackup, null, 2)),
        { name: `sparkles-backup-${interaction.guildId}.json` },
      );
      return interaction.reply({
        ...componentMessage({
          title: commandTitle(interaction, t),
          description: t('extended.backupReady'),
          ephemeral: true,
        }),
        files: [attachment],
      });
    }

    case 'purge-user': {
      if (!input.user) return missing(interaction, t, 'user');
      return purgeFiltered(
        interaction,
        t,
        (message) => message.author.id === input.user.id,
      );
    }

    case 'purge-links': {
      return purgeFiltered(
        interaction,
        t,
        (message) => Boolean(message.content) && hasBlockedLink(message.content),
      );
    }

    case 'purge-attachments': {
      return purgeFiltered(interaction, t, (message) => message.attachments.size > 0);
    }

    case 'purge-bots': {
      return purgeFiltered(interaction, t, (message) => message.author.bot);
    }

    case 'blacklist': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      if (!input.user) return missing(interaction, t, 'user');
      config.blacklist ??= [];
      if (!config.blacklist.includes(input.user.id)) config.blacklist.push(input.user.id);
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.added', { target: input.user, value: 'blacklist' }),
      );
    }

    case 'browse': {
      const values = [
        '`/help` — command browser',
        '`/setup` — starter server layout',
        '`/anti-link` — link protection',
        '`/suggest` — suggestion system',
        '`/control-panel` — web dashboard',
      ].join('\n');
      return completed(interaction, t, t('extended.list', { values }));
    }

    case 'claim': {
      if (!input.id) return missing(interaction, t, 'id');
      config.claimCodes ??= {};
      const claim = config.claimCodes[input.id.toUpperCase()];
      if (!claim || claim.redeemedBy) {
        return completed(interaction, t, t('extended.notFound'));
      }
      claim.redeemedBy = interaction.user.id;
      claim.redeemedAt = new Date().toISOString();
      config.premium ??= { guild: false, users: {} };
      config.premium.users[interaction.user.id] = true;
      await saveStore();
      return completed(interaction, t, t('extended.codeRedeemed'));
    }

    case 'control-panel': {
      const url = process.env.DASHBOARD_URL ?? DEFAULT_DASHBOARD_URL;
      return completed(interaction, t, t('extended.dashboard', { url }));
    }

    case 'create-event': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageEvents)) {
        return denied(interaction, t, 'Manage Events');
      }
      if (!input.text) return missing(interaction, t, 'text');
      if (!input.action) return missing(interaction, t, 'action (ISO start time)');
      const startsAt = eventStartTime(input.action);
      if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
        return missing(interaction, t, 'action (future ISO start time)');
      }
      const durationMinutes = Math.min(Math.max(input.amount ?? 60, 15), 10_080);
      const isVoiceEvent = input.channel?.type === ChannelType.GuildVoice;
      const event = await interaction.guild.scheduledEvents.create({
        channel: isVoiceEvent ? input.channel.id : null,
        description: input.text,
        entityMetadata: isVoiceEvent ? undefined : { location: interaction.guild.name },
        entityType: isVoiceEvent
          ? GuildScheduledEventEntityType.Voice
          : GuildScheduledEventEntityType.External,
        name: input.text.slice(0, 100),
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        scheduledEndTime: new Date(startsAt.getTime() + durationMinutes * 60_000),
        scheduledStartTime: startsAt,
        reason: `Created by ${interaction.user.tag}`,
      });
      return completed(
        interaction,
        t,
        t('extended.eventCreated', { id: event.id, name: event.name }),
      );
    }

    case 'create-tournament': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageEvents)) {
        return denied(interaction, t, 'Manage Events');
      }
      if (!input.text) return missing(interaction, t, 'text');
      config.tournaments ??= {};
      config.tournaments[input.text.toLowerCase()] = {
        name: input.text,
        createdAt: new Date().toISOString(),
        createdBy: interaction.user.id,
      };
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.tournamentCreated', { name: input.text }),
      );
    }

    case 'custom': {
      config.customCommands ??= {};
      if (input.action === 'list') {
        const values = Object.keys(config.customCommands)
          .map((name) => `• ${name}`)
          .join('\n');
        return completed(
          interaction,
          t,
          t('extended.list', { values: values || t('extended.listEmpty') }),
        );
      }
      if (!input.id || !/^[a-z0-9-]{1,32}$/u.test(input.id.toLowerCase())) {
        return missing(interaction, t, 'name');
      }
      const name = input.id.toLowerCase();
      if (input.action === 'delete') {
        delete config.customCommands[name];
        await saveStore();
        return completed(interaction, t, t('extended.customDeleted', { name }));
      }
      if (!input.text) return missing(interaction, t, 'response');
      config.customCommands[name] = input.text;
      await saveStore();
      return completed(interaction, t, t('extended.customSaved', { name }));
    }

    case 'debug': {
      if (!hasPermission(interaction, PermissionFlagsBits.Administrator)) {
        return denied(interaction, t, 'Administrator');
      }
      return completed(
        interaction,
        t,
        t('extended.diagnostics', {
          guilds: client.guilds.cache.size,
          ping: Math.round(client.ws.ping),
          uptime: `${Math.floor(process.uptime() / 60)}m`,
        }),
      );
    }

    case 'define': {
      if (!input.text) return missing(interaction, t, 'text');
      const entries = await fetchJson(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(input.text)}`,
      );
      const definition = entries[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      return completed(
        interaction,
        t,
        t('extended.externalResult', {
          result: definition ?? t('extended.notFound'),
        }),
      );
    }

    case 'delete-channel': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageChannels)) {
        return denied(interaction, t, 'Manage Channels');
      }
      if (!input.channel || !input.channel.deletable) {
        return missing(interaction, t, 'channel');
      }
      const name = input.channel.name;
      await interaction.reply(
        successMessage(
          commandTitle(interaction, t),
          t('extended.channelDeleted', { channel: name }),
          { ephemeral: true },
        ),
      );
      return input.channel.delete(`Requested by ${interaction.user.tag}`);
    }

    case 'delete-event': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageEvents)) {
        return denied(interaction, t, 'Manage Events');
      }
      if (!input.id) return missing(interaction, t, 'id');
      const event = await interaction.guild.scheduledEvents
        .fetch(input.id)
        .catch(() => null);
      if (!event) return completed(interaction, t, t('extended.notFound'));
      await event.delete(`Deleted by ${interaction.user.tag}`);
      return completed(interaction, t, t('extended.eventDeleted', { id: input.id }));
    }

    case 'delete-role': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageRoles)) {
        return denied(interaction, t, 'Manage Roles');
      }
      if (!input.role?.editable) return missing(interaction, t, 'role');
      const name = input.role.name;
      await input.role.delete(`Requested by ${interaction.user.tag}`);
      return completed(interaction, t, t('extended.roleDeleted', { role: name }));
    }

    case 'delete-tournament': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageEvents)) {
        return denied(interaction, t, 'Manage Events');
      }
      if (!input.text) return missing(interaction, t, 'text');
      config.tournaments ??= {};
      const key = input.text.toLowerCase();
      if (!config.tournaments[key])
        return completed(interaction, t, t('extended.notFound'));
      delete config.tournaments[key];
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.tournamentDeleted', { name: input.text }),
      );
    }

    case 'deposit': {
      const account = economyAccount(interaction, interaction.user.id);
      const amount = Math.min(account.balance, Math.max(1, input.amount ?? 0));
      if (!amount) return missing(interaction, t, 'amount');
      account.balance -= amount;
      account.bank += amount;
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.transfer', {
          amount,
          bank: account.bank,
          currency: config.currency ?? botConfig.economy.currency,
          wallet: account.balance,
        }),
      );
    }

    case 'disable-links': {
      config.automod ??= {};
      config.automod.antiLink = false;
      await saveStore();
      return completed(interaction, t, t('extended.disabled'));
    }

    case 'embed': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageMessages)) {
        return denied(interaction, t, 'Manage Messages');
      }
      if (!input.text) return missing(interaction, t, 'text');
      const target = input.channel ?? interaction.channel;
      await target.send(
        componentMessage({
          title: commandTitle(interaction, t),
          description: input.text,
        }),
      );
      return completed(interaction, t, t('extended.messageSent'));
    }

    case 'enable-links': {
      config.automod ??= {};
      config.automod.enabled = true;
      config.automod.antiLink = true;
      delete config.automod.linkProtocols;
      await saveStore();
      return completed(interaction, t, t('extended.enabled'));
    }

    case 'files': {
      const values = Object.keys(config.customCommands ?? {}).map((name) => `• ${name}`);
      return completed(
        interaction,
        t,
        t('extended.list', {
          values: values.join('\n') || t('extended.listEmpty'),
        }),
      );
    }

    case 'filter-http': {
      config.automod ??= {};
      config.automod.enabled = true;
      config.automod.antiLink = true;
      config.automod.linkProtocols = ['http'];
      await saveStore();
      return completed(interaction, t, t('extended.saved'));
    }

    case 'filter-https': {
      config.automod ??= {};
      config.automod.enabled = true;
      config.automod.antiLink = true;
      config.automod.linkProtocols = ['https'];
      await saveStore();
      return completed(interaction, t, t('extended.saved'));
    }

    case 'generate': {
      return createClaimCode(interaction, t);
    }

    case 'generate-code': {
      return createClaimCode(interaction, t);
    }

    case 'giveaway': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageEvents)) {
        return denied(interaction, t, 'Manage Events');
      }
      if (!input.text) return missing(interaction, t, 'text');
      const configuredTarget = config.giveawayChannelId
        ? await interaction.guild.channels
            .fetch(config.giveawayChannelId)
            .catch(() => null)
        : null;
      const target = input.channel ?? configuredTarget ?? interaction.channel;
      if (!target?.isTextBased()) return missing(interaction, t, 'channel');
      const duration = Math.min(
        Math.max(
          input.amount ??
            config.giveawaySettings?.defaultDurationSeconds ??
            botConfig.giveaways.defaultDurationSeconds,
          botConfig.giveaways.minimumDurationSeconds,
        ),
        botConfig.giveaways.maximumDurationSeconds,
      );
      const giveawayId = code().slice(0, 8);
      const message = await target.send(
        componentMessage({
          title: commandTitle(interaction, t),
          description: input.text,
          footer: t('extended.giveawayFooter', {
            id: giveawayId,
            time: `<t:${Math.floor(Date.now() / 1000) + duration}:R>`,
          }),
        }),
      );
      await message.react('🎉');
      config.giveaways ??= {};
      config.giveaways[giveawayId] = {
        channelId: target.id,
        endsAt: Date.now() + duration * 1_000,
        messageId: message.id,
        prize: input.text,
      };
      await saveStore();
      scheduleGiveaway(client, interaction.guildId, giveawayId, t);
      return completed(interaction, t, t('extended.messageSent'));
    }

    case 'guess': {
      if (!Number.isInteger(input.amount)) return missing(interaction, t, 'amount');
      const target = Math.floor(Math.random() * 10) + 1;
      const result =
        input.amount === target ? `🎉 ${input.amount}` : `${input.amount} ≠ ${target}`;
      return completed(interaction, t, t('extended.gameResult', { result }));
    }

    case 'health': {
      const account = economyAccount(interaction, interaction.user.id);
      return completed(
        interaction,
        t,
        t('extended.account', {
          bank: account.bank,
          currency: config.currency ?? botConfig.economy.currency,
          wallet: account.balance,
        }),
      );
    }

    case 'join-voice': {
      return joinMemberVoice(interaction, t);
    }

    case 'leaderboard': {
      const points = Object.entries(config.tournamentPoints ?? {})
        .sort(([, left], [, right]) => right - left)
        .slice(0, 20);
      const values = points
        .map(([userId, value], index) => `${index + 1}. <@${userId}> — **${value}**`)
        .join('\n');
      return completed(
        interaction,
        t,
        t('extended.leaderboard', { values: values || t('extended.listEmpty') }),
      );
    }

    case 'level': {
      const user = input.user ?? interaction.user;
      const account = economyAccount(interaction, user.id);
      const level = Math.floor(Math.sqrt(account.xp / 100));
      return completed(
        interaction,
        t,
        t('extended.profile', {
          bio: config.profiles?.[user.id]?.bio ?? '—',
          level,
          xp: account.xp,
        }),
      );
    }

    case 'list': {
      const events = await interaction.guild.scheduledEvents.fetch();
      const values = [...events.values()]
        .map((event) => `• **${event.name}** — \`${event.id}\``)
        .join('\n');
      return completed(
        interaction,
        t,
        t('extended.list', { values: values || t('extended.listEmpty') }),
      );
    }

    case 'lookup': {
      if (!input.user) return missing(interaction, t, 'user');
      const member = await interaction.guild.members
        .fetch(input.user.id)
        .catch(() => null);
      const values = [
        `**ID:** ${input.user.id}`,
        `**Bot:** ${input.user.bot ? 'Yes' : 'No'}`,
        `**Created:** <t:${Math.floor(input.user.createdTimestamp / 1_000)}:F>`,
        member?.joinedTimestamp
          ? `**Joined:** <t:${Math.floor(member.joinedTimestamp / 1_000)}:F>`
          : null,
      ]
        .filter(Boolean)
        .join('\n');
      return completed(interaction, t, t('extended.list', { values }));
    }

    case 'lyrics': {
      if (!input.artist || !input.title) return missing(interaction, t, 'artist/title');
      const result = await fetchJson(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(input.artist)}/${encodeURIComponent(input.title)}`,
      );
      return completed(
        interaction,
        t,
        t('extended.externalResult', {
          result: (result.lyrics ?? t('extended.notFound')).slice(0, 3_500),
        }),
      );
    }

    case 'memory': {
      const symbols = ['⭐', '🌙', '☀️', '🌈', '💎', '🔥'];
      const sequence = Array.from(
        { length: 5 },
        () => symbols[Math.floor(Math.random() * symbols.length)],
      ).join(' ');
      return completed(
        interaction,
        t,
        t('extended.gameResult', { result: `||${sequence}||` }),
      );
    }

    case 'modify-role': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageRoles)) {
        return denied(interaction, t, 'Manage Roles');
      }
      if (!input.role?.editable) return missing(interaction, t, 'role');
      if (!input.text) return missing(interaction, t, 'text');
      await input.role.setName(
        input.text.slice(0, 100),
        `Requested by ${interaction.user.tag}`,
      );
      return completed(interaction, t, t('extended.roleUpdated', { role: input.role }));
    }

    case 'module': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      if (!input.id) return missing(interaction, t, 'id');
      if (!input.action) return missing(interaction, t, 'action');
      config.modules ??= {};
      const enabled = !['disable', 'off'].includes(input.action.toLowerCase());
      config.modules[input.id.toLowerCase()] = enabled;
      await saveStore();
      return completed(
        interaction,
        t,
        t(enabled ? 'extended.enabled' : 'extended.disabled'),
      );
    }

    case 'now-playing': {
      return showNowPlaying(interaction, t);
    }

    case 'open': {
      const account = economyAccount(interaction, interaction.user.id);
      if (account.boxes < 1) return completed(interaction, t, t('extended.notFound'));
      const rewardRange =
        botConfig.economy.boxRewardMaximum - botConfig.economy.boxRewardMinimum + 1;
      const reward =
        (crypto.getRandomValues(new Uint32Array(1))[0] % rewardRange) +
        botConfig.economy.boxRewardMinimum;
      account.boxes -= 1;
      account.balance += reward;
      account.xp += botConfig.economy.boxXp;
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.added', { target: interaction.user, value: reward }),
      );
    }

    case 'organize': {
      const eventCount = (await interaction.guild.scheduledEvents.fetch()).size;
      const tournamentCount = Object.keys(config.tournaments ?? {}).length;
      const values = `**Events:** ${eventCount}\n**Tournaments:** ${tournamentCount}`;
      return completed(interaction, t, t('extended.list', { values }));
    }

    case 'play': {
      return enqueueTrack(interaction, t, input.text);
    }

    case 'prefix-only': {
      if (!input.id) return missing(interaction, t, 'id');
      const response = config.customCommands?.[input.id.toLowerCase()];
      return completed(interaction, t, response ?? t('extended.notFound'));
    }

    case 'premium': {
      config.premium ??= { guild: false, users: {} };
      const enabled = config.premium.guild || config.premium.users[interaction.user.id];
      return completed(
        interaction,
        t,
        t(enabled ? 'extended.enabled' : 'extended.disabled'),
      );
    }

    case 'profile': {
      const user = input.user ?? interaction.user;
      const account = economyAccount(interaction, user.id);
      const profile = config.profiles?.[user.id] ?? {};
      return completed(
        interaction,
        t,
        t('extended.profile', {
          bio: profile.bio ?? '—',
          level: Math.floor(Math.sqrt(account.xp / 100)),
          xp: account.xp,
        }),
      );
    }

    case 'purchase': {
      const account = economyAccount(interaction, interaction.user.id);
      const quantity = Math.min(Math.max(input.amount ?? 1, 1), 25);
      const unitPrice = config.economySettings?.boxPrice ?? botConfig.economy.boxPrice;
      const price = unitPrice * quantity;
      if (account.balance < price)
        return completed(interaction, t, t('extended.notFound'));
      account.balance -= price;
      account.boxes += quantity;
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.transfer', {
          amount: price,
          bank: account.bank,
          currency: config.currency ?? botConfig.economy.currency,
          wallet: account.balance,
        }),
      );
    }

    case 'queue': {
      return showQueue(interaction, t);
    }

    case 'random': {
      const values = [
        'The first Discord server was created in 2015.',
        'A group of flamingos is called a flamboyance.',
        'Honey can remain edible for thousands of years.',
        'Octopuses have three hearts.',
      ];
      const result =
        values[crypto.getRandomValues(new Uint32Array(1))[0] % values.length];
      return completed(interaction, t, t('extended.externalResult', { result }));
    }

    case 'redeem-code': {
      if (!input.id) return missing(interaction, t, 'id');
      config.claimCodes ??= {};
      const claim = config.claimCodes[input.id.toUpperCase()];
      if (!claim || claim.redeemedBy)
        return completed(interaction, t, t('extended.notFound'));
      claim.redeemedBy = interaction.user.id;
      claim.redeemedAt = new Date().toISOString();
      config.staff ??= {};
      config.staff[interaction.user.id] = true;
      await saveStore();
      return completed(interaction, t, t('extended.codeRedeemed'));
    }

    case 'remove-permissions': {
      config.staff ??= {};
      delete config.staff[interaction.user.id];
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.removed', {
          target: interaction.user,
          value: 'staff access',
        }),
      );
    }

    case 'remove-points': {
      return updatePoints(interaction, t, -1);
    }

    case 'remove-premium': {
      return updatePremium(interaction, t, false);
    }

    case 'rename': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageNicknames)) {
        return denied(interaction, t, 'Manage Nicknames');
      }
      if (!input.user) return missing(interaction, t, 'user');
      if (!input.text) return missing(interaction, t, 'text');
      const member = await interaction.guild.members.fetch(input.user.id);
      if (!member.manageable) return denied(interaction, t, 'Role hierarchy');
      await member.setNickname(
        input.text.slice(0, 32),
        `Requested by ${interaction.user.tag}`,
      );
      return completed(interaction, t, t('extended.saved'));
    }

    case 'reply': {
      if (!input.id) return missing(interaction, t, 'id');
      if (!input.text) return missing(interaction, t, 'text');
      const target = input.channel ?? interaction.channel;
      if (!target?.isTextBased()) return missing(interaction, t, 'channel');
      const message = await target.messages.fetch(input.id).catch(() => null);
      if (!message) return completed(interaction, t, t('extended.notFound'));
      await message.reply(
        componentMessage({
          title: commandTitle(interaction, t),
          description: input.text,
        }),
      );
      return completed(interaction, t, t('extended.messageSent'));
    }

    case 'rob': {
      if (!input.user || input.user.id === interaction.user.id) {
        return missing(interaction, t, 'user');
      }
      const thief = economyAccount(interaction, interaction.user.id);
      const victim = economyAccount(interaction, input.user.id);
      const maximum = Math.min(victim.balance, Math.max(input.amount ?? 100, 1));
      if (maximum < 1) return completed(interaction, t, t('extended.notFound'));
      const success =
        crypto.getRandomValues(new Uint32Array(1))[0] % 100 <
        (config.economySettings?.robberySuccessPercent ??
          botConfig.economy.robberySuccessPercent);
      const amount = success
        ? maximum
        : Math.min(
            thief.balance,
            Math.ceil(maximum / botConfig.economy.robberyFailureDivisor),
          );
      if (success) {
        victim.balance -= amount;
        thief.balance += amount;
      } else {
        thief.balance -= amount;
        victim.balance += amount;
      }
      await saveStore();
      return completed(
        interaction,
        t,
        t(success ? 'extended.added' : 'extended.removed', {
          target: interaction.user,
          value: amount,
        }),
      );
    }

    case 'rps': {
      const choice = input.action?.toLowerCase();
      if (!['rock', 'paper', 'scissors'].includes(choice)) {
        return missing(interaction, t, 'action: rock, paper, or scissors');
      }
      const choices = ['rock', 'paper', 'scissors'];
      const botChoice = choices[crypto.getRandomValues(new Uint32Array(1))[0] % 3];
      const wins = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const result =
        choice === botChoice ? 'Draw' : wins[choice] === botChoice ? 'Win' : 'Loss';
      return completed(
        interaction,
        t,
        t('extended.gameResult', { result: `${choice} vs ${botChoice} — ${result}` }),
      );
    }

    case 'run-custom-command': {
      if (!input.id) return missing(interaction, t, 'id');
      const response = config.customCommands?.[input.id.toLowerCase()];
      return completed(interaction, t, response ?? t('extended.notFound'));
    }

    case 'search': {
      if (!input.text) return missing(interaction, t, 'text');
      const query = input.text.toLowerCase();
      const values = catalog
        .filter(({ name, description }) =>
          `${name} ${description}`.toLowerCase().includes(query),
        )
        .slice(0, 20)
        .map(({ name, description }) => `**/${name}** — ${description}`)
        .join('\n');
      return completed(
        interaction,
        t,
        t('extended.list', { values: values || t('extended.notFound') }),
      );
    }

    case 'set-currency': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      if (!input.text) return missing(interaction, t, 'text');
      config.currency = input.text.trim().slice(0, 24);
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.currentValue', { value: config.currency }),
      );
    }

    case 'set-profile': {
      if (!input.text) return missing(interaction, t, 'text');
      config.profiles ??= {};
      config.profiles[interaction.user.id] ??= {};
      config.profiles[interaction.user.id].bio = input.text.slice(0, 500);
      await saveStore();
      return completed(interaction, t, t('extended.saved'));
    }

    case 'set-verification': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageRoles)) {
        return denied(interaction, t, 'Manage Roles');
      }
      if (!input.role?.editable) return missing(interaction, t, 'role');
      config.verificationRoleId = input.role.id;
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.verificationConfigured', { role: input.role }),
      );
    }

    case 'shop': {
      const values = t('extended.shopItems', {
        currency: config.currency ?? botConfig.economy.currency,
        price: config.economySettings?.boxPrice ?? botConfig.economy.boxPrice,
      });
      return completed(interaction, t, t('extended.list', { values }));
    }

    case 'skip': {
      return skipTrack(interaction, t);
    }

    case 'song-search': {
      return searchTracks(interaction, t, input.text);
    }

    case 'status': {
      const values = [
        `**Premium:** ${config.premium?.guild ? 'Yes' : 'No'}`,
        `**Staff:** ${config.staff?.[interaction.user.id] ? 'Yes' : 'No'}`,
        `**Blacklisted:** ${config.blacklist?.includes(interaction.user.id) ? 'Yes' : 'No'}`,
      ].join('\n');
      return completed(interaction, t, t('extended.list', { values }));
    }

    case 'sudo': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageMessages)) {
        return denied(interaction, t, 'Manage Messages');
      }
      if (!input.user) return missing(interaction, t, 'user');
      if (!input.text) return missing(interaction, t, 'text');
      const target = input.channel ?? interaction.channel;
      await target.send(
        componentMessage({
          title: t('extended.relayTitle', {
            moderator: interaction.user.tag,
            user: input.user.username,
          }),
          description: input.text,
          footer: t('modules.userIdFooter', { id: input.user.id }),
        }),
      );
      return completed(interaction, t, t('extended.messageSent'));
    }

    case 'ticket': {
      const configuredCategory = config.ticketCategoryId
        ? await interaction.guild.channels
            .fetch(config.ticketCategoryId)
            .catch(() => null)
        : null;
      const category =
        input.channel?.type === ChannelType.GuildCategory
          ? input.channel
          : configuredCategory?.type === ChannelType.GuildCategory
            ? configuredCategory
            : null;
      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, ''),
        type: ChannelType.GuildText,
        parent: category?.id,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
          {
            id: interaction.guild.members.me.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
        ],
        reason: `Ticket opened by ${interaction.user.tag}`,
      });
      return completed(interaction, t, t('extended.ticketCreated', { channel }));
    }

    case 'translate': {
      if (!input.text) return missing(interaction, t, 'text');
      const targetLanguage = input.action?.toLowerCase() ?? 'en';
      const result = await fetchJson(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(input.text)}&langpair=auto|${encodeURIComponent(targetLanguage)}`,
      );
      return completed(
        interaction,
        t,
        t('extended.externalResult', {
          result: result.responseData?.translatedText ?? t('extended.notFound'),
        }),
      );
    }

    case 'user-role': {
      const user = input.user ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id);
      const values = member.roles.cache
        .filter((role) => role.id !== interaction.guildId)
        .sort((left, right) => right.position - left.position)
        .map(String)
        .join(', ');
      return completed(
        interaction,
        t,
        t('extended.list', { values: values || t('extended.listEmpty') }),
      );
    }

    case 'verify': {
      if (!config.verificationRoleId)
        return completed(interaction, t, t('extended.notFound'));
      const button = new ButtonBuilder()
        .setCustomId(`verify:${interaction.guildId}`)
        .setLabel(t('extended.verifyButton'))
        .setStyle(ButtonStyle.Success);
      return interaction.reply(
        componentMessage({
          title: commandTitle(interaction, t),
          description: t('extended.verificationConfigured', {
            role: `<@&${config.verificationRoleId}>`,
          }),
          actionRows: [new ActionRowBuilder().addComponents(button)],
        }),
      );
    }

    case 'view': {
      config.notifications ??= {};
      const notifications = config.notifications[interaction.user.id] ?? [];
      const notification = notifications.pop();
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.notification', {
          message: notification?.message ?? t('extended.listEmpty'),
        }),
      );
    }

    case 'volume': {
      return setVolume(interaction, t, input.amount);
    }

    case 'weather': {
      if (!input.text) return missing(interaction, t, 'text');
      const places = await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input.text)}&count=1&language=en&format=json`,
      );
      const place = places.results?.[0];
      if (!place) return completed(interaction, t, t('extended.notFound'));
      const weather = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m&timezone=auto`,
      );
      const current = weather.current;
      const result = `**${place.name}, ${place.country}**\n${current.temperature_2m}°C · Feels like ${current.apparent_temperature}°C · Wind ${current.wind_speed_10m} km/h`;
      return completed(interaction, t, t('extended.externalResult', { result }));
    }

    case 'web-status': {
      if (!input.text) return missing(interaction, t, 'text');
      const result = await safeWebsiteStatus(input.text);
      return completed(
        interaction,
        t,
        t('extended.httpResult', {
          duration: result.duration,
          status: result.status,
        }),
      );
    }

    case 'whitelist': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      if (!input.user) return missing(interaction, t, 'user');
      config.whitelist ??= [];
      if (!config.whitelist.includes(input.user.id)) config.whitelist.push(input.user.id);
      config.blacklist = (config.blacklist ?? []).filter((id) => id !== input.user.id);
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.added', { target: input.user, value: 'whitelist' }),
      );
    }

    case 'unwhitelist': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      if (!input.user) return missing(interaction, t, 'user');
      config.whitelist = (config.whitelist ?? []).filter(
        (id) => id !== input.user.id,
      );
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.removed', { target: input.user, value: 'whitelist' }),
      );
    }

    case 'unblacklist': {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return denied(interaction, t, 'Manage Server');
      }
      if (!input.user) return missing(interaction, t, 'user');
      config.blacklist = (config.blacklist ?? []).filter(
        (id) => id !== input.user.id,
      );
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.removed', { target: input.user, value: 'blacklist' }),
      );
    }

    case 'withdraw': {
      const account = economyAccount(interaction, interaction.user.id);
      const amount = Math.min(account.bank, Math.max(1, input.amount ?? 0));
      if (!amount) return missing(interaction, t, 'amount');
      account.bank -= amount;
      account.balance += amount;
      await saveStore();
      return completed(
        interaction,
        t,
        t('extended.transfer', {
          amount,
          bank: account.bank,
          currency: config.currency ?? botConfig.economy.currency,
          wallet: account.balance,
        }),
      );
    }

    default: {
      return false;
    }
  }
}

export async function handleExtendedButton(interaction, t) {
  if (!interaction.customId.startsWith('verify:')) return false;

  const [, guildId] = interaction.customId.split(':');
  if (guildId !== interaction.guildId) {
    return interaction.reply(
      errorMessage(t('extended.permissionTitle'), t('extended.notFound')),
    );
  }

  const config = guildConfig(interaction.guildId);
  const role = config.verificationRoleId
    ? await interaction.guild.roles.fetch(config.verificationRoleId).catch(() => null)
    : null;
  const member = await interaction.guild.members.fetch(interaction.user.id);

  if (!role?.editable) {
    await interaction.reply(
      errorMessage(t('extended.missingInputTitle'), t('extended.notFound')),
    );
    return true;
  }

  await member.roles.add(role, 'Member completed verification');
  await interaction.reply(
    successMessage(
      t('extended.completedTitle', { command: 'verify' }),
      t('extended.verificationConfigured', { role }),
      { ephemeral: true },
    ),
  );
  return true;
}
