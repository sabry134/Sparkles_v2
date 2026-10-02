import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  InteractionContextType,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { catalog } from './src/catalog.js';
import {
  addWarning,
  clearWarnings,
  guildConfig,
  loadStore,
  saveStore,
  syncStore,
  warningCount,
} from './src/store.js';
import { claimReward, showBalance } from './src/modules/economy.js';
import { flipCoin, rollDice } from './src/modules/fun.js';
import {
  applyReactionRole,
  assignAutoRole,
  configureAutoRole,
  configureReactionRole,
} from './src/modules/roles.js';
import { handleSuggestionButton, submitSuggestion } from './src/modules/suggestions.js';
import { handleInteractionError } from './src/errors.js';
import {
  configureLinkFilter,
  filterAutomodMessage,
  filterLinks,
  protectNewMember,
} from './src/modules/automod.js';
import {
  DEFAULT_HELP_CATEGORIES,
  HELP_TRANSLATION_DEFAULTS,
  handleHelpInteraction,
  showHelp,
} from './src/modules/help.js';
import { handleExtendedButton, handleExtendedCommand } from './src/modules/extended.js';
import { buildStarterServer, createServerChannel } from './src/modules/server-builder.js';
import { restoreGiveaways } from './src/modules/giveaways.js';
import { TOP_LEVEL_COMMANDS } from './src/top-level-commands.js';
import {
  addGroupedCommandOptions,
  CATEGORY_SLASH_NAMES,
  slashSubcommandName,
} from './src/command-routes.js';
import { componentMessage, successMessage } from './src/ui/components.js';

const requiredEnvironment = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
for (const key of requiredEnvironment) {
  if (!process.env[key]?.trim())
    throw new Error(`Missing required environment variable: ${key}`);
}

const localeName = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(process.env.DEFAULT_LOCALE ?? '')
  ? process.env.DEFAULT_LOCALE
  : 'en';
const messages = JSON.parse(
  await readFile(new URL(`./locales/${localeName}.json`, import.meta.url), 'utf8'),
);
messages.commands ??= {};
for (const command of catalog) {
  messages.commands[command.name] ??= { description: command.description };
}
for (const [key, value] of Object.entries(HELP_TRANSLATION_DEFAULTS)) {
  const parts = key.split('.');
  const leaf = parts.pop();
  let target = messages;
  for (const part of parts) target = target[part] ??= {};
  target[leaf] ??= value;
}
const t = (key, values = {}) => {
  const template = key.split('.').reduce((value, part) => value?.[part], messages) ?? key;
  return Object.entries(values).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
};

const optionNames = {
  user: [
    'ban',
    'kick',
    'timeout',
    'untimeout',
    'soft-ban',
    'warn',
    'user-warnings',
    'clear-warnings',
    'avatar',
    'add-role',
    'remove-role',
    'rename',
    'user-info',
    'set-nickname',
    'reset-nickname',
  ],
  role: ['add-role', 'remove-role', 'delete-role', 'modify-role', 'role-info'],
  channel: [
    'logs',
    'set-suggestions',
    'say',
    'slowmode',
    'delete-channel',
    'lock',
    'unlock',
    'poll',
    'announce',
    'channel-topic',
  ],
  reason: ['ban', 'kick', 'timeout', 'soft-ban', 'warn'],
  text: ['say', 'suggest', 'rules', 'thread', 'poll', 'announce', 'channel-topic'],
  name: [
    'create-category',
    'create-text-channel',
    'create-voice',
    'modify-role',
    'create-role',
  ],
};

