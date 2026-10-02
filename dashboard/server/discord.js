import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from './errors.js';
import { snowflake } from './validation.js';

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_OAUTH = 'https://discord.com/api/oauth2';
const KICK_MEMBERS = 1n << 1n;
const ADMINISTRATOR = 1n << 3n;
const MANAGE_CHANNELS = 1n << 4n;
const MANAGE_GUILD = 1n << 5n;
const MANAGE_MESSAGES = 1n << 13n;
const MANAGE_ROLES = 1n << 28n;
const MODERATE_MEMBERS = 1n << 40n;
const TEXT_CHANNEL_TYPES = new Set([0, 5]);
const CATEGORY_CHANNEL_TYPE = 4;
const requestPolicy = Object.freeze(
  JSON.parse(readFileSync(new URL('../config/discord.json', import.meta.url), 'utf8')),
);

const botGuildCaches = new WeakMap();
const botUserIds = new WeakMap();
const pendingUserGuilds = new Map();
const pendingRefreshes = new Map();

async function sharePending(requests, key, load) {
  if (requests.has(key)) return requests.get(key);
  const pending = load();
  requests.set(key, pending);
  try {
    return await pending;
  } finally {
    if (requests.get(key) === pending) requests.delete(key);
  }
}

function saveSession(request) {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function encodedForm(value) {
  return new URLSearchParams(value).toString();
}

async function responseBody(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  return text ? { message: text } : null;
}

async function requestDiscord(url, options = {}) {
  const canRetry = (options.method ?? 'GET') === 'GET';
  const deadline = Date.now() + requestPolicy.retryMaxWaitMs;

  for (let attempt = 0; ; attempt += 1) {
    let response;
    let body;
    let failure;
    try {
      response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(requestPolicy.requestTimeoutMs),
      });
      body = await responseBody(response);
    } catch (cause) {
      failure = new AppError('DISCORD_UNAVAILABLE', 503, { cause });
    }

    if (!failure && response.ok) return body;

    const transient = failure || response.status === 429 || response.status >= 500;
    if (canRetry && transient && attempt < requestPolicy.retryLimit) {
      // Discord provides the wait in seconds. Never retry before that deadline.
      const retryAfter = body?.retry_after ?? response?.headers.get('retry-after');
      const seconds = retryAfter == null ? NaN : Number(retryAfter);
      const waitMs = Number.isFinite(seconds) && seconds >= 0
        ? Math.ceil(seconds * 1_000)
        : requestPolicy.retryBaseDelayMs * 2 ** attempt;
      if (waitMs <= deadline - Date.now()) {
        await delay(waitMs);
        continue;
      }
    }

    if (failure) throw failure;
    const userToken = options.headers?.authorization?.startsWith('Bearer ');
    const code = response.status === 429
      ? 'DISCORD_RATE_LIMITED'
      : response.status >= 500
        ? 'DISCORD_UNAVAILABLE'
        : response.status === 401 && userToken
          ? 'DISCORD_SESSION_EXPIRED'
          : response.status === 403
            ? 'DISCORD_FORBIDDEN'
            : 'DISCORD_API_ERROR';
    const error = new AppError(code, code === 'DISCORD_SESSION_EXPIRED' ? 401 : transient ? 503 : 502);
    error.discordStatus = response.status;
    error.discordCode = body?.code;
    throw error;
  }
}

