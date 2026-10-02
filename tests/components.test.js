import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MessageFlags } from 'discord.js';
import { componentMessage, errorMessage, successMessage } from '../src/ui/components.js';

test('Components V2 messages never mix content or embeds', () => {
  for (const message of [
    componentMessage({ title: 'Title', description: 'Body' }),
    successMessage('Success', 'Saved'),
    errorMessage('Error', 'Failed'),
  ]) {
    assert.ok(message.flags & MessageFlags.IsComponentsV2);
    assert.equal('content' in message, false);
    assert.equal('embeds' in message, false);
    assert.ok(message.components.length > 0);
  }
});

test('error messages are ephemeral', () => {
  const message = errorMessage('Error', 'Failed');
  assert.ok(message.flags & MessageFlags.Ephemeral);
});

test('media responses remain valid Components V2 messages', () => {
  const message = componentMessage({
    title: 'Avatar',
    description: 'Profile image',
    mediaUrls: ['https://cdn.discordapp.com/embed/avatars/0.png'],
  });
  assert.ok(message.flags & MessageFlags.IsComponentsV2);
  assert.equal('embeds' in message, false);
  assert.equal(message.components.length, 1);
});

test('bot response code does not use legacy Discord embeds', async () => {
  const files = [
    '../server.js',
    '../src/modules/automod.js',
    '../src/modules/economy.js',
    '../src/modules/extended.js',
    '../src/modules/fun.js',
    '../src/modules/giveaways.js',
    '../src/modules/help.js',
    '../src/modules/music.js',
    '../src/modules/roles.js',
    '../src/modules/server-builder.js',
    '../src/modules/suggestions.js',
  ];
  const source = (
    await Promise.all(
      files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
    )
  ).join('\n');
  assert.doesNotMatch(source, /EmbedBuilder|\bembeds\s*:/u);
});