const protectedCommands = new Map([
  ...['ban', 'soft-ban', 'unban'].map((name) => [
    name,
    [PermissionFlagsBits.BanMembers, 'Ban Members'],
  ]),
  ...['kick'].map((name) => [name, [PermissionFlagsBits.KickMembers, 'Kick Members']]),
  ...['timeout', 'untimeout', 'warn', 'user-warnings', 'clear-warnings'].map((name) => [
    name,
    [PermissionFlagsBits.ModerateMembers, 'Moderate Members'],
  ]),
  ...['clear', 'purge-user', 'purge-links', 'purge-attachments', 'purge-bots'].map(
    (name) => [name, [PermissionFlagsBits.ManageMessages, 'Manage Messages']],
  ),
  ...[
    'add-role',
    'remove-role',
    'delete-role',
    'modify-role',
    'auto-role',
    'reaction-role',
    'set-verification',
  ].map((name) => [name, [PermissionFlagsBits.ManageRoles, 'Manage Roles']]),
  ...['create-role'].map((name) => [
    name,
    [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  ]),
  ...['set-nickname', 'reset-nickname'].map((name) => [
    name,
    [PermissionFlagsBits.ManageNicknames, 'Manage Nicknames'],
  ]),
  ...[
    'create-category',
    'create-text-channel',
    'create-voice',
    'delete-channel',
    'slowmode',
    'thread',
    'setup',
    'lock',
    'unlock',
    'channel-topic',
  ].map((name) => [name, [PermissionFlagsBits.ManageChannels, 'Manage Channels']]),
  ...[
    'logs',
    'set-suggestions',
    'reset-suggestions',
    'say',
    'announce',
    'module',
    'automod',
    'anti-alt',
    'anti-bot',
    'anti-link',
    'anti-raid',
    'anti-spam',
    'anti-swear',
    'automod-test',
    'disable-links',
    'enable-links',
    'filter-http',
    'filter-https',
    'start',
    'stop',
    'custom',
    'unblacklist',
    'unwhitelist',
  ].map((name) => [name, [PermissionFlagsBits.ManageGuild, 'Manage Server']]),
  ...['verify'].map((name) => [name, [PermissionFlagsBits.ManageRoles, 'Manage Roles']]),
]);

function commandData({ name }) {
  const builder = new SlashCommandBuilder()
    .setName(name)
    .setDescription(t(`commands.${name}.description`))
    .setContexts(InteractionContextType.Guild);
  const protection = protectedCommands.get(name);
  if (protection) builder.setDefaultMemberPermissions(protection[0]);
  if (optionNames.user.includes(name))
    builder.addUserOption((o) =>
      o
        .setName('user')
        .setDescription(t('options.serverMember'))
        .setRequired(name !== 'avatar'),
    );
  if (optionNames.role.includes(name))
    builder.addRoleOption((o) =>
      o.setName('role').setDescription(t('options.serverRole')).setRequired(true),
    );
  if (optionNames.channel.includes(name))
    builder.addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription(t('options.serverChannel'))
        .setRequired(!['logs'].includes(name)),
    );
  if (optionNames.text.includes(name))
    builder.addStringOption((o) =>
      o
        .setName('text')
        .setDescription(t('options.messageContent'))
        .setMaxLength(2000)
        .setRequired(name !== 'rules'),
    );
  if (optionNames.name.includes(name))
    builder.addStringOption((o) =>
      o
        .setName('name')
        .setDescription(t('options.name'))
        .setMinLength(1)
        .setMaxLength(100)
        .setRequired(true),
    );
  if (name === 'timeout')
    builder.addStringOption((o) =>
      o.setName('duration').setDescription(t('options.duration')).setRequired(true),
    );
  if (optionNames.reason.includes(name))
    builder.addStringOption((o) =>
      o.setName('reason').setDescription(t('options.reason')).setMaxLength(500),
    );
  if (name === 'clear')
    builder.addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription(t('options.clearAmount'))
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    );
  if (name === 'slowmode')
    builder.addIntegerOption((o) =>
      o
        .setName('seconds')
        .setDescription(t('options.slowmodeSeconds'))
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true),
    );
  if (name === 'unban')
    builder.addStringOption((o) =>
      o
        .setName('user-id')
        .setDescription(t('options.discordUserId'))
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    );
  if (name === 'quote')
    builder.addStringOption((o) =>
      o
        .setName('message-id')
        .setDescription(t('options.channelMessageId'))
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    );
  if (name === 'set-nickname')
    builder.addStringOption((o) =>
      o
        .setName('nickname')
        .setDescription(t('options.nickname'))
        .setMinLength(1)
        .setMaxLength(32)
        .setRequired(true),
    );
  if (name === 'poll')
    builder
      .addStringOption((o) =>
        o
          .setName('choice-one')
          .setDescription(t('options.firstChoice'))
          .setMaxLength(100)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('choice-two')
          .setDescription(t('options.secondChoice'))
          .setMaxLength(100)
          .setRequired(true),
      );
  if (name === 'auto-role')
    builder
      .addStringOption((option) =>
        option
          .setName('action')
          .setDescription(t('options.autoRoleAction'))
          .setRequired(true)
          .addChoices(
            { name: t('options.enable'), value: 'enable' },
            { name: t('options.disable'), value: 'disable' },
          ),
      )
      .addRoleOption((option) =>
        option.setName('role').setDescription(t('options.autoRole')),
      );
  if (name === 'reaction-role')
    builder
      .addStringOption((option) =>
        option
          .setName('action')
          .setDescription(t('options.reactionAction'))
          .setRequired(true)
          .addChoices(
            { name: t('options.add'), value: 'add' },
            { name: t('options.remove'), value: 'remove' },
          ),
      )
      .addStringOption((option) =>
        option
          .setName('message-id')
          .setDescription(t('options.messageId'))
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName('emoji').setDescription(t('options.emoji')).setRequired(true),
      )
      .addChannelOption((option) =>
        option.setName('channel').setDescription(t('options.reactionChannel')),
      )
      .addRoleOption((option) =>
        option.setName('role').setDescription(t('options.reactionRole')),
      );
  if (name === 'dice')
    builder.addIntegerOption((option) =>
      option
        .setName('sides')
        .setDescription(t('options.diceSides'))
        .setMinValue(2)
        .setMaxValue(1_000),
    );
  if (name === 'anti-link')
    builder.addStringOption((option) =>
      option
        .setName('action')
        .setDescription(t('options.antiLinkAction'))
        .setRequired(true)
        .addChoices(
          { name: t('options.enable'), value: 'enable' },
          { name: t('options.disable'), value: 'disable' },
          { name: t('options.status'), value: 'status' },
        ),
    );
  if (name === 'balance')
    builder.addUserOption((option) =>
      option.setName('user').setDescription(t('options.balanceUser')),
    );
  if (name === 'tag') {
    builder
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription(t('options.tagAction'))
          .setRequired(true)
          .addChoices(
            { name: t('options.get'), value: 'get' },
            { name: t('options.set'), value: 'set' },
            { name: t('options.delete'), value: 'delete' },
            { name: t('options.list'), value: 'list' },
          ),
      )
      .addStringOption((o) =>
        o.setName('name').setDescription(t('options.tagName')).setMaxLength(32),
      )
      .addStringOption((o) =>
        o.setName('content').setDescription(t('options.tagContent')).setMaxLength(1900),
      );
  }
  return builder.toJSON();
}

