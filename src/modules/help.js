import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { catalog } from '../catalog.js';
import { TOP_LEVEL_COMMANDS } from '../top-level-commands.js';
import { componentMessage, errorMessage } from '../ui/components.js';
import { commandOptionPresentation, slashRoute } from '../command-routes.js';

const COMPONENT_PREFIX = 'sparkles-help';
const COMPONENT_VERSION = 'v1';
const DEFAULT_PAGE_SIZE = 7;
const MAX_PAGE_SIZE = 8;
const MAX_SELECT_OPTIONS = 25;
const MAX_SELECT_DESCRIPTION_LENGTH = 100;
const MAX_BUTTON_LABEL_LENGTH = 80;
const MAX_CATEGORY_ID_LENGTH = 32;
const MAX_HOME_CATEGORY_NAME_LENGTH = 48;
const MAX_HOME_CATEGORY_DESCRIPTION_LENGTH = 75;
const MAX_COMMAND_SUMMARY_LENGTH = 300;
const MAX_COMMAND_DESCRIPTION_LENGTH = 3_000;
const MAX_ROUTE_LENGTH = 100;
const MAX_PERMISSION_LENGTH = 500;
const MAX_EXAMPLE_LENGTH = 350;
const MAX_EXAMPLES = 5;

/**
 * Default command modules. A command can appear in only one module; the first
 * matching module wins. Commands added to the catalog later are automatically
 * shown in the generated "other" module until they are classified here.
 */
export const DEFAULT_HELP_CATEGORIES = Object.freeze([
  {
    id: 'information',
    emoji: '✨',
    commands: [
      'help',
      'ping',
      'bot-info',
      'info',
      'invite',
      'avatar',
      'server-icon',
      'browse',
      'search',
      'web-status',
      'lookup',
      'control-panel',
    ],
  },
  {
    id: 'moderation',
    emoji: '🛡️',
    commands: [
      'ban',
      'blacklist',
      'clear',
      'clear-warnings',
      'kick',
      'logs',
      'rename',
      'set-nickname',
      'reset-nickname',
      'soft-ban',
      'sudo',
      'timeout',
      'unban',
      'untimeout',
      'user-warnings',
      'warn',
      'whitelist',
    ],
  },
  {
    id: 'automod',
    emoji: '🧰',
    commands: [
      'anti-alt',
      'anti-bot',
      'anti-link',
      'anti-raid',
      'anti-swear',
      'auto-status',
      'automod',
      'disable-links',
      'enable-links',
      'filter-http',
      'filter-https',
      'set-verification',
      'verify',
    ],
  },
  {
    id: 'roles-members',
    emoji: '👥',
    commands: [
      'add-role',
      'remove-role',
      'create-role',
      'delete-role',
      'modify-role',
      'user-role',
      'auto-role',
      'reaction-role',
      'user-info',
      'role-info',
      'status',
    ],
  },
  {
    id: 'server-builder',
    emoji: '🏗️',
    commands: [
      'setup',
      'backup',
      'create-category',
      'create-text-channel',
      'create-voice',
      'delete-channel',
      'channel-topic',
      'lock',
      'unlock',
      'module',
      'slowmode',
      'rules',
      'thread',
    ],
  },
  {
    id: 'community',
    emoji: '💬',
    commands: [
      'announce',
      'giveaway',
      'poll',
      'quote',
      'reply',
      'say',
      'set-suggestions',
      'reset-suggestions',
      'suggest',
      'tag',
    ],
  },
  {
    id: 'economy-profile',
    emoji: '🪙',
    commands: [
      'achievement',
      'balance',
      'beg',
      'daily',
      'deposit',
      'health',
      'level',
      'open',
      'profile',
      'purchase',
      'reward',
      'rob',
      'set-currency',
      'set-profile',
      'shop',
      'weekly',
      'withdraw',
    ],
  },
  {
    id: 'fun',
    emoji: '🎮',
    commands: ['coinflip', 'dice', 'guess', 'memory', 'random', 'rps'],
  },
  {
    id: 'music',
    emoji: '🎵',
    commands: [
      'join-voice',
      'lyrics',
      'now-playing',
      'play',
      'queue',
      'skip',
      'song-search',
      'volume',
    ],
  },
  {
    id: 'events',
    emoji: '🏆',
    commands: [
      'add-points',
      'create-event',
      'create-tournament',
      'delete-event',
      'delete-tournament',
      'leaderboard',
      'list',
      'organize',
      'ratings',
      'remove-points',
    ],
  },
  {
    id: 'tools-ai',
    emoji: '🧠',
    commands: ['ask', 'define', 'pastebin', 'translate', 'weather', 'start', 'stop'],
  },
  {
    id: 'custom-premium',
    emoji: '🛠️',
    commands: [
      'add-premium',
      'alert',
      'claim',
      'custom',
      'debug',
      'embed',
      'files',
      'generate',
      'generate-code',
      'prefix-only',
      'premium',
      'redeem-code',
      'remove-permissions',
      'remove-premium',
      'run-custom-command',
      'ticket',
      'view',
    ],
  },
]);

