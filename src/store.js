import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredStorePath = process.env.STORE_PATH?.trim() || 'data/store.json';
const file = path.isAbsolute(configuredStorePath)
  ? configuredStorePath
  : path.resolve(projectDirectory, configuredStorePath);
const directory = path.dirname(file);
let state = { guilds: {}, warnings: {}, moderationCases: {} };
let baselineState = structuredClone(state);
let writeQueue = Promise.resolve();
let lastFileSignature = null;
const DELETE_VALUE = Symbol('delete-value');
const lockFile = `${file}.dashboard.lock`;
const transientFileErrors = new Set(['EACCES', 'EBUSY', 'EPERM']);

function fileSignature(metadata) {
  return [
    metadata.dev,
    metadata.ino,
    metadata.size,
    metadata.mtimeMs,
    metadata.ctimeMs,
  ].join(':');
}

function normalizeStore(parsed) {
  return parsed && typeof parsed === 'object'
    ? { guilds: {}, warnings: {}, moderationCases: {}, ...parsed }
    : { guilds: {}, warnings: {}, moderationCases: {} };
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function changesBetween(previous, current) {
  if (Object.is(previous, current)) return undefined;
  if (!isRecord(previous) || !isRecord(current)) return structuredClone(current);

  const changes = {};
  let changed = false;
  for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
    if (!Object.hasOwn(current, key)) {
      changes[key] = DELETE_VALUE;
      changed = true;
      continue;
    }

    const nested = changesBetween(previous[key], current[key]);
    if (nested !== undefined) {
      changes[key] = nested;
      changed = true;
    }
  }
  return changed ? changes : undefined;
}

function applyChanges(target, changes) {
  if (!isRecord(changes)) return structuredClone(changes);
  const result = isRecord(target) ? structuredClone(target) : {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === DELETE_VALUE) delete result[key];
    else result[key] = applyChanges(result[key], value);
  }
  return result;
}

async function acquireLock() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    try {
      const handle = await open(lockFile, 'wx', 0o600);
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
        'utf8',
      );
      return async () => {
        await handle.close().catch(() => {});
        await unlink(lockFile).catch(() => {});
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const metadata = await stat(lockFile).catch(() => null);
      if (metadata && Date.now() - metadata.mtimeMs > 30_000) {
        await unlink(lockFile).catch(() => {});
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
  throw new Error('Timed out waiting for the shared store lock');
}

async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!transientFileErrors.has(error.code) || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * 2 ** attempt));
    }
  }
}

async function readStoreFile() {
  try {
    return normalizeStore(JSON.parse(await readFile(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return normalizeStore({});
    throw error;
  }
}

export async function loadStore() {
  await mkdir(directory, { recursive: true });
  try {
    state = await readStoreFile();
    baselineState = structuredClone(state);
    lastFileSignature = fileSignature(await stat(file));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function syncStore() {
  try {
    const fileStats = await stat(file);
    const currentSignature = fileSignature(fileStats);
    if (currentSignature === lastFileSignature) return false;

    const externalState = await readStoreFile();
    const pendingChanges = changesBetween(baselineState, state);
    baselineState = structuredClone(externalState);
    state = pendingChanges ? applyChanges(externalState, pendingChanges) : externalState;
    lastFileSignature = currentSignature;
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function guildConfig(guildId) {
  if (!/^\d{17,20}$/.test(guildId)) {
    throw new TypeError('Invalid Discord guild ID');
  }
  state.guilds[guildId] ??= { tags: {} };
  return state.guilds[guildId];
}

export function guildIds() {
  return Object.keys(state.guilds);
}

export function warningCount(guildId, userId) {
  return state.warnings[`${guildId}:${userId}`]?.length ?? 0;
}

export function addWarning(guildId, userId, warning) {
  const key = `${guildId}:${userId}`;
  state.warnings[key] ??= [];
  state.warnings[key].push(warning);
  return state.warnings[key].length;
}

export function clearWarnings(guildId, userId) {
  delete state.warnings[`${guildId}:${userId}`];
}

export function addModerationCase(guildId, entry) {
  state.moderationCases[guildId] ??= [];
  const cases = state.moderationCases[guildId];
  const id = (cases.at(-1)?.id ?? 0) + 1;
  const moderationCase = {
    id,
    at: new Date().toISOString(),
    ...entry,
  };
  cases.push(moderationCase);
  if (cases.length > 2_000) cases.splice(0, cases.length - 2_000);
  return moderationCase;
}

export function moderationCases(guildId, userId = null) {
  const cases = state.moderationCases[guildId] ?? [];
  const filtered = userId
    ? cases.filter((entry) => entry.targetId === userId)
    : cases;
  return structuredClone(filtered);
}

export function saveStore() {
  writeQueue = writeQueue
    .catch((error) => {
      console.error('[store-write-recovery]', error);
    })
    .then(async () => {
      const release = await acquireLock();
      const temporary = `${file}.tmp`;
      try {
        const externalState = await readStoreFile();
        const pendingChanges = changesBetween(baselineState, state);
        const mergedState = pendingChanges
          ? applyChanges(externalState, pendingChanges)
          : externalState;

        await writeFile(temporary, JSON.stringify(mergedState, null, 2), {
          encoding: 'utf8',
          mode: 0o600,
        });
        await renameWithRetry(temporary, file);
        state = mergedState;
        baselineState = structuredClone(mergedState);
        lastFileSignature = fileSignature(await stat(file));
      } finally {
        await unlink(temporary).catch(() => {});
        await release();
      }
    });
  return writeQueue;
}