const commands = catalog
  .filter(({ name }) => TOP_LEVEL_COMMANDS.has(name))
  .map(commandData);
const invitePermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
].reduce((permissions, permission) => permissions | permission, 0n);
const catalogByName = new Map(catalog.map((command) => [command.name, command]));
const registeredGroupNames = new Set();
const groupedRoutes = new Map();
const commandModules = new Map();

for (const category of DEFAULT_HELP_CATEGORIES) {
  for (const commandName of category.commands) {
    commandModules.set(commandName, category.id);
  }
  const groupedCommands = category.commands
    .filter((name) => !TOP_LEVEL_COMMANDS.has(name))
    .map((name) => catalogByName.get(name))
    .filter(Boolean);

  if (groupedCommands.length === 0) continue;
  if (groupedCommands.length > 25) {
    throw new Error(`Command group ${category.id} exceeds Discord's 25 subcommand limit`);
  }

  const builder = new SlashCommandBuilder()
    .setName(CATEGORY_SLASH_NAMES[category.id] ?? category.id)
    .setDescription(
      t('common.groupDescription', {
        category: t(`help.category.${category.id}.name`),
      }),
    )
    .setContexts(InteractionContextType.Guild);

  for (const command of groupedCommands) {
    registeredGroupNames.add(command.name);
    const subcommandName = slashSubcommandName(command.name);
    groupedRoutes.set(`${builder.name}:${subcommandName}`, command.name);
    builder.addSubcommand((subcommand) =>
      addGroupedCommandOptions(
        subcommand
          .setName(subcommandName)
          .setDescription(t(`commands.${command.name}.description`)),
        command.name,
        t,
      ),
    );
  }
  commands.push(builder.toJSON());
}

const unregisteredCommands = catalog.filter(
  ({ name }) => !TOP_LEVEL_COMMANDS.has(name) && !registeredGroupNames.has(name),
);
if (unregisteredCommands.length > 0) {
  throw new Error(
    `Commands missing a registration group: ${unregisteredCommands.map(({ name }) => name).join(', ')}`,
  );
}
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const discordDryRun = process.env.DISCORD_DRY_RUN === 'true';
if (!discordDryRun) {
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
    body: commands,
  });
}

await loadStore();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const ephemeral = (description) =>
  componentMessage({
    title: t('common.privateResponse'),
    description,
    ephemeral: true,
  });
const commandSuccess = (interaction, description, options = {}) =>
  successMessage(
    t('extended.completedTitle', { command: interaction.commandName }),
    description,
    options,
  );
const durationMs = (input) => {
  const match = /^(\d{1,3})([mhd])$/i.exec(input);
  if (!match) return null;
  const multiplier = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
  const value = Number(match[1]) * multiplier;
  return value <= 2_419_200_000 ? value : null;
};
const requireBotPermission = async (interaction, permission, label) => {
  if (interaction.guild.members.me.permissions.has(permission)) return true;
  await interaction.reply(ephemeral(t('errors.botPermission', { permission: label })));
  return false;
};
const targetMember = async (interaction) =>
  interaction.guild.members.fetch(interaction.options.getUser('user').id);
const reason = (interaction) =>
  interaction.options.getString('reason') ?? t('common.reason');
const manageable = (interaction, member) =>
  member.manageable &&
  member.id !== interaction.user.id &&
  member.id !== interaction.guild.ownerId &&
  (interaction.user.id === interaction.guild.ownerId ||
    interaction.member.roles.highest.comparePositionTo(member.roles.highest) > 0);