/**
 * English fallback copy used when a locale does not yet contain a help key.
 * Applications can translate every key through the `t` function passed to the
 * exported handlers without changing this module.
 */
export const HELP_TRANSLATION_DEFAULTS = Object.freeze({
  'help.title': '✨ Sparkles Command Center',
  'help.description':
    'Choose what you want to do. Every command shows only the inputs it actually needs.',
  'help.summaryName': 'System online',
  'help.summaryValue': '{commands} tools • {categories} focused modules',
  'help.quickStartName': 'Quick launch',
  'help.quickStartValue': '`/setup`  `/anti-link`  `/suggest`  `/music play`',
  'help.categorySelect': 'Select a module…',
  'help.commandSelect': 'Select a command…',
  'help.categoryTitle': '{emoji} {category}',
  'help.categorySummary': '{count} available commands',
  'help.categoryFooter': 'Choose a command to see its exact inputs.',
  'help.commandTitle': '⚡ {route}',
  'help.commandLaunch': 'Run this',
  'help.commandInputs': 'Inputs',
  'help.noInputs': 'No options needed—run it and Sparkles handles the rest.',
  'help.requiredInput': 'Required',
  'help.optionalInput': 'Optional',
  'help.commandPermission': 'Required permission',
  'help.commandExamples': 'Examples',
  'help.commandFooter': 'Discord will prompt you only for the inputs shown above.',
  'help.home': '⌂ Modules',
  'help.previous': '← Previous',
  'help.next': 'Next →',
  'help.back': '← Module',
  'help.close': '✕ Close',
  'help.page': 'Page {current}/{total}',
  'help.closedTitle': 'Help closed',
  'help.closedDescription': 'Run `/help` whenever you need the command guide again.',
  'help.ownerOnlyTitle': 'This menu belongs to someone else',
  'help.ownerOnlyDescription': 'Run `/help` to open your own private command guide.',
  'help.unavailableTitle': 'Help view unavailable',
  'help.unavailableDescription':
    'That module or command no longer exists. Run `/help` to refresh the guide.',
  'help.category.information.name': 'Information',
  'help.category.information.description':
    'Bot details, server information, and navigation',
  'help.category.moderation.name': 'Moderation',
  'help.category.moderation.description': 'Member safety and moderator actions',
  'help.category.automod.name': 'Auto moderation',
  'help.category.automod.description':
    'Automatic filters, verification, and raid protection',
  'help.category.roles-members.name': 'Roles & members',
  'help.category.roles-members.description':
    'Roles, member profiles, and automatic role tools',
  'help.category.server-builder.name': 'Server builder',
  'help.category.server-builder.description':
    'Channels, layout, permissions, and server configuration',
  'help.category.community.name': 'Community',
  'help.category.community.description':
    'Suggestions, announcements, polls, tags, and conversations',
  'help.category.economy-profile.name': 'Economy & profiles',
  'help.category.economy-profile.description':
    'Currency, rewards, progression, and member profiles',
  'help.category.fun.name': 'Fun & games',
  'help.category.fun.description': 'Games and lightweight entertainment',
  'help.category.music.name': 'Music',
  'help.category.music.description': 'Voice playback, queues, tracks, and lyrics',
  'help.category.events.name': 'Events & tournaments',
  'help.category.events.description': 'Events, competitions, points, and leaderboards',
  'help.category.tools-ai.name': 'Tools & AI',
  'help.category.tools-ai.description':
    'AI chat, language, weather, and practical utilities',
  'help.category.custom-premium.name': 'Custom & premium',
  'help.category.custom-premium.description':
    'Custom commands, premium features, and staff tools',
  'help.category.other.name': 'Other',
  'help.category.other.description':
    'New commands that have not been assigned to a module yet',
});

