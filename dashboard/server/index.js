import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { BotStore } from './bot-store.js';
import { config } from './config.js';
import {
  authorizeGuild,
  dashboardGuilds,
  exchangeAuthorizationCode,
  fetchCurrentUser,
  guildResources,
  oauthStart,
  removeBotReaction,
  revokeOauthToken,
  validOauthState,
  validateAndAddReaction,
  validateSettingsResources,
} from './discord.js';
import { AppError, errorResponse } from './errors.js';
import { EncryptedFileSessionStore } from './session-store.js';
import {
  guildId as validatedGuildId,
  reactionRoleInput,
  reactionRoleKeyInput,
  settingsPatch,
} from './validation.js';

const app = express();
const sessionStore = new EncryptedFileSessionStore({
  file: config.session.file,
  secret: config.session.secret,
});
const botStore = new BotStore(config.botStoreFile, config.botDefaults);

if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((request, response, next) => {
  request.id = randomUUID();
  response.setHeader('x-request-id', request.id);
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  session({
    name: 'sparkles.dashboard.sid',
    secret: config.session.secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: config.publicUrl.protocol === 'https:',
      sameSite: 'lax',
      maxAge: config.session.maxAgeMs,
      path: '/',
    },
  }),
);

app.use(express.json({ limit: '32kb', strict: true }));

function rateLimiter({ maximum, windowMs, useIp = false }) {
  const clients = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clients) {
      if (entry.resetAt <= now) clients.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return (request, _response, next) => {
    const key = useIp ? request.ip : request.sessionID || request.ip;
    const now = Date.now();
    const entry = clients.get(key);

    if (!entry || entry.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > maximum) {
      next(new AppError('RATE_LIMITED', 429));
      return;
    }

    next();
  };
}

const authRateLimit = rateLimiter({ maximum: 20, windowMs: 60_000, useIp: true });
const apiRateLimit = rateLimiter({ maximum: 180, windowMs: 60_000 });

