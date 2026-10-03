import { REST, PermissionFlagsBits as P } from 'discord.js';
import { createHash } from 'node:crypto';
import { CAPABILITIES, FEATURES, ensure, PlatformError, validMessage } from '../../shared/platform-schema.js';
import { DISCORD_LIMITS, EMPTY_MESSAGE, renderMessage } from '../../shared/discord-limits.js';
import { platformConfig as limits } from './config.js';
import { TABLES } from './store.js';

export const hasPermission = (bits, permission) => (bits & P.Administrator) !== 0n || (bits & permission) === permission;
export function memberPermissions(member, roles, guildId) {
  return roles.filter(role => role.id === guildId || member.roles.includes(role.id)).reduce((bits, role) => bits | BigInt(role.permissions), 0n);
}
export function channelPermissions(member, roles, channel, guildId) {
  let bits = memberPermissions(member, roles, guildId);
  if (hasPermission(bits, P.Administrator)) return bits;
  const overwrites = channel.permission_overwrites ?? [];
  const everyone = overwrites.find(item => item.id === guildId);
  if (everyone) bits = (bits & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let allow = 0n; let deny = 0n;
  for (const overwrite of overwrites.filter(item => item.type === 0 && member.roles.includes(item.id))) {
    allow |= BigInt(overwrite.allow); deny |= BigInt(overwrite.deny);
  }
  bits = (bits & ~deny) | allow;
  const user = overwrites.find(item => item.type === 1 && item.id === member.user.id);
  if (user) bits = (bits & ~BigInt(user.deny)) | BigInt(user.allow);
  return bits;
}
export function compareRoles(left, right) {
  if (left.position !== right.position) return left.position - right.position;
  return BigInt(left.id) < BigInt(right.id) ? 1 : BigInt(left.id) > BigInt(right.id) ? -1 : 0;
}
export function highestRole(member, roles, guildId) {
  return roles.filter(role => role.id === guildId || member.roles.includes(role.id)).sort((left, right) => compareRoles(right, left))[0];
}
const unsafeRoleBits = P.Administrator | P.ManageGuild | P.ManageRoles | P.BanMembers | P.KickMembers | P.ManageChannels | P.ManageWebhooks | P.ModerateMembers;
const permissionLabels = new Map([
  [P.ViewChannel, 'View Channel'],
  [P.SendMessages, 'Send Messages'],
  [P.SendMessagesInThreads, 'Send Messages in Threads'],
  [P.EmbedLinks, 'Embed Links'],
  [P.ManageRoles, 'Manage Roles'],
  [P.ManageChannels, 'Manage Channels'],
  [P.ManageMessages, 'Manage Messages'],
  [P.ModerateMembers, 'Moderate Members'],
  [P.KickMembers, 'Kick Members'],
  [P.BanMembers, 'Ban Members'],
  [P.MentionEveryone, 'Mention Everyone'],
]);
function missingPermissions(bits, permissions) {
  return permissions
    .filter(permission => !hasPermission(bits, permission))
    .map(permission => permissionLabels.get(permission) ?? String(permission));
}
function roleDetail(role, roleId, reason, extra = {}) {
  return {
    code: 'role',
    roleId,
    roleName: role?.name ?? null,
    reason,
    ...extra,
  };
}

export class DiscordPlatform {
  constructor({ token, clientId, store, rest } = {}) {
    this.rest = rest ?? new REST({ version: '10', retries: 0 }).setToken(token);
    this.clientId = clientId; this.store = store; this.cache = new Map();
  }
  async request(method, path, body, reason) {
    try { return await this.rest[method.toLowerCase()](path, { ...(body === undefined ? {} : { body }), ...(reason ? { reason: reason.slice(0, 512) } : {}) }); }
    catch (error) {
      const code = error.status === 403 ? 'BOT_MISSING_PERMISSION' : error.status === 404 ? 'DISCORD_OBJECT_DELETED' : error.status === 429 ? 'DISCORD_RATE_LIMITED' : 'DISCORD_REQUEST_FAILED';
      const result = new PlatformError(code, error.status === 404 ? 404 : 409);
      result.uncertain = !error.status || error.status >= 500;
      throw result;
    }
  }
  async context(guildId, { fresh = false } = {}) {
    if (!fresh && this.cache.get(guildId)?.expires > Date.now()) return this.cache.get(guildId).value;
    const [guild, roles, channels, bot] = await Promise.all([
      this.request('GET', `/guilds/${guildId}?with_counts=true`),
      this.request('GET', `/guilds/${guildId}/roles`),
      this.request('GET', `/guilds/${guildId}/channels`),
      this.request('GET', `/guilds/${guildId}/members/${this.clientId}`),
    ]);
    const value = { guild, roles, channels, bot, permissions: memberPermissions(bot, roles, guildId) };
    this.cache.set(guildId, { value, expires: Date.now() + limits.metadataCacheMs });
    return value;
  }
  async member(guildId, userId) { return this.request('GET', `/guilds/${guildId}/members/${userId}`); }
  async capabilities(guildId, userId, context = null) {
    const state = context ?? await this.context(guildId);
    const member = await this.member(guildId, userId);
    const permissions = memberPermissions(member, state.roles, guildId);
    if (state.guild.owner_id === userId || hasPermission(permissions, P.Administrator)) return { member, permissions, capabilities: [...CAPABILITIES], owner: state.guild.owner_id === userId };
    const access = await (await this.store.database()).collection(TABLES.access).findOne({ _id: guildId });
    const granted = new Set(hasPermission(permissions, P.ManageGuild) ? (access?.managerCapabilities ?? CAPABILITIES.filter(key => key !== 'manage_access')) : []);
    for (const grant of access?.grants ?? []) if ((grant.userId && grant.userId === userId) || (grant.roleId && member.roles.includes(grant.roleId))) {
      for (const capability of grant.capabilities) if (capability !== 'manage_access') granted.add(capability);
    }
    return { member, permissions, capabilities: [...granted], owner: false };
  }
  async authorize(guildId, userId, capability, { fresh = false } = {}) {
    const context = await this.context(guildId, { fresh });
    const actor = await this.capabilities(guildId, userId, context);
    ensure(
      actor.capabilities.includes(capability),
      'DASHBOARD_FORBIDDEN',
      403,
      [
        {
          code: 'missing_capability',
          capability,
          currentCapabilities: actor.capabilities,
          guildId,
        },
      ],
    );
    return { ...context, actor };
  }
  publicResources(context) {
    const { guild, bot, roles, channels, permissions } = context;
    const highest = highestRole(bot, roles, guild.id);
    return {
      guild: { id: guild.id, name: guild.name, memberCount: guild.approximate_member_count ?? null, onlineCount: guild.approximate_presence_count ?? null },
      channels: channels.filter(channel => [0, 5, 15, 16].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parent_id,
        canSend: hasPermission(channelPermissions(bot, roles, channel, guild.id), P.ViewChannel | P.SendMessages) })),
      categories: channels.filter(channel => channel.type === 4).map(channel => ({ id: channel.id, name: channel.name })),
      roles: roles.filter(role => role.id !== guild.id).sort((a, b) => compareRoles(b, a)).map(role => ({ id: role.id, name: role.name, color: role.color, position: role.position, managed: role.managed,
        dangerous: (BigInt(role.permissions) & unsafeRoleBits) !== 0n,
        assignable: !role.managed && hasPermission(permissions, P.ManageRoles) && compareRoles(highest, role) > 0 })),
      capabilities: context.actor?.capabilities ?? [],
    };
  }
  async destination(guildId, channelId, { embed = false, actorId, fresh = true } = {}) {
    const context = await this.context(guildId, { fresh });
    const channel = await this.request('GET', `/channels/${channelId}`);
    ensure(
      channel.guild_id === guildId && [0, 5, 10, 11, 12].includes(channel.type),
      'INVALID_CHANNEL',
      400,
      [
        {
          code: 'channel',
          channelId,
          channelName: channel.name ?? null,
          reason:
            channel.guild_id !== guildId
              ? 'different_guild'
              : 'unsupported_channel_type',
        },
      ],
    );
    ensure(
      !channel.thread_metadata?.archived && !channel.thread_metadata?.locked,
      'CHANNEL_UNAVAILABLE',
      409,
      [
        {
          code: 'channel',
          channelId,
          channelName: channel.name ?? null,
          reason: channel.thread_metadata?.archived ? 'archived' : 'locked',
        },
      ],
    );
    const parent =
      channel.parent_id && [10, 11, 12].includes(channel.type)
        ? await this.request('GET', `/channels/${channel.parent_id}`)
        : channel;
    const requiredPermissions = [
      P.ViewChannel,
      [10, 11, 12].includes(channel.type)
        ? P.SendMessagesInThreads
        : P.SendMessages,
      ...(embed ? [P.EmbedLinks] : []),
    ];
    const botMissing = missingPermissions(
      channelPermissions(context.bot, context.roles, parent, guildId),
      requiredPermissions,
    );
    ensure(
      !botMissing.length,
      'BOT_MISSING_PERMISSION',
      409,
      [
        {
          code: 'bot_permissions',
          permissions: botMissing,
          channelId,
          channelName: channel.name ?? null,
        },
      ],
    );
    if (actorId) {
      const actor = await this.member(guildId, actorId);
      ensure(
        hasPermission(
          channelPermissions(actor, context.roles, parent, guildId),
          P.ViewChannel,
        ),
        'DASHBOARD_FORBIDDEN',
        403,
        [
          {
            code: 'actor_channel_permission',
            permission: 'View Channel',
            channelId,
            channelName: channel.name ?? null,
          },
        ],
      );
    }
    return { context, channel };
  }
  async manageableRole(guildId, roleId, { actorId, selfService = false, context } = {}) {
    const state = context ?? await this.context(guildId, { fresh: true });
    const role = state.roles.find(item => item.id === roleId);
    ensure(
      role && role.id !== guildId,
      'INVALID_ROLE',
      400,
      [roleDetail(role, roleId, role ? 'everyone_role' : 'not_found')],
    );
    ensure(
      !role.managed,
      'ROLE_HIERARCHY',
      409,
      [roleDetail(role, roleId, 'managed_by_discord_or_integration')],
    );
    ensure(
      hasPermission(state.permissions, P.ManageRoles),
      'BOT_MISSING_PERMISSION',
      409,
      [
        {
          code: 'bot_permissions',
          permissions: ['Manage Roles'],
          roleId,
          roleName: role.name,
        },
      ],
    );
    const botHighest = highestRole(state.bot, state.roles, guildId);
    ensure(
      compareRoles(botHighest, role) > 0,
      'ROLE_HIERARCHY',
      409,
      [
        roleDetail(role, roleId, 'bot_role_too_low', {
          botHighestRoleId: botHighest?.id ?? null,
          botHighestRoleName: botHighest?.name ?? null,
        }),
      ],
    );
    if (selfService) {
      ensure(
        (BigInt(role.permissions) & unsafeRoleBits) === 0n,
        'DANGEROUS_SELF_ROLE',
        409,
        [roleDetail(role, roleId, 'unsafe_permissions')],
      );
    }
    if (actorId && actorId !== state.guild.owner_id) {
      const actor = await this.member(guildId, actorId);
      const actorPermissions = memberPermissions(actor, state.roles, guildId);
      const actorHighest = highestRole(actor, state.roles, guildId);
      ensure(
        hasPermission(actorPermissions, P.ManageRoles),
        'ACTOR_ROLE_HIERARCHY',
        403,
        [
          roleDetail(role, roleId, 'actor_missing_manage_roles', {
            permission: 'Manage Roles',
          }),
        ],
      );
      ensure(
        compareRoles(actorHighest, role) > 0,
        'ACTOR_ROLE_HIERARCHY',
        403,
        [
          roleDetail(role, roleId, 'actor_role_too_low', {
            actorHighestRoleId: actorHighest?.id ?? null,
            actorHighestRoleName: actorHighest?.name ?? null,
          }),
        ],
      );
    }
    return role;
  }
  async manageableMember(guildId, userId, actorId, permission) {
    const state = await this.context(guildId, { fresh: true });
    const [target, actor] = await Promise.all([this.member(guildId, userId), actorId ? this.member(guildId, actorId) : null]);
    ensure(userId !== state.guild.owner_id && userId !== state.bot.user.id && userId !== actorId, 'MEMBER_HIERARCHY', 409);
    ensure(hasPermission(state.permissions, permission) && compareRoles(highestRole(state.bot, state.roles, guildId), highestRole(target, state.roles, guildId)) > 0, 'MEMBER_HIERARCHY', 409);
    if (permission === P.ModerateMembers) ensure(!hasPermission(memberPermissions(target, state.roles, guildId), P.Administrator), 'MEMBER_HIERARCHY', 409);
    if (actor) ensure(hasPermission(memberPermissions(actor, state.roles, guildId), permission) && (actorId === state.guild.owner_id || compareRoles(highestRole(actor, state.roles, guildId), highestRole(target, state.roles, guildId)) > 0), 'ACTOR_ROLE_HIERARCHY', 403);
    return target;
  }
  async send(guildId, channelId, message, { nonce, actorId, messageId } = {}) {
    validMessage(message, { managedComponents: true });
    const { context } = await this.destination(guildId, channelId, { embed: !!message.embeds.length, actorId });
    if (message.allowed_mentions?.parse?.includes('everyone') || message.allowed_mentions?.roles?.length) {
      const channel = await this.request('GET', `/channels/${channelId}`);
      const parent = [10, 11, 12].includes(channel.type) ? await this.request('GET', `/channels/${channel.parent_id}`) : channel;
      ensure(hasPermission(channelPermissions(context.bot, context.roles, parent, guildId), P.MentionEveryone), 'MENTION_PERMISSION', 409);
      if (actorId) ensure(hasPermission(channelPermissions(await this.member(guildId, actorId), context.roles, parent, guildId), P.MentionEveryone), 'MENTION_PERMISSION', 403);
    }
    if (messageId) {
      const original = await this.request('GET', `/channels/${channelId}/messages/${messageId}`);
      ensure(original.author?.id === this.clientId, 'MESSAGE_NOT_OWNED', 409);
      const result = await this.request('PATCH', `/channels/${channelId}/messages/${messageId}`, message);
      return { channelId, messageId: result.id };
    }
    const result = await this.request('POST', `/channels/${channelId}/messages`, { ...message,
      ...(nonce ? { nonce: createHash('sha256').update(nonce).digest('hex').slice(0, 24), enforce_nonce: true } : {}) });
    return { channelId, messageId: result.id };
  }
  async deleteMessage(guildId, reference, actorId) {
    await this.destination(guildId, reference.channelId, { actorId });
    let original;
    try { original = await this.request('GET', `/channels/${reference.channelId}/messages/${reference.messageId}`); }
    catch (error) { if (error.code === 'DISCORD_OBJECT_DELETED') return; throw error; }
    ensure(original.author?.id === this.clientId, 'MESSAGE_NOT_OWNED', 409);
    await this.request('DELETE', `/channels/${reference.channelId}/messages/${reference.messageId}`);
  }
  async validate(kind, snapshot, guildId, actorId) {
    const context = await this.authorize(guildId, actorId, FEATURES[kind].capability, { fresh: true });
    if (FEATURES[kind].publish === 'message' || kind === 'feeds') {
      ensure(snapshot.channelId, 'DESTINATION_REQUIRED');
      await this.authorize(guildId, actorId, 'publish_messages');
      await this.destination(guildId, snapshot.channelId, { embed: kind === 'rules' || !!snapshot.message.embeds.length, actorId, fresh: false });
    }
    const walk = async (value, key = '', path = 'config') => {
      if (typeof value === 'string' && value && /(?:roleId|RoleId)$/u.test(key)) {
        await this.manageableRole(guildId, value, {
          actorId,
          selfService: ['rules', 'role-panels'].includes(kind),
          context,
        });
      } else if (
        typeof value === 'string' &&
        value &&
        /(?:channelId|ChannelId)$/u.test(key)
      ) {
        await this.destination(guildId, value, { actorId, fresh: false });
      } else if (key === 'categoryId' && value) {
        ensure(
          context.channels.some(channel => channel.id === value && channel.type === 4),
          'INVALID_CATEGORY',
          400,
          [{ code: 'category', path, categoryId: value }],
        );
      } else if (/RoleIds$/u.test(key) && Array.isArray(value)) {
        const invalidRoleId = value.find(
          candidate => !context.roles.some(role => role.id === candidate),
        );
        ensure(
          !invalidRoleId,
          'INVALID_ROLE',
          400,
          [{ code: 'role', path, roleId: invalidRoleId, reason: 'not_found' }],
        );
      } else if (/ChannelIds$/u.test(key) && Array.isArray(value)) {
        const invalidChannelId = value.find(
          candidate => !context.channels.some(channel => channel.id === candidate),
        );
        ensure(
          !invalidChannelId,
          'INVALID_CHANNEL',
          400,
          [
            {
              code: 'channel',
              path,
              channelId: invalidChannelId,
              reason: 'not_found',
            },
          ],
        );
      } else if (value && typeof value === 'object') {
        for (const [childKey, child] of Object.entries(value)) {
          await walk(child, childKey, `${path}.${childKey}`);
        }
      }
    };
    await walk(snapshot.config);
    if (kind === 'ticket-panels') {
      ensure(
        hasPermission(context.permissions, P.ManageChannels),
        'BOT_MISSING_PERMISSION',
        409,
        [{ code: 'bot_permissions', permissions: ['Manage Channels'] }],
      );
    }
    for (const action of [
      ...(snapshot.config.actions ?? []),
      ...(snapshot.config.escalation ?? []).flatMap(entry => entry.actions),
    ]) {
      const permission = {
        timeout: P.ModerateMembers,
        kick: P.KickMembers,
        ban: P.BanMembers,
        delete_message: P.ManageMessages,
        slowmode: P.ManageChannels,
      }[action.type];
      if (permission) {
        const permissionName = permissionLabels.get(permission) ?? String(permission);
        const botHas = hasPermission(context.permissions, permission);
        const actorHas = hasPermission(context.actor.permissions, permission);
        ensure(
          botHas && actorHas,
          'ACTION_PERMISSION',
          403,
          [
            {
              code: 'action_permission',
              action: action.type,
              permission: permissionName,
              missingFor: [
                ...(!botHas ? ['Sparkles'] : []),
                ...(!actorHas ? ['you'] : []),
              ],
            },
          ],
        );
      }
      if (['send_message', 'dm'].includes(action.type)) {
        ensure(
          context.actor.capabilities.includes('publish_messages'),
          'DASHBOARD_FORBIDDEN',
          403,
          [
            {
              code: 'missing_capability',
              capability: 'publish_messages',
              currentCapabilities: context.actor.capabilities,
            },
          ],
        );
      }
    }
    return context;
  }
}