async function tokenRequest(parameters, config) {
  return requestDiscord(`${DISCORD_OAUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: encodedForm({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...parameters,
    }),
  });
}

function storedToken(token) {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    expiresAt: Date.now() + Number(token.expires_in) * 1_000,
    scope: token.scope,
  };
}

async function accessToken(request, config) {
  const oauth = request.session.oauth;
  if (!oauth?.accessToken || !oauth.refreshToken) {
    throw new AppError('AUTH_REQUIRED', 401);
  }

  if (oauth.expiresAt > Date.now() + 60_000) return oauth.accessToken;

  const refreshed = await sharePending(pendingRefreshes, oauth.refreshToken, () =>
    tokenRequest(
      {
        grant_type: 'refresh_token',
        refresh_token: oauth.refreshToken,
      },
      config,
    ),
  );

  request.session.oauth = storedToken(refreshed);
  await saveSession(request);
  return request.session.oauth.accessToken;
}

async function userRequest(request, config, endpoint) {
  const token = await accessToken(request, config);
  return requestDiscord(`${DISCORD_API}${endpoint}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function botRequest(config, endpoint, options = {}) {
  return requestDiscord(`${DISCORD_API}${endpoint}`, {
    ...options,
    headers: {
      authorization: `Bot ${config.botToken}`,
      ...options.headers,
    },
  });
}

function botUserId(config) {
  if (!botUserIds.has(config)) {
    const identity = botRequest(config, '/users/@me')
      .then((user) => {
        try {
          return snowflake(user?.id, 'botUserId');
        } catch {
          throw new AppError('DISCORD_API_ERROR', 502);
        }
      })
      .catch((error) => {
        botUserIds.delete(config);
        throw error;
      });
    botUserIds.set(config, identity);
  }

  return botUserIds.get(config);
}

async function paginatedGuilds(fetchPage) {
  const guilds = [];
  let after;

  for (let page = 0; page < 10; page += 1) {
    const parameters = new URLSearchParams({ limit: '200' });
    if (after) parameters.set('after', after);
    const batch = await fetchPage(parameters);
    guilds.push(...batch);
    if (batch.length < 200) break;
    after = batch.at(-1).id;
  }

  return guilds;
}

async function userGuilds(request, config) {
  // Only share in-flight reads. Later authorization checks always fetch fresh permissions.
  return sharePending(pendingUserGuilds, request.session.oauth, () =>
    paginatedGuilds((parameters) =>
      userRequest(request, config, `/users/@me/guilds?${parameters}`),
    ),
  );
}

async function botGuildIds(config) {
  let cache = botGuildCaches.get(config);
  if (!cache) {
    cache = { expiresAt: 0, ids: new Set(), pending: null };
    botGuildCaches.set(config, cache);
  }
  if (cache.expiresAt > Date.now()) return cache.ids;
  if (cache.pending) return cache.pending;
  cache.pending = paginatedGuilds((parameters) =>
    botRequest(config, `/users/@me/guilds?${parameters}`),
  ).then((guilds) => {
    cache.ids = new Set(guilds.map((guild) => guild.id));
    cache.expiresAt = Date.now() + requestPolicy.botGuildCacheMs;
    return cache.ids;
  }).finally(() => {
    cache.pending = null;
  });
  return cache.pending;
}

function canManageGuild(guild) {
  if (guild.owner === true) return true;

  try {
    const permissions = BigInt(guild.permissions ?? '0');
    return (permissions & (MANAGE_GUILD | ADMINISTRATOR)) !== 0n;
  } catch {
    return false;
  }
}

function iconUrl(guild) {
  if (!guild.icon) return null;
  const format = guild.icon.startsWith('a_') ? 'gif' : 'webp';
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${format}?size=128`;
}

function installUrl(guildId, config) {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    permissions: config.botPermissions,
    scope: 'bot applications.commands',
    guild_id: guildId,
    disable_guild_select: 'true',
  });
  return url.toString();
}

export function oauthStart(config) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'identify guilds',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return { state, verifier, url: url.toString() };
}

export function validOauthState(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function exchangeAuthorizationCode(code, verifier, config) {
  const token = await tokenRequest(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    },
    config,
  );
  return storedToken(token);
}

export async function fetchCurrentUser(oauth) {
  const user = await requestDiscord(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${oauth.accessToken}` },
  });

  return {
    id: user.id,
    username: user.username,
    globalName: user.global_name ?? user.username,
    avatarUrl: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=128`
      : null,
  };
}

export async function revokeOauthToken(oauth, config) {
  if (!oauth?.accessToken) return;

  await requestDiscord(`${DISCORD_OAUTH}/token/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: encodedForm({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      token: oauth.accessToken,
      token_type_hint: 'access_token',
    }),
  }).catch(() => {});
}

export async function dashboardGuilds(request, config) {
  const [guilds, installedIds] = await Promise.all([
    userGuilds(request, config),
    botGuildIds(config),
  ]);

  return guilds.filter(canManageGuild).map((guild) => ({
    id: guild.id,
    name: guild.name,
    iconUrl: iconUrl(guild),
    botInstalled: installedIds.has(guild.id),
    installUrl: installUrl(guild.id, config),
  }));
}

export async function authorizeGuild(request, guildId, config) {
  const guilds = await userGuilds(request, config);
  const guild = guilds.find((candidate) => candidate.id === guildId);
  if (!guild || !canManageGuild(guild)) {
    throw new AppError('GUILD_NOT_AVAILABLE', 404);
  }

  try {
    await botRequest(config, `/guilds/${guildId}`);
  } catch (error) {
    if (error.discordStatus === 403 || error.discordStatus === 404) {
      throw new AppError('BOT_NOT_INSTALLED', 409);
    }
    throw error;
  }

  return guild;
}

function rolePermissions(member, roles) {
  const memberRoleIds = new Set(member.roles);
  return roles
    .filter((role) => role.id === member.guildId || memberRoleIds.has(role.id))
    .reduce((permissions, role) => permissions | BigInt(role.permissions), 0n);
}

function hasGuildPermission(permissions, permission) {
  return (
    (permissions & ADMINISTRATOR) !== 0n ||
    (permissions & permission) !== 0n
  );
}