async function getManageableTarget(interaction, botPermission, permissionName) {
  const hasPermission = await requireBotPermission(
    interaction,
    botPermission,
    permissionName,
  );

  if (!hasPermission) {
    return null;
  }

  const member = await targetMember(interaction);

  if (!manageable(interaction, member)) {
    await interaction.reply(ephemeral(t('errors.hierarchy')));
    return null;
  }

  return member;
}

async function modLog(interaction, title, description) {
  const channelId = guildConfig(interaction.guildId).logsChannelId;
  if (!channelId) {
    return;
  }
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel
      .send(componentMessage({ title, description, footer: new Date().toISOString() }))
      .catch(() => {});
  }
}

client.on('interactionCreate', async (interaction) => {
  await syncStore().catch((error) =>
    console.error('[store-sync]', { guildId: interaction.guildId }, error),
  );

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    try {
      if (await handleHelpInteraction(interaction, t)) return;
      if (interaction.isButton() && (await handleExtendedButton(interaction, t))) {
        return;
      }
      if (interaction.isButton()) await handleSuggestionButton(interaction, t);
    } catch (error) {
      await handleInteractionError(interaction, error, t);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) return interaction.reply(ephemeral(t('errors.guildOnly')));
  try {
    const selectedSubcommand = interaction.options.getSubcommand(false);
    const commandName = selectedSubcommand
      ? groupedRoutes.get(`${interaction.commandName}:${selectedSubcommand}`)
      : interaction.commandName;
    if (!commandName) throw new Error('Unknown grouped command route');

    const protection = protectedCommands.get(commandName);
    if (protection && !interaction.memberPermissions?.has(protection[0])) {
      return interaction.reply(
        ephemeral(t('errors.userPermission', { permission: protection[1] })),
      );
    }

    const moduleKey =
      {
        'set-verification': 'roles',
        verify: 'roles',
        ticket: 'community',
      }[commandName] ??
      {
        moderation: 'moderation',
        automod: 'automod',
        'roles-members': 'roles',
        'server-builder': 'server',
        community: 'community',
        'economy-profile': 'economy',
        fun: 'fun',
        music: 'music',
        events: 'events',
        'tools-ai': 'tools',
        'custom-premium': 'tools',
      }[commandModules.get(commandName)];
    if (
      moduleKey &&
      commandName !== 'module' &&
      guildConfig(interaction.guildId).modules?.[moduleKey] === false
    ) {
      return interaction.reply(
        ephemeral(
          t('errors.moduleDisabled', {
            module: t(`dashboard.modules.${moduleKey}`),
          }),
        ),
      );
    }
    switch (commandName) {
      case 'ping':
        return interaction.reply(
          commandSuccess(
            interaction,
            t('responses.ping', {
              api: Date.now() - interaction.createdTimestamp,
              ws: Math.round(client.ws.ping),
            }),
          ),
        );
      case 'avatar': {
        const user = interaction.options.getUser('user') ?? interaction.user;
        return interaction.reply(
          componentMessage({
            title: t('responses.avatar', { user: user.username }),
            description: t('modules.userIdFooter', { id: user.id }),
            mediaUrls: [user.displayAvatarURL({ size: 4096 })],
          }),
        );
      }
      case 'info':
        return interaction.reply(
          componentMessage({
            title: t('responses.serverInfo'),
            description: interaction.guild.name,
            fields: [
              {
                name: t('responses.memberCount'),
                value: String(interaction.guild.memberCount),
              },
              {
                name: t('responses.owner'),
                value: `<@${interaction.guild.ownerId}>`,
              },
              {
                name: t('responses.created'),
                value: `<t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:D>`,
              },
            ],
          }),
        );
      case 'bot-info':
        return interaction.reply(
          componentMessage({
            title: t('responses.botInfo'),
            description: t('responses.botInfoDescription'),
            fields: [
              {
                name: t('responses.servers'),
                value: String(client.guilds.cache.size),
              },
              {
                name: t('responses.uptime'),
                value: `${Math.floor(process.uptime() / 60)}m`,
              },
            ],
          }),
        );
      case 'help':
        return showHelp(interaction, t);
      case 'invite':
        return interaction.reply(
          ephemeral(
            t('responses.invite', {
              url: `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID)}&permissions=${invitePermissions}&scope=bot%20applications.commands`,
            }),
          ),
        );
      case 'ban': {
        const member = await getManageableTarget(
          interaction,
          PermissionFlagsBits.BanMembers,
          'Ban Members',
        );

        if (!member) {
          return;
        }

        const moderationReason = reason(interaction);

        await interaction.guild.members.ban(member, {
          deleteMessageSeconds: 0,
          reason: moderationReason,
        });

        await interaction.reply(
          commandSuccess(
            interaction,
            t('responses.ban', {
              user: member.user.tag,
              reason: moderationReason,
            }),
          ),
        );
        return modLog(
          interaction,
          'ban',
          `${interaction.user.tag} -> ${member.user.tag}: ${moderationReason}`,
        );
      }
      case 'kick': {
        const member = await getManageableTarget(
          interaction,
          PermissionFlagsBits.KickMembers,
          'Kick Members',
        );

        if (!member) {
          return;
        }

        const moderationReason = reason(interaction);

        await member.kick(moderationReason);

        await interaction.reply(
          commandSuccess(
            interaction,
            t('responses.kick', {
              user: member.user.tag,
              reason: moderationReason,
            }),
          ),
        );
        return modLog(
          interaction,
          'kick',
          `${interaction.user.tag} -> ${member.user.tag}: ${moderationReason}`,
        );
      }
      case 'soft-ban': {
        const member = await getManageableTarget(
          interaction,
          PermissionFlagsBits.BanMembers,
          'Ban Members',
        );

        if (!member) {
          return;
        }

        const moderationReason = reason(interaction);

        await interaction.guild.members.ban(member, {
          deleteMessageSeconds: 86_400,
          reason: moderationReason,
        });

        await interaction.guild.members.unban(member.id, 'Soft-ban completed');

        await interaction.reply(
          commandSuccess(interaction, t('responses.softBan', { user: member.user.tag })),
        );
        return modLog(
          interaction,
          'soft-ban',
          `${interaction.user.tag} -> ${member.user.tag}: ${moderationReason}`,
        );
      }
      case 'unban': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.BanMembers,
            'Ban Members',
          ))
        )
          return;
        const id = interaction.options.getString('user-id');
        await interaction.guild.members.unban(id);
        return interaction.reply(commandSuccess(interaction, t('common.done')));
      }
      case 'timeout': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ModerateMembers,
            'Moderate Members',
          ))
        )
          return;
        const member = await targetMember(interaction);
        if (!manageable(interaction, member))
          return interaction.reply(ephemeral(t('errors.hierarchy')));
        const duration = interaction.options.getString('duration');
        const ms = durationMs(duration);
        if (!ms) return interaction.reply(ephemeral(t('errors.invalidDuration')));
        await member.timeout(ms, reason(interaction));
        return interaction.reply(
          commandSuccess(
            interaction,
            t('responses.timeout', {
              user: member.user.tag,
              duration,
              reason: reason(interaction),
            }),
          ),
        );
      }
      case 'untimeout': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ModerateMembers,
            'Moderate Members',
          ))
        )
          return;
        const member = await targetMember(interaction);
        if (!manageable(interaction, member))
          return interaction.reply(ephemeral(t('errors.hierarchy')));
        await member.timeout(null, reason(interaction));
        return interaction.reply(
          commandSuccess(
            interaction,
            t('responses.untimeout', { user: member.user.tag }),
          ),
        );
      }
      case 'clear': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageMessages,
            'Manage Messages',
          ))
        )
          return;
        const deleted = await interaction.channel.bulkDelete(
          interaction.options.getInteger('amount'),
          true,
        );
        return interaction.reply(
          ephemeral(t('responses.clear', { count: deleted.size })),
        );
      }
      case 'add-role': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageRoles,
            'Manage Roles',
          ))
        )
          return;
        const member = await targetMember(interaction);
        const role = interaction.options.getRole('role');
        if (!role.editable || !manageable(interaction, member))
          return interaction.reply(ephemeral(t('errors.hierarchy')));
        await member.roles.add(role);
        return interaction.reply(
          commandSuccess(
            interaction,
            t('responses.roleAdded', {
              role: role.toString(),
              user: member.user.tag,
            }),
          ),
        );
      }
      case 'remove-role': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageRoles,
            'Manage Roles',
          ))
        )
          return;
        const member = await targetMember(interaction);
        const role = interaction.options.getRole('role');
        if (!role.editable || !manageable(interaction, member))
          return interaction.reply(ephemeral(t('errors.hierarchy')));
        await member.roles.remove(role);
        return interaction.reply(
          commandSuccess(
            interaction,
            t('responses.roleRemoved', {
              role: role.toString(),
              user: member.user.tag,
            }),
          ),
        );
      }
      case 'warn': {
        const member = await targetMember(interaction);
        const count = addWarning(interaction.guildId, member.id, {
          reason: reason(interaction),
          moderatorId: interaction.user.id,
          at: new Date().toISOString(),
        });
        await saveStore();
        await member
          .send(`Warning in ${interaction.guild.name}: ${reason(interaction)}`)
          .catch(() => {});
        await modLog(
          interaction,
          'warn',
          `${interaction.user.tag} → ${member.user.tag}: ${reason(interaction)}`,
        );
        return interaction.reply(
          commandSuccess(
            interaction,
            t('responses.warn', { user: member.user.tag, count }),
          ),
        );
      }
      case 'user-warnings': {
        const member = await targetMember(interaction);
        return interaction.reply(
          ephemeral(
            t('responses.warnings', {
              user: member.user.tag,
              count: warningCount(interaction.guildId, member.id),
            }),
          ),
        );
      }
      case 'clear-warnings': {
        const member = await targetMember(interaction);
        clearWarnings(interaction.guildId, member.id);
        await saveStore();
        return interaction.reply(
          t('responses.warningsCleared', { user: member.user.tag }),
        );
      }
      case 'logs': {
        const config = guildConfig(interaction.guildId);
        const channel = interaction.options.getChannel('channel');
        if (channel && !channel.isTextBased()) {
          return interaction.reply(ephemeral(t('errors.invalidChannel')));
        }
        config.logsChannelId = channel?.id ?? null;
        await saveStore();
        return interaction.reply(
          ephemeral(
            channel ? t('responses.logsSet', { channel }) : t('responses.logsDisabled'),
          ),
        );
      }
      case 'set-suggestions': {
        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased()) {
          return interaction.reply(ephemeral(t('errors.invalidChannel')));
        }
        guildConfig(interaction.guildId).suggestionsChannelId = channel.id;
        await saveStore();
        return interaction.reply(ephemeral(t('responses.suggestionsSet', { channel })));
      }
      case 'reset-suggestions': {
        guildConfig(interaction.guildId).suggestionsChannelId = null;
        await saveStore();
        return interaction.reply(ephemeral(t('responses.suggestionsDisabled')));
      }
      case 'suggest': {
        return submitSuggestion(interaction, t);
      }
      case 'anti-link': {
        return configureLinkFilter(interaction, t);
      }
      case 'auto-role': {
        return configureAutoRole(interaction, t);
      }
      case 'reaction-role': {
        return configureReactionRole(interaction, t);
      }
      case 'balance': {
        return showBalance(interaction, t);
      }
      case 'beg': {
        return claimReward(interaction, 'beg', t);
      }
      case 'daily': {
        return claimReward(interaction, 'daily', t);
      }
      case 'weekly': {
        return claimReward(interaction, 'weekly', t);
      }
      case 'coinflip': {
        return flipCoin(interaction, t);
      }
      case 'dice': {
        return rollDice(interaction, t);
      }
      case 'say': {
        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased())
          return interaction.reply(ephemeral(t('errors.invalidChannel')));
        await channel.send(
          componentMessage({
            title: t('responses.messageTitle'),
            description: interaction.options.getString('text'),
          }),
        );
        return interaction.reply(ephemeral(t('responses.saySent')));
      }
      case 'slowmode': {
        const channel = interaction.options.getChannel('channel');
        if (!channel || typeof channel.setRateLimitPerUser !== 'function') {
          return interaction.reply(ephemeral(t('errors.invalidChannel')));
        }
        await channel.setRateLimitPerUser(interaction.options.getInteger('seconds'));
        return interaction.reply(
          t('responses.slowmode', {
            channel,
            seconds: interaction.options.getInteger('seconds'),
          }),
        );
      }
      case 'rules': {
        const config = guildConfig(interaction.guildId);
        const text = interaction.options.getString('text');
        if (text) {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply(
              ephemeral(t('errors.userPermission', { permission: 'Manage Server' })),
            );
          }
          config.rules = text;
          await saveStore();
          return interaction.reply(ephemeral(t('responses.rulesSaved')));
        }
        return interaction.reply(
          componentMessage({
            title: t('responses.rulesTitle'),
            description: config.rules?.trim() || t('responses.rulesMissing'),
          }),
        );
      }
      case 'tag': {
        const config = guildConfig(interaction.guildId);
        const action = interaction.options.getString('action');
        const name = interaction.options.getString('name')?.toLowerCase().trim();
        if (action === 'list')
          return interaction.reply(
            ephemeral(
              t('responses.tagList', {
                tags: Object.keys(config.tags).join(', ') || '—',
              }),
            ),
          );
        if (!name || !/^[\w-]{1,32}$/.test(name))
          return interaction.reply(ephemeral(t('errors.generic')));
        if (action === 'get')
          return interaction.reply(
            componentMessage({
              title: t('responses.tagTitle', { name }),
              description: config.tags[name] ?? t('responses.tagMissing'),
            }),
          );
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.reply(
            ephemeral(t('errors.userPermission', { permission: 'Manage Messages' })),
          );
        }
        if (action === 'delete') {
          delete config.tags[name];
          await saveStore();
          return interaction.reply(ephemeral(t('responses.tagDeleted', { name })));
        }
        const content = interaction.options.getString('content');
        if (!content) return interaction.reply(ephemeral(t('errors.generic')));
        config.tags[name] = content;
        await saveStore();
        return interaction.reply(ephemeral(t('responses.tagSaved', { name })));
      }
      case 'thread': {
        if (!interaction.channel?.threads || interaction.channel.isThread()) {
          return interaction.reply(ephemeral(t('errors.invalidChannel')));
        }
        const thread = await interaction.channel.threads.create({
          name: interaction.options.getString('text').slice(0, 100),
          type: ChannelType.PublicThread,
          reason: `Created by ${interaction.user.tag}`,
        });
        return interaction.reply(
          commandSuccess(interaction, t('responses.threadCreated', { thread })),
        );
      }
      case 'create-category': {
        return createServerChannel(interaction, ChannelType.GuildCategory, t);
      }
      case 'create-text-channel': {
        return createServerChannel(interaction, ChannelType.GuildText, t);
      }
      case 'create-voice': {
        return createServerChannel(interaction, ChannelType.GuildVoice, t);
      }
      case 'setup': {
        return buildStarterServer(interaction, t);
      }
      case 'lock': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageChannels,
            'Manage Channels',
          ))
        )
          return;
        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased() || channel.isThread())
          return interaction.reply(ephemeral(t('errors.invalidChannel')));
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          SendMessages: false,
        });
        return interaction.reply(
          commandSuccess(interaction, t('responses.channelLocked', { channel })),
        );
      }
      case 'unlock': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageChannels,
            'Manage Channels',
          ))
        )
          return;
        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased() || channel.isThread())
          return interaction.reply(ephemeral(t('errors.invalidChannel')));
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          SendMessages: null,
        });
        return interaction.reply(
          commandSuccess(interaction, t('responses.channelUnlocked', { channel })),
        );
      }
      case 'user-info': {
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id);
        const roles =
          member.roles.cache
            .filter((role) => role.id !== interaction.guild.id)
            .map(String)
            .slice(0, 15)
            .join(', ') || '—';
        return interaction.reply(
          componentMessage({
            title: t('responses.userInfo'),
            description: user.toString(),
            mediaUrls: [user.displayAvatarURL({ size: 1024 })],
            fields: [
              { name: t('responses.userId'), value: user.id },
              {
                name: t('responses.created'),
                value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,
              },
              {
                name: t('responses.joined'),
                value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`,
              },
              { name: t('responses.roles'), value: roles },
            ],
          }),
        );
      }
      case 'role-info': {
        const role = interaction.options.getRole('role');
        return interaction.reply(
          componentMessage({
            title: t('responses.roleInfo'),
            description: role.toString(),
            accentColor: role.color || 0x5865f2,
            fields: [
              { name: t('responses.roleId'), value: role.id },
              { name: t('responses.roleMembers'), value: String(role.members.size) },
              { name: t('responses.roleColour'), value: role.hexColor },
              {
                name: t('responses.created'),
                value: `<t:${Math.floor(role.createdTimestamp / 1000)}:D>`,
              },
            ],
          }),
        );
      }
      case 'server-icon': {
        const icon = interaction.guild.iconURL({ size: 4096 });
        if (!icon) return interaction.reply(ephemeral(t('responses.serverHasNoIcon')));
        return interaction.reply(
          componentMessage({
            title: t('responses.serverIcon'),
            description: interaction.guild.name,
            mediaUrls: [icon],
          }),
        );
      }
      case 'poll': {
        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased())
          return interaction.reply(ephemeral(t('errors.invalidChannel')));
        if (
          channel.id !== interaction.channelId &&
          !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
        ) {
          return interaction.reply(ephemeral(t('errors.targetChannelPermission')));
        }
        const choiceOne = interaction.options.getString('choice-one');
        const choiceTwo = interaction.options.getString('choice-two');
        const message = await channel.send(
          componentMessage({
            title: t('responses.pollTitle'),
            description: interaction.options.getString('text'),
            fields: [
              { name: t('responses.pollChoice', { emoji: '1️⃣' }), value: choiceOne },
              { name: t('responses.pollChoice', { emoji: '2️⃣' }), value: choiceTwo },
            ],
            footer: interaction.user.tag,
          }),
        );
        await message.react('1️⃣');
        await message.react('2️⃣');
        return interaction.reply(ephemeral(t('responses.pollCreated')));
      }
      case 'announce': {
        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased())
          return interaction.reply(ephemeral(t('errors.generic')));
        await channel.send(
          componentMessage({
            title: t('responses.announcementTitle'),
            description: interaction.options.getString('text'),
            footer: interaction.user.tag,
          }),
        );
        return interaction.reply(ephemeral(t('responses.announcementSent')));
      }
      case 'set-nickname': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageNicknames,
            'Manage Nicknames',
          ))
        )
          return;
        const member = await targetMember(interaction);
        if (!manageable(interaction, member))
          return interaction.reply(ephemeral(t('errors.hierarchy')));
        await member.setNickname(
          interaction.options.getString('nickname'),
          reason(interaction),
        );
        return interaction.reply(
          commandSuccess(interaction, t('responses.nickname', { user: member.user.tag })),
        );
      }
      case 'reset-nickname': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageNicknames,
            'Manage Nicknames',
          ))
        )
          return;
        const member = await targetMember(interaction);
        if (!manageable(interaction, member))
          return interaction.reply(ephemeral(t('errors.hierarchy')));
        await member.setNickname(null, reason(interaction));
        return interaction.reply(
          commandSuccess(
            interaction,
            t('responses.nicknameReset', { user: member.user.tag }),
          ),
        );
      }
      case 'create-role': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageRoles,
            'Manage Roles',
          ))
        )
          return;
        const role = await interaction.guild.roles.create({
          name: interaction.options.getString('name'),
          reason: `Created by ${interaction.user.tag}`,
        });
        return interaction.reply(
          commandSuccess(interaction, t('responses.roleCreated', { role })),
        );
      }
      case 'channel-topic': {
        if (
          !(await requireBotPermission(
            interaction,
            PermissionFlagsBits.ManageChannels,
            'Manage Channels',
          ))
        )
          return;
        const channel = interaction.options.getChannel('channel');
        if (!channel || typeof channel.setTopic !== 'function')
          return interaction.reply(ephemeral(t('errors.generic')));
        await channel.setTopic(
          interaction.options.getString('text'),
          `Updated by ${interaction.user.tag}`,
        );
        return interaction.reply(
          commandSuccess(interaction, t('responses.channelTopic', { channel })),
        );
      }
      case 'quote': {
        const message = await interaction.channel.messages
          .fetch(interaction.options.getString('message-id'))
          .catch(() => null);
        if (!message) return interaction.reply(ephemeral(t('responses.quoteMissing')));
        return interaction.reply(
          componentMessage({
            title: t('responses.quoteTitle', { user: message.author.tag }),
            description: message.content || t('responses.notFound'),
            footer: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`,
          }),
        );
      }
      default:
        if (await handleExtendedCommand(commandName, interaction, t, client)) return;
        throw new Error(`No handler registered for command: ${commandName}`);
    }
  } catch (error) {
    await handleInteractionError(interaction, error, t);
  }
});