function saveSession(request) {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(request) {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function authenticated(request, _response, next) {
  if (!request.session.user || !request.session.oauth) {
    next(new AppError('AUTH_REQUIRED', 401));
    return;
  }
  next();
}

function csrfProtected(request, _response, next) {
  const origin = request.get('origin');
  if (!origin || !config.allowedOrigins.has(origin)) {
    next(new AppError('INVALID_ORIGIN', 403));
    return;
  }

  if (!safeEqual(request.get('x-csrf-token'), request.session.csrfToken)) {
    next(new AppError('INVALID_CSRF', 403));
    return;
  }

  next();
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function discordConfig() {
  return config.discord;
}

function validatedGuild(request) {
  return validatedGuildId(request.params.guildId);
}

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get(
  '/auth/discord',
  authRateLimit,
  asyncRoute(async (request, response) => {
    const attempt = oauthStart(discordConfig());
    request.session.oauthAttempt = {
      state: attempt.state,
      verifier: attempt.verifier,
      createdAt: Date.now(),
    };
    await saveSession(request);
    response.redirect(303, attempt.url);
  }),
);

app.get(
  '/auth/discord/callback',
  authRateLimit,
  asyncRoute(async (request, response) => {
    const attempt = request.session.oauthAttempt;
    const code = typeof request.query.code === 'string' ? request.query.code : null;
    const state = typeof request.query.state === 'string' ? request.query.state : null;
    const attemptIsFresh =
      attempt &&
      Date.now() - attempt.createdAt >= 0 &&
      Date.now() - attempt.createdAt < 10 * 60_000;

    delete request.session.oauthAttempt;
    await saveSession(request);

    if (!code || !attemptIsFresh || !validOauthState(state, attempt.state)) {
      throw new AppError('OAUTH_FAILED', 401);
    }

    const oauth = await exchangeAuthorizationCode(
      code,
      attempt.verifier,
      discordConfig(),
    );
    const user = await fetchCurrentUser(oauth);

    await regenerateSession(request);
    request.session.oauth = oauth;
    request.session.user = user;
    request.session.csrfToken = randomBytes(32).toString('base64url');
    await saveSession(request);

    response.redirect(303, config.frontendUrl.toString());
  }),
);

app.use('/api', apiRateLimit);

app.get('/api/session', (request, response) => {
  if (!request.session.user || !request.session.oauth) {
    response.json({ authenticated: false });
    return;
  }

  response.json({
    authenticated: true,
    user: request.session.user,
    csrfToken: request.session.csrfToken,
  });
});

app.post(
  '/api/logout',
  authenticated,
  csrfProtected,
  asyncRoute(async (request, response) => {
    const oauth = request.session.oauth;
    await revokeOauthToken(oauth, discordConfig());
    await destroySession(request);
    response.clearCookie('sparkles.dashboard.sid', { path: '/' });
    response.status(204).end();
  }),
);

app.get(
  '/api/guilds',
  authenticated,
  asyncRoute(async (request, response) => {
    response.json({ guilds: await dashboardGuilds(request, discordConfig()) });
  }),
);

app.get(
  '/api/guilds/:guildId/settings',
  authenticated,
  asyncRoute(async (request, response) => {
    const guildId = validatedGuild(request);
    await authorizeGuild(request, guildId, discordConfig());
    const [settings, resources] = await Promise.all([
      botStore.getGuildSettings(guildId),
      guildResources(guildId, discordConfig()),
    ]);
    response.json({ settings, resources });
  }),
);

app.patch(
  '/api/guilds/:guildId/settings',
  authenticated,
  csrfProtected,
  asyncRoute(async (request, response) => {
    const guildId = validatedGuild(request);
    const patch = settingsPatch(request.body);
    await authorizeGuild(request, guildId, discordConfig());
    const resources = await guildResources(guildId, discordConfig());
    validateSettingsResources(patch, resources);
    const settings = await botStore.updateGuildSettings(guildId, patch);
    response.json({ settings });
  }),
);

app.post(
  '/api/guilds/:guildId/reaction-roles',
  authenticated,
  csrfProtected,
  asyncRoute(async (request, response) => {
    const guildId = validatedGuild(request);
    const mapping = reactionRoleInput(request.body);
    await authorizeGuild(request, guildId, discordConfig());
    const resources = await guildResources(guildId, discordConfig());
    await validateAndAddReaction(guildId, mapping, resources, discordConfig());
    const settings = await botStore.setReactionRole(guildId, mapping);
    response.status(201).json({ settings });
  }),
);

app.delete(
  '/api/guilds/:guildId/reaction-roles',
  authenticated,
  csrfProtected,
  asyncRoute(async (request, response) => {
    const guildId = validatedGuild(request);
    const key = reactionRoleKeyInput(request.body);
    await authorizeGuild(request, guildId, discordConfig());
    const current = await botStore.getGuildSettings(guildId);
    const mapping = current.reactionRoles.find((candidate) => candidate.key === key);
    if (!mapping) throw new AppError('REACTION_ROLE_NOT_FOUND', 404);

    const settings = await botStore.removeReactionRole(guildId, key);
    await removeBotReaction(mapping, discordConfig());
    response.json({ settings });
  }),
);

app.use('/api', (_request, _response, next) => {
  next(new AppError('NOT_FOUND', 404));
});

app.use('/auth', (_request, _response, next) => {
  next(new AppError('NOT_FOUND', 404));
});

const distributionDirectory = path.join(config.dashboardDirectory, 'dist');
if (config.isProduction && existsSync(distributionDirectory)) {
  app.use(express.static(distributionDirectory, { index: false, maxAge: '1h' }));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distributionDirectory, 'index.html'));
  });
}

app.use((error, request, response, _next) => {
  const result = errorResponse(error, request.id);
  if (!(error instanceof AppError)) {
    console.error(`[dashboard:${request.id}]`, error);
  }

  if (request.path === '/auth/discord/callback' && !response.headersSent) {
    const redirect = new URL(config.frontendUrl);
    redirect.searchParams.set('error', result.body.error.code);
    response.redirect(303, redirect.toString());
    return;
  }

  response.status(result.status).json(result.body);
});

await sessionStore.ready();

const server = app.listen(config.port, () => {
  console.log(`Sparkles dashboard listening on ${config.publicUrl.origin}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down dashboard.`);
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
