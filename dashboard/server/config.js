import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

const dashboardDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

dotenv.config({ path: path.resolve(dashboardDirectory, '..', '.env') });
dotenv.config({ path: path.join(dashboardDirectory, '.env'), override: true });

function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('your-') || value.startsWith('replace-')) {
    throw new Error(
      `${name} must be configured in the root .env or dashboard/.env`,
    );
  }
  return value;
}

function parseUrl(name) {
  const value = required(name);
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP or HTTPS URL`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} cannot contain credentials, a query, or a fragment`);
  }

  return url;
}

function resolveConfiguredPath(name) {
  const value = required(name);
  return path.isAbsolute(value) ? value : path.resolve(dashboardDirectory, value);
}

function resolveOptionalPath(name, fallback) {
  const value = process.env[name]?.trim() || fallback;
  return path.isAbsolute(value) ? value : path.resolve(dashboardDirectory, value);
}

function parsePort() {
  const value = Number.parseInt(required('DASHBOARD_PORT'), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('DASHBOARD_PORT must be an integer between 1 and 65535');
  }
  return value;
}

const sessionSecret = required('SESSION_SECRET');
if (sessionSecret.length < 64) {
  throw new Error('SESSION_SECRET must contain at least 64 characters');
}

const publicUrl = parseUrl('DASHBOARD_PUBLIC_URL');
const frontendUrl = parseUrl('DASHBOARD_FRONTEND_URL');
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && publicUrl.protocol !== 'https:') {
  throw new Error('DASHBOARD_PUBLIC_URL must use HTTPS in production');
}

if (publicUrl.pathname !== '/' || frontendUrl.pathname !== '/') {
  throw new Error('Dashboard URLs must not include a path');
}

const botPermissions = required('DISCORD_BOT_PERMISSIONS');
if (!/^\d+$/.test(botPermissions)) {
  throw new Error('DISCORD_BOT_PERMISSIONS must be a Discord permission integer');
}

const botConfigFile = resolveOptionalPath('BOT_CONFIG_PATH', '../config/bot.json');
let botDefaults;
try {
  botDefaults = JSON.parse(readFileSync(botConfigFile, 'utf8'));
} catch (error) {
  throw new Error(`BOT_CONFIG_PATH could not be read: ${error.message}`);
}

export const config = Object.freeze({
  dashboardDirectory,
  port: parsePort(),
  publicUrl,
  frontendUrl,
  isProduction,
  trustProxy: process.env.TRUST_PROXY === '1',
  discord: Object.freeze({
    clientId: required('DISCORD_CLIENT_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    botToken: required('DISCORD_BOT_TOKEN'),
    botPermissions,
    redirectUri: new URL('/auth/discord/callback', publicUrl).toString(),
  }),
  session: Object.freeze({
    secret: sessionSecret,
    file: resolveConfiguredPath('SESSION_STORE_PATH'),
    maxAgeMs: 12 * 60 * 60 * 1_000,
  }),
  mongo: Object.freeze({
    uri: required('MONGODB_URI'),
    dbName: process.env.MONGODB_DB_NAME?.trim() || 'sparkles',
  }),
  botDefaults: Object.freeze(botDefaults),
  allowedOrigins: new Set([publicUrl.origin, frontendUrl.origin]),
});
