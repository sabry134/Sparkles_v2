import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('store merges external dashboard changes with pending bot changes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sparkles-store-'));
  const storePath = path.join(directory, 'store.json');
  const previousPath = process.env.STORE_PATH;
  process.env.STORE_PATH = storePath;

  try {
    const store = await import(`../src/store.js?test=${Date.now()}`);
    await store.loadStore();
    const guildId = '123456789012345678';

    store.guildConfig(guildId).logsChannelId = '223456789012345678';
    await writeFile(
      storePath,
      JSON.stringify({
        guilds: {
          [guildId]: {
            tags: {},
            suggestionsChannelId: '323456789012345678',
          },
        },
        warnings: {},
      }),
      'utf8',
    );

    await store.saveStore();
    const persisted = JSON.parse(await readFile(storePath, 'utf8'));
    assert.equal(persisted.guilds[guildId].logsChannelId, '223456789012345678');
    assert.equal(persisted.guilds[guildId].suggestionsChannelId, '323456789012345678');
  } finally {
    if (previousPath === undefined) delete process.env.STORE_PATH;
    else process.env.STORE_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});


test('store notices atomic dashboard replacements immediately', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sparkles-store-sync-'));
  const storePath = path.join(directory, 'store.json');
  const replacementPath = path.join(directory, 'replacement.json');
  const previousPath = process.env.STORE_PATH;
  const guildId = '123456789012345678';
  process.env.STORE_PATH = storePath;

  try {
    await writeFile(
      storePath,
      JSON.stringify({
        guilds: { [guildId]: { tags: {}, rules: 'one' } },
        warnings: {},
      }),
      'utf8',
    );

    const store = await import(`../src/store.js?sync=${Date.now()}-${Math.random()}`);
    await store.loadStore();
    assert.equal(store.guildConfig(guildId).rules, 'one');

    await writeFile(
      replacementPath,
      JSON.stringify({
        guilds: { [guildId]: { tags: {}, rules: 'two' } },
        warnings: {},
      }),
      'utf8',
    );
    await rename(replacementPath, storePath);

    assert.equal(await store.syncStore(), true);
    assert.equal(store.guildConfig(guildId).rules, 'two');
  } finally {
    if (previousPath === undefined) delete process.env.STORE_PATH;
    else process.env.STORE_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});