function interpolate(template, values) {
  return Object.entries(values).reduce(
    (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
}

function localize(t, key, values = {}, fallback = HELP_TRANSLATION_DEFAULTS[key] ?? key) {
  const localizedFallback = interpolate(fallback, values);

  if (typeof t !== 'function') {
    return localizedFallback;
  }

  const translated = t(key, values);
  return typeof translated === 'string' && translated !== key
    ? translated
    : localizedFallback;
}

function clampInteger(value, minimum, maximum) {
  const integer = Number.isSafeInteger(value) ? value : minimum;
  return Math.min(Math.max(integer, minimum), maximum);
}

function truncate(value, maximumLength) {
  if (value.length <= maximumLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maximumLength - 1))}…`;
}

function normalizeCommand(command) {
  if (
    !command ||
    typeof command.name !== 'string' ||
    !/^[a-z0-9_-]{1,32}$/.test(command.name) ||
    typeof command.description !== 'string' ||
    !command.description.trim()
  ) {
    return null;
  }

  return {
    ...command,
    description: command.description.trim(),
  };
}

function normalizeCategory(category) {
  if (
    !category ||
    typeof category.id !== 'string' ||
    category.id.length > MAX_CATEGORY_ID_LENGTH ||
    !/^[a-z0-9-]+$/.test(category.id) ||
    !Array.isArray(category.commands)
  ) {
    return null;
  }

  return {
    id: category.id,
    emoji: typeof category.emoji === 'string' ? category.emoji : undefined,
    commands: category.commands.filter((name) => typeof name === 'string'),
  };
}

function buildModules(commands, categories) {
  const commandMap = new Map();
  for (const command of commands) {
    const normalized = normalizeCommand(command);
    if (normalized && !commandMap.has(normalized.name)) {
      commandMap.set(normalized.name, normalized);
    }
  }

  const claimedCommands = new Set();
  const claimedCategoryIds = new Set();
  const modules = [];

  for (const rawCategory of categories) {
    const category = normalizeCategory(rawCategory);
    if (!category || claimedCategoryIds.has(category.id)) {
      continue;
    }
    claimedCategoryIds.add(category.id);

    const categoryCommands = [];
    for (const commandName of category.commands) {
      const command = commandMap.get(commandName);
      if (command && !claimedCommands.has(commandName)) {
        claimedCommands.add(commandName);
        const topLevel = TOP_LEVEL_COMMANDS.has(command.name);
        categoryCommands.push({
          ...command,
          route: slashRoute(command.name, category.id, topLevel),
          options: commandOptionPresentation(command.name, topLevel),
        });
      }
    }

    if (categoryCommands.length > 0) {
      modules.push({ ...category, commands: categoryCommands });
    }
  }

  const unclassifiedCommands = [...commandMap.values()].filter(
    ({ name }) => !claimedCommands.has(name),
  );

  if (unclassifiedCommands.length > 0) {
    modules.push({
      id: 'other',
      emoji: '📦',
      commands: unclassifiedCommands.map((command) => ({
        ...command,
        route: slashRoute(command.name, 'other', false),
        options: commandOptionPresentation(command.name, false),
      })),
    });
  }

  if (modules.length <= MAX_SELECT_OPTIONS) {
    return modules;
  }

  const visibleModules = modules.slice(0, MAX_SELECT_OPTIONS - 1);
  const overflowCommands = modules
    .slice(MAX_SELECT_OPTIONS - 1)
    .flatMap((category) => category.commands);

  visibleModules.push({ id: 'other', emoji: '📦', commands: overflowCommands });
  return visibleModules;
}

function categoryName(category, t) {
  return localize(t, `help.category.${category.id}.name`);
}

function categoryDescription(category, t) {
  return localize(t, `help.category.${category.id}.description`);
}

function commandDescription(command, t) {
  return localize(t, `help.command.${command.name}.description`, {}, command.description);
}

function commandInputs(command, t) {
  if (!command.options?.length) return localize(t, 'help.noInputs');

  return command.options
    .map((option) => {
      const requirement = localize(
        t,
        option.required ? 'help.requiredInput' : 'help.optionalInput',
      );
      const explanation = option.descriptionKey ? t(option.descriptionKey) : requirement;
      return `**${option.name}** · ${requirement}\n-# ${explanation}`;
    })
    .join('\n');
}