export async function guildResources(guildId, config) {
  const [channels, roles, member] = await Promise.all([
    botRequest(config, `/guilds/${guildId}/channels`),
    botRequest(config, `/guilds/${guildId}/roles`),
    botUserId(config).then((userId) =>
      botRequest(config, `/guilds/${guildId}/members/${userId}`),
    ),
  ]);

  member.guildId = guildId;
  const memberRoleIds = new Set(member.roles);
  const highestBotPosition = roles
    .filter((role) => memberRoleIds.has(role.id))
    .reduce((highest, role) => Math.max(highest, role.position), 0);
  const permissions = rolePermissions(member, roles);
  const capabilities = {
    canKickMembers: hasGuildPermission(permissions, KICK_MEMBERS),
    canManageChannels: hasGuildPermission(permissions, MANAGE_CHANNELS),
    canManageMessages: hasGuildPermission(permissions, MANAGE_MESSAGES),
    canManageRoles: hasGuildPermission(permissions, MANAGE_ROLES),
    canModerateMembers: hasGuildPermission(permissions, MODERATE_MEMBERS),
  };
  const canManageRoles = capabilities.canManageRoles;

  return {
    channels: channels
      .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type))
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parent_id ?? null,
        position: channel.position,
      }))
      .sort((left, right) => left.position - right.position),
    categories: channels
      .filter((channel) => channel.type === CATEGORY_CHANNEL_TYPE)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        position: channel.position,
      }))
      .sort((left, right) => left.position - right.position),
    roles: roles
      .filter((role) => role.id !== guildId && !role.managed)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        assignable: canManageRoles && role.position < highestBotPosition,
      }))
      .sort((left, right) => right.position - left.position),
    capabilities,
  };
}

export function validateSettingsResources(patch, resources) {
  const channelIds = new Set(resources.channels.map((channel) => channel.id));
  const categoryIds = new Set(resources.categories.map((category) => category.id));
  const assignableRoleIds = new Set(
    resources.roles.filter((role) => role.assignable).map((role) => role.id),
  );

  if (
    (patch.automod?.antiLink === true || patch.automod?.antiSwear === true) &&
    !resources.capabilities.canManageMessages
  ) {
    throw new AppError('BOT_MISSING_PERMISSION', 409);
  }

  if (
    (patch.automod?.antiAlt === true ||
      patch.automod?.antiBot === true ||
      patch.automod?.antiRaid === true) &&
    !resources.capabilities.canKickMembers
  ) {
    throw new AppError('BOT_MISSING_PERMISSION', 409);
  }

  if (
    patch.automod?.antiSwear === true &&
    !resources.capabilities.canModerateMembers
  ) {
    throw new AppError('BOT_MISSING_PERMISSION', 409);
  }

  for (const field of ['logsChannelId', 'suggestionsChannelId', 'giveawayChannelId']) {
    if (
      patch[field] !== undefined &&
      patch[field] !== null &&
      !channelIds.has(patch[field])
    ) {
      throw new AppError('INVALID_CHANNEL', 400);
    }
  }

  for (const field of ['welcome', 'goodbye']) {
    if (
      patch[field]?.channelId !== undefined &&
      patch[field].channelId !== null &&
      !channelIds.has(patch[field].channelId)
    ) {
      throw new AppError('INVALID_CHANNEL', 400);
    }
  }

  if (
    patch.ticketCategoryId !== undefined &&
    patch.ticketCategoryId !== null &&
    !categoryIds.has(patch.ticketCategoryId)
  ) {
    throw new AppError('INVALID_CHANNEL', 400);
  }

  if (
    patch.ticketCategoryId !== undefined &&
    patch.ticketCategoryId !== null &&
    !resources.capabilities.canManageChannels
  ) {
    throw new AppError('BOT_MISSING_PERMISSION', 409);
  }

  for (const field of ['autoRoleId', 'verificationRoleId']) {
    if (
      patch[field] !== undefined &&
      patch[field] !== null &&
      !assignableRoleIds.has(patch[field])
    ) {
      throw new AppError('INVALID_ROLE', 400);
    }
  }
}

function reactionRouteEmoji(emoji) {
  const custom = /^<a?:([A-Za-z0-9_]{2,32}):(\d{17,20})>$/.exec(emoji);
  return custom ? `${custom[1]}:${custom[2]}` : emoji;
}

export async function validateAndAddReaction(guildId, mapping, resources, config) {
  const channel = resources.channels.find(({ id }) => id === mapping.channelId);
  const role = resources.roles.find(({ id }) => id === mapping.roleId);
  if (!channel) throw new AppError('INVALID_CHANNEL', 400);
  if (!role?.assignable) throw new AppError('INVALID_ROLE', 400);

  try {
    await botRequest(
      config,
      `/channels/${mapping.channelId}/messages/${mapping.messageId}`,
    );
    await botRequest(
      config,
      `/channels/${mapping.channelId}/messages/${mapping.messageId}/reactions/${encodeURIComponent(reactionRouteEmoji(mapping.emoji))}/@me`,
      { method: 'PUT' },
    );
  } catch (error) {
    if (error.discordStatus === 404) throw new AppError('MESSAGE_NOT_FOUND', 400);
    if (error.discordStatus === 403) throw new AppError('BOT_MISSING_PERMISSION', 409);
    throw error;
  }
}

export async function removeBotReaction(mapping, config) {
  await botRequest(
    config,
    `/channels/${mapping.channelId}/messages/${mapping.messageId}/reactions/${encodeURIComponent(reactionRouteEmoji(mapping.emoji))}/@me`,
    { method: 'DELETE' },
  ).catch(() => {});
}