client.once('ready', () => {
  restoreGiveaways(client, t);
  console.log(`Ready as ${client.user.tag}; registered ${commands.length} commands.`);
});
client.on('guildMemberAdd', (member) => {
  syncStore()
    .then(async () => {
      const removed = await protectNewMember(member, t);
      if (removed) return;
      await assignAutoRole(member);
      const welcome = guildConfig(member.guild.id).welcome;
      if (!welcome?.enabled || !welcome.channelId) return;
      const channel = await member.guild.channels
        .fetch(welcome.channelId)
        .catch(() => null);
      if (!channel?.isTextBased()) return;
      const message = (welcome.message || t('modules.welcomeMessage'))
        .replaceAll('{user}', member.toString())
        .replaceAll('{server}', member.guild.name);
      await channel
        .send(
          componentMessage({
            title: t('modules.welcomeTitle'),
            description: message,
            accentColor: 0x57f287,
          }),
        )
        .catch(() => {});
    })
    .catch((error) =>
      console.error('[auto-role-event]', { guildId: member.guild.id }, error),
    );
});
client.on('guildMemberRemove', (member) => {
  syncStore()
    .then(async () => {
      const goodbye = guildConfig(member.guild.id).goodbye;
      if (!goodbye?.enabled || !goodbye.channelId) return;
      const channel = await member.guild.channels
        .fetch(goodbye.channelId)
        .catch(() => null);
      if (!channel?.isTextBased()) return;
      const message = (goodbye.message || t('modules.goodbyeMessage'))
        .replaceAll('{user}', member.user.tag)
        .replaceAll('{server}', member.guild.name);
      await channel
        .send(
          componentMessage({
            title: t('modules.goodbyeTitle'),
            description: message,
          }),
        )
        .catch(() => {});
    })
    .catch((error) =>
      console.error('[goodbye-event]', { guildId: member.guild.id }, error),
    );
});
client.on('messageCreate', (message) => {
  syncStore()
    .then(() => filterAutomodMessage(message, t))
    .then((handled) => (handled ? true : filterLinks(message, t)))
    .catch((error) =>
      console.error('[automod-event]', { guildId: message.guildId }, error),
    );
});
client.on('messageReactionAdd', (reaction, user) => {
  syncStore()
    .then(() => applyReactionRole(reaction, user, true))
    .catch((error) =>
      console.error('[reaction-role-add-event]', { userId: user.id }, error),
    );
});
client.on('messageReactionRemove', (reaction, user) => {
  syncStore()
    .then(() => applyReactionRole(reaction, user, false))
    .catch((error) =>
      console.error('[reaction-role-remove-event]', { userId: user.id }, error),
    );
});
if (!discordDryRun) {
  client.login(process.env.DISCORD_TOKEN);
}

export const registeredCommands = commands;

const shutdown = async () => {
  await saveStore().catch(() => {});
  client.destroy();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
