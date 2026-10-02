import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardEmbedInput,
  reactionRoleEmbedInput,
  reactionRoleInput,
} from '../dashboard/server/validation.js';

test('reaction roles accept a Discord message link and derive channel and message IDs', () => {
  const mapping = reactionRoleInput(
    {
      messageLink:
        'https://discord.com/channels/123456789012345678/223456789012345678/323456789012345678',
      roleId: '423456789012345678',
      emoji: '🎨',
    },
    '123456789012345678',
  );

  assert.equal(mapping.channelId, '223456789012345678');
  assert.equal(mapping.messageId, '323456789012345678');
  assert.equal(mapping.roleId, '423456789012345678');
  assert.equal(mapping.key, '323456789012345678:🎨');
});

test('reaction roles reject external and cross-server message links', () => {
  assert.throws(
    () =>
      reactionRoleInput(
        {
          messageLink:
            'https://example.com/channels/123456789012345678/223456789012345678/323456789012345678',
          roleId: '423456789012345678',
          emoji: '🎨',
        },
        '123456789012345678',
      ),
    /INVALID_MESSAGE_LINK/u,
  );

  assert.throws(
    () =>
      reactionRoleInput(
        {
          messageLink:
            'https://discord.com/channels/999999999999999999/223456789012345678/323456789012345678',
          roleId: '423456789012345678',
          emoji: '🎨',
        },
        '123456789012345678',
      ),
    /INVALID_MESSAGE_LINK/u,
  );
});

test('reaction role embeds support rich Discord embed fields', () => {
  const value = reactionRoleEmbedInput({
    channelId: '223456789012345678',
    roleId: '423456789012345678',
    emoji: '✅',
    content: 'Choose your role',
    embed: {
      title: 'Roles',
      description: 'React below',
      color: '#8b7cf6',
      url: 'https://example.com/',
      authorName: 'Sparkles',
      authorIconUrl: 'https://example.com/author.png',
      thumbnailUrl: 'https://example.com/thumb.png',
      imageUrl: 'https://example.com/image.png',
      footerText: 'Pick one',
      footerIconUrl: 'https://example.com/footer.png',
      fields: [
        {
          name: 'Blue',
          value: 'Choose the blue role',
          inline: true,
        },
      ],
    },
  });

  assert.equal(value.channelId, '223456789012345678');
  assert.equal(value.roleId, '423456789012345678');
  assert.equal(value.emojiKey, '✅');
  assert.equal(value.embed.title, 'Roles');
  assert.equal(value.embed.color, 0x8b7cf6);
  assert.equal(value.embed.fields[0].inline, true);
});

test('standalone embed maker rejects empty embeds and accepts valid embeds', () => {
  assert.throws(
    () =>
      dashboardEmbedInput({
        channelId: '223456789012345678',
        content: '',
        embed: {
          title: '',
          description: '',
          color: '#8b7cf6',
          url: '',
          authorName: '',
          authorIconUrl: '',
          thumbnailUrl: '',
          imageUrl: '',
          footerText: '',
          footerIconUrl: '',
          fields: [],
        },
      }),
    /INVALID_INPUT/u,
  );

  const value = dashboardEmbedInput({
    channelId: '223456789012345678',
    content: 'Announcement',
    embed: {
      title: 'Hello',
      description: 'World',
      color: '#57f287',
      url: '',
      authorName: '',
      authorIconUrl: '',
      thumbnailUrl: '',
      imageUrl: '',
      footerText: '',
      footerIconUrl: '',
      fields: [],
    },
  });

  assert.equal(value.embed.title, 'Hello');
  assert.equal(value.embed.color, 0x57f287);
});