function customId(action, ownerId, ...state) {
  return [COMPONENT_PREFIX, COMPONENT_VERSION, action, ownerId, ...state].join(':');
}

function parseCustomId(value) {
  const [prefix, version, action, ownerId, ...state] = value.split(':');

  if (
    prefix !== COMPONENT_PREFIX ||
    version !== COMPONENT_VERSION ||
    !['category', 'command', 'home', 'page', 'back', 'close'].includes(action) ||
    !/^\d{1,20}$/.test(ownerId)
  ) {
    return null;
  }

  return { action, ownerId, state };
}

function categorySelectRow(ownerId, modules, selectedCategoryId, t) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId('category', ownerId))
    .setPlaceholder(localize(t, 'help.categorySelect'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      modules.map((category) => ({
        label: truncate(categoryName(category, t), MAX_SELECT_DESCRIPTION_LENGTH),
        value: category.id,
        description: truncate(
          `${category.commands.length} · ${categoryDescription(category, t)}`,
          MAX_SELECT_DESCRIPTION_LENGTH,
        ),
        emoji: category.emoji,
        default: category.id === selectedCategoryId,
      })),
    );

  return new ActionRowBuilder().addComponents(menu);
}

function commandSelectRow(ownerId, category, page, commands, t) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId('command', ownerId, category.id, String(page)))
    .setPlaceholder(localize(t, 'help.commandSelect'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      commands.map((command) => ({
        label: truncate(`/${command.name}`, MAX_SELECT_DESCRIPTION_LENGTH),
        value: command.name,
        description: truncate(
          commandDescription(command, t),
          MAX_SELECT_DESCRIPTION_LENGTH,
        ),
      })),
    );

  return new ActionRowBuilder().addComponents(menu);
}