export function compileMessage(resource, translate, context = {}, page = 0) {
  const value = resource.draft ?? resource.snapshot;
  const config = value.config;
  let message = renderMessage(value.message, context);
  const custom = (action, suffix = '') => `sp:${resource.kind}:${resource._id ?? resource.id}:${resource.revision}:${action}${suffix ? `:${suffix}` : ''}`;
  const buttons = entries => ({ type: 1, components: entries });
  const button = (label, action, suffix, style = 1) => ({ type: 2, style, label, custom_id: custom(action, suffix) });
  const append = rows => { message.components = [...(message.components ?? []), ...rows]; };
  if (resource.kind === 'rules') {
    const rules = config.rules.map((rule, index) => ({ name: `${rule.emoji ? `${rule.emoji} ` : ''}${index + 1}. ${rule.title}`, value: [rule.description,
      rule.examples ? translate('rules.examplesValue', { value: rule.examples }) : '',
      rule.severity ? translate('rules.severityValue', { value: translate(`choice.${rule.severity}`) }) : '',
      rule.punishment ? translate('rules.punishmentValue', { value: rule.punishment }) : ''].filter(Boolean).join('\n') }));
    const base = message.embeds[0] ?? {};
    if (config.layout === 'raw') message.content = [message.content, ...rules.map(rule => `**${rule.name}**\n${rule.value}`)].filter(Boolean).join('\n\n');
    else if (config.layout === 'single_embed') message.embeds = [{ ...base, title: base.title || value.name, fields: rules }];
    else if (config.layout === 'multiple_embeds') message.embeds = rules.map(rule => ({ ...base, title: rule.name, description: rule.value, fields: [] }));
    else {
      ensure(page >= 0 && page < rules.length, 'INVALID_INPUT');
      message.embeds = [{ ...base, title: rules[page].name, description: rules[page].value, fields: [] }];
      if (config.layout === 'select') append([{ type: 1, components: [{ type: 3, custom_id: custom('page'), options: rules.map((rule, index) => ({ label: rule.name.slice(0, DISCORD_LIMITS.optionLabel), value: String(index) })) }] }]);
      else append([buttons([button(translate('rules.previous'), 'page', String((page + rules.length - 1) % rules.length), 2), button(translate('rules.next'), 'page', String((page + 1) % rules.length), 2)])]);
    }
    if (config.acceptanceEnabled) append([buttons([button(config.acceptanceLabel, 'accept', '', 3)])]);
  }
  if (resource.kind === 'role-panels') {
    if (config.layout === 'select') append([{ type: 1, components: [{ type: 3, custom_id: custom('roles'), min_values: 1, max_values: config.mode === 'multiple' ? config.choices.length : 1,
      options: config.choices.map((choice, index) => ({ label: choice.label, value: String(index), ...(choice.description ? { description: choice.description.slice(0, DISCORD_LIMITS.optionLabel) } : {}) })) }] }]);
    else for (let index = 0; index < config.choices.length; index += DISCORD_LIMITS.buttons) append([buttons(config.choices.slice(index, index + DISCORD_LIMITS.buttons).map((choice, offset) => button(choice.label, 'roles', String(index + offset), 2)))]);
  }
  if (['ticket-panels', 'forms', 'giveaways'].includes(resource.kind)) append([buttons([button(config.buttonLabel, 'open')])]);
  if (resource.kind === 'polls') append([{ type: 1, components: [{ type: 3, custom_id: custom('vote'), min_values: 1, max_values: config.multiple ? config.choices.length : 1,
    options: config.choices.map((label, index) => ({ label, value: String(index) })) }] }]);
  if (resource.kind === 'polls') message.content = [message.content, `**${config.question}**`].filter(Boolean).join('\n');
  if (resource.kind === 'giveaways') message.content = [message.content, `**${config.prize}**`, translate('giveaway.ends', { time: `<t:${Math.floor(Date.parse(config.endAt) / 1000)}:R>`, count: config.winnerCount })].filter(Boolean).join('\n');
  validMessage(message, { managedComponents: true });
  return message;
}
