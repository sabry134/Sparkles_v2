import assert from 'node:assert/strict';
import test from 'node:test';
import {
  containsBlockedWord,
  filterAutomodMessage,
  filterLinks,
  hasBlockedLink,
} from '../src/modules/automod.js';

test('dashboard anti-link blocks all supported link forms by default', () => {
  assert.equal(hasBlockedLink('http://example.com'), true);
  assert.equal(hasBlockedLink('https://example.com'), true);
  assert.equal(hasBlockedLink('www.example.com'), true);
  assert.equal(hasBlockedLink('discord.gg/example'), true);
  assert.equal(hasBlockedLink('plain text'), false);
});

test('protocol-specific link filters only match the configured protocol', () => {
  assert.equal(hasBlockedLink('http://example.com', ['http']), true);
  assert.equal(hasBlockedLink('https://example.com', ['http']), false);
  assert.equal(hasBlockedLink('http://example.com', ['https']), false);
  assert.equal(hasBlockedLink('https://example.com', ['https']), true);
});

test('custom blocked words match whole words case-insensitively', () => {
  assert.equal(containsBlockedWord('This contains SPAM!', ['spam']), true);
  assert.equal(containsBlockedWord('scam-message', ['scam']), true);
  assert.equal(containsBlockedWord('spamming is different', ['spam']), false);
  assert.equal(containsBlockedWord('éléphant interdit ici', ['éléphant']), true);
  assert.equal(containsBlockedWord('nothing blocked', ['spam', 'scam']), false);
});

test('moderator permissions do not silently bypass dashboard automod', () => {
  assert.doesNotMatch(
    filterLinks.toString(),
    /message\.member\?\.permissions\.has\(PermissionFlagsBits\.ManageMessages\)/u,
  );
  assert.doesNotMatch(
    filterAutomodMessage.toString(),
    /message\.member\?\.permissions\.has\(PermissionFlagsBits\.ManageMessages\)/u,
  );
});