function navigationRow(ownerId, category, page, pageCount, t) {
  const categoryId = category.id;
  const previousPage = Math.max(0, page - 1);
  const nextPage = Math.min(pageCount - 1, page + 1);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('home', ownerId))
      .setLabel(truncate(localize(t, 'help.home'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(customId('page', ownerId, categoryId, String(previousPage)))
      .setLabel(truncate(localize(t, 'help.previous'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(customId('back', ownerId, categoryId, String(page)))
      .setLabel(
        truncate(
          localize(t, 'help.page', { current: page + 1, total: pageCount }),
          MAX_BUTTON_LABEL_LENGTH,
        ),
      )
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(customId('page', ownerId, categoryId, String(nextPage)))
      .setLabel(truncate(localize(t, 'help.next'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === pageCount - 1),
    new ButtonBuilder()
      .setCustomId(customId('close', ownerId))
      .setLabel(truncate(localize(t, 'help.close'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Danger),
  );
}

function homeNavigationRow(ownerId, t) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('home', ownerId))
      .setLabel(truncate(localize(t, 'help.home'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(customId('close', ownerId))
      .setLabel(truncate(localize(t, 'help.close'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Danger),
  );
}

function detailNavigationRow(ownerId, category, page, t) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('back', ownerId, category.id, String(page)))
      .setLabel(truncate(localize(t, 'help.back'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('home', ownerId))
      .setLabel(truncate(localize(t, 'help.home'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(customId('close', ownerId))
      .setLabel(truncate(localize(t, 'help.close'), MAX_BUTTON_LABEL_LENGTH))
      .setStyle(ButtonStyle.Danger),
  );
}

function messagePayload(options) {
  return {
    ...componentMessage(options),
    allowedMentions: { parse: [] },
  };
}

function homePayload(ownerId, modules, commandCount, t, ephemeral) {
  const actionRows = [homeNavigationRow(ownerId, t)];
  if (modules.length > 0) {
    actionRows.unshift(categorySelectRow(ownerId, modules, undefined, t));
  }

  return messagePayload({
    title: localize(t, 'help.title'),
    description: localize(t, 'help.description'),
    fields: [
      {
        name: localize(t, 'help.summaryName'),
        value: localize(t, 'help.summaryValue', {
          commands: commandCount,
          categories: modules.length,
        }),
      },
      {
        name: localize(t, 'help.quickStartName'),
        value: localize(t, 'help.quickStartValue'),
      },
    ],
    actionRows,
    ephemeral,
    accentColor: 0x8b5cf6,
  });
}

function categoryPayload(ownerId, modules, category, rawPage, pageSize, t) {
  const pageCount = Math.max(1, Math.ceil(category.commands.length / pageSize));
  const page = clampInteger(rawPage, 0, pageCount - 1);
  const pageCommands = category.commands.slice(page * pageSize, (page + 1) * pageSize);

  return messagePayload({
    title: localize(t, 'help.categoryTitle', {
      emoji: category.emoji ?? '📦',
      category: categoryName(category, t),
    }),
    description: `${categoryDescription(category, t)}\n-# ${localize(
      t,
      'help.categorySummary',
      { count: category.commands.length },
    )}`,
    fields: pageCommands.map((command) => ({
      name: `\`${command.route}\``,
      value: truncate(commandDescription(command, t), MAX_COMMAND_SUMMARY_LENGTH),
    })),
    footer: localize(t, 'help.categoryFooter'),
    actionRows: [
      categorySelectRow(ownerId, modules, category.id, t),
      commandSelectRow(ownerId, category, page, pageCommands, t),
      navigationRow(ownerId, category, page, pageCount, t),
    ],
  });
}

function commandPayload(ownerId, modules, category, command, page, t) {
  const fields = [
    {
      name: localize(t, 'help.commandLaunch'),
      value: `\`${truncate(command.route, MAX_ROUTE_LENGTH)}\``,
    },
    {
      name: localize(t, 'help.commandInputs'),
      value: commandInputs(command, t),
    },
  ];

  if (command.permission) {
    fields.push({
      name: localize(t, 'help.commandPermission'),
      value: truncate(String(command.permission), MAX_PERMISSION_LENGTH),
    });
  }

  if (Array.isArray(command.examples) && command.examples.length > 0) {
    fields.push({
      name: localize(t, 'help.commandExamples'),
      value: command.examples
        .slice(0, MAX_EXAMPLES)
        .map((example) => `\`${truncate(String(example), MAX_EXAMPLE_LENGTH)}\``)
        .join('\n'),
    });
  }

  return messagePayload({
    title: localize(t, 'help.commandTitle', { route: command.route }),
    description: truncate(commandDescription(command, t), MAX_COMMAND_DESCRIPTION_LENGTH),
    fields,
    footer: localize(t, 'help.commandFooter'),
    actionRows: [
      categorySelectRow(ownerId, modules, category.id, t),
      detailNavigationRow(ownerId, category, page, t),
    ],
    accentColor: 0x8b5cf6,
  });
}

function unavailablePayload(t) {
  return errorMessage(
    localize(t, 'help.unavailableTitle'),
    localize(t, 'help.unavailableDescription'),
  );
}

function findCategory(modules, categoryId) {
  return modules.find((category) => category.id === categoryId);
}

function parsePage(value) {
  if (!/^\d{1,3}$/.test(value ?? '')) {
    return null;
  }

  return Number(value);
}

function resolveOptions(options = {}) {
  const commands = Array.isArray(options.commands) ? options.commands : catalog;
  const categories = Array.isArray(options.categories)
    ? options.categories
    : DEFAULT_HELP_CATEGORIES;
  const pageSize = clampInteger(options.pageSize, 1, MAX_PAGE_SIZE);

  return {
    modules: buildModules(commands, categories),
    pageSize: options.pageSize === undefined ? DEFAULT_PAGE_SIZE : pageSize,
    ephemeral: options.ephemeral !== false,
  };
}

/**
 * Sends the initial interactive Components V2 help menu.
 */
export function showHelp(interaction, t, options = {}) {
  const resolved = resolveOptions(options);
  const commandCount = resolved.modules.reduce(
    (total, category) => total + category.commands.length,
    0,
  );

  return interaction.reply(
    homePayload(
      interaction.user.id,
      resolved.modules,
      commandCount,
      t,
      resolved.ephemeral,
    ),
  );
}

/**
 * Handles button and string-select interactions created by {@link showHelp}.
 * Returns `true` when the component belongs to help, otherwise `false` so the
 * application's main router can continue trying other component handlers.
 */
export async function handleHelpInteraction(interaction, t, options = {}) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
    return false;
  }

  if (!interaction.customId.startsWith(`${COMPONENT_PREFIX}:`)) {
    return false;
  }

  const component = parseCustomId(interaction.customId);
  if (!component) {
    await interaction.reply(unavailablePayload(t));
    return true;
  }

  if (component.ownerId !== interaction.user.id) {
    await interaction.reply(
      errorMessage(
        localize(t, 'help.ownerOnlyTitle'),
        localize(t, 'help.ownerOnlyDescription'),
      ),
    );
    return true;
  }

  const resolved = resolveOptions(options);
  const commandCount = resolved.modules.reduce(
    (total, category) => total + category.commands.length,
    0,
  );

  if (component.action === 'close') {
    await interaction.update(
      messagePayload({
        title: localize(t, 'help.closedTitle'),
        description: localize(t, 'help.closedDescription'),
      }),
    );
    return true;
  }

  if (component.action === 'home') {
    await interaction.update(
      homePayload(interaction.user.id, resolved.modules, commandCount, t, false),
    );
    return true;
  }

  if (component.action === 'category') {
    const category = findCategory(resolved.modules, interaction.values[0]);
    if (!category) {
      await interaction.reply(unavailablePayload(t));
      return true;
    }

    await interaction.update(
      categoryPayload(
        interaction.user.id,
        resolved.modules,
        category,
        0,
        resolved.pageSize,
        t,
      ),
    );
    return true;
  }

  const [categoryId, pageValue] = component.state;
  const category = findCategory(resolved.modules, categoryId);
  const page = parsePage(pageValue);

  if (!category || page === null) {
    await interaction.reply(unavailablePayload(t));
    return true;
  }

  if (component.action === 'command') {
    const command = category.commands.find(({ name }) => name === interaction.values[0]);

    if (!command) {
      await interaction.reply(unavailablePayload(t));
      return true;
    }

    await interaction.update(
      commandPayload(interaction.user.id, resolved.modules, category, command, page, t),
    );
    return true;
  }

  if (component.action === 'page' || component.action === 'back') {
    await interaction.update(
      categoryPayload(
        interaction.user.id,
        resolved.modules,
        category,
        page,
        resolved.pageSize,
        t,
      ),
    );
    return true;
  }

  await interaction.reply(unavailablePayload(t));
  return true;
}

/**
 * Creates bound handlers when an application supplies a custom command catalog,
 * category list, page size, or public/private response preference.
 */
export function createHelpSystem(options = {}) {
  return Object.freeze({
    show: (interaction, t) => showHelp(interaction, t, options),
    handleInteraction: (interaction, t) => handleHelpInteraction(interaction, t, options),
  });
}
