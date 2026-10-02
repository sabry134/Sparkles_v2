import assert from 'node:assert/strict';
import test from 'node:test';
import {
  containsBlockedWord,
  detectSpam,
  filterAutomodMessage,
  filterLinks,
  hasBlockedLink,
  isAutomodExempt,
} from '../src/modules/automod.js';

function message(overrides = {}) {
  return {
    guildId: overrides.guildId ?? '123456789012345678',
    channelId: overrides.channelId ?? '223456789012345678',
    content: overrides.content ?? 'hello',
    author: {
      id: overrides.userId ?? '323456789012345678',
      bot: false,
    },
    member: {
      roles: {
        cache: new Map((overrides.roleIds ?? []).map((id) => [id, { id }])),
      },
    },
    mentions: {
      users: new Map(
        Array.from({ length: overrides.userMentions ?? 0 }, (_, index) => [
          String(index),
          {},
        ]),
      ),
      roles: new Map(
        Array.from({ length: overrides.roleMentions ?? 0 }, (_, index) => [
          String(index),
          {},
        ]),
      ),
      everyone: overrides.everyoneMention === true,
    },
    attachments: new Map(
      Array.from({ length: overrides.attachments ?? 0 }, (_, index) => [
        String(index),
        {},
      ]),
    ),
  };
}

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

test('custom blocked terms support words phrases unicode and wildcards', () => {
  assert.equal(containsBlockedWord('test', ['test']), true);
  assert.equal(containsBlockedWord('This contains SPAM!', ['spam']), true);
  assert.equal(containsBlockedWord('scam-message', ['scam']), true);
  assert.equal(containsBlockedWord('spamming is different', ['spam']), false);
  assert.equal(containsBlockedWord('Get FREE NITRO now', ['free nitro']), true);
  assert.equal(containsBlockedWord('scamming attempt', ['scam*']), true);
  assert.equal(containsBlockedWord('éléphant interdit ici', ['éléphant']), true);
  assert.equal(containsBlockedWord('nothing blocked', ['spam', 'scam']), false);
});

test('automod exemptions use only configured roles and channels', () => {
  assert.equal(
    isAutomodExempt(message({ userId: '523456789012345678' }), {
      whitelist: ['523456789012345678'],
      automod: { exemptUserIds: ['523456789012345678'] },
    }),
    false,
  );
  assert.equal(
    isAutomodExempt(message({ roleIds: ['623456789012345678'] }), {
      automod: { exemptRoleIds: ['623456789012345678'] },
    }),
    true,
  );
  assert.equal(
    isAutomodExempt(message({ channelId: '723456789012345678' }), {
      automod: { exemptChannelIds: ['723456789012345678'] },
    }),
    true,
  );
  assert.equal(isAutomodExempt(message(), { automod: {} }), false);
});

test('rapid and duplicate message spam trigger configured thresholds', () => {
  const automod = {
    antiSpam: true,
    spamMessageThreshold: 3,
    spamWindowSeconds: 10,
    duplicateThreshold: 2,
    duplicateWindowSeconds: 20,
  };
  const first = message({
    guildId: '823456789012345678',
    channelId: '823456789012345679',
    userId: '823456789012345680',
    content: 'repeat',
  });
  assert.equal(detectSpam(first, automod), null);
  assert.equal(detectSpam(first, automod), 'duplicate-spam');
});

test('mention caps emoji attachment and link spam rules trigger', () => {
  assert.equal(
    detectSpam(
      message({
        guildId: '923456789012345678',
        userId: '923456789012345679',
        userMentions: 5,
      }),
      { antiMentionSpam: true, mentionThreshold: 5 },
    ),
    'mention-spam',
  );

  assert.equal(
    detectSpam(
      message({
        guildId: '923456789012345680',
        userId: '923456789012345681',
        content: 'THIS MESSAGE IS VERY LOUD',
      }),
      {
        antiCaps: true,
        capsPercentage: 80,
        capsMinimumCharacters: 10,
      },
    ),
    'caps-spam',
  );

  assert.equal(
    detectSpam(
      message({
        guildId: '923456789012345682',
        userId: '923456789012345683',
        content: '😀😀😀😀😀',
      }),
      { antiEmojiSpam: true, emojiThreshold: 5 },
    ),
    'emoji-spam',
  );

  assert.equal(
    detectSpam(
      message({
        guildId: '923456789012345684',
        userId: '923456789012345685',
        attachments: 3,
      }),
      {
        antiAttachmentSpam: true,
        attachmentThreshold: 3,
        attachmentWindowSeconds: 10,
      },
    ),
    'attachment-spam',
  );

  assert.equal(
    detectSpam(
      message({
        guildId: '923456789012345686',
        userId: '923456789012345687',
        content: 'https://a.example https://b.example',
      }),
      {
        antiLinkSpam: true,
        linkThreshold: 2,
        linkWindowSeconds: 10,
      },
    ),
    'link-spam',
  );
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


test('legacy user allowlists and blocklists cannot override role based automod', () => {
  const source = filterAutomodMessage.toString();
  const exemptionSource = isAutomodExempt.toString();
  assert.doesNotMatch(source, /config\.blacklist/u);
  assert.doesNotMatch(exemptionSource, /config\.whitelist/u);
  assert.doesNotMatch(exemptionSource, /exemptUserIds/u);
});
