import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSettingsResources } from '../dashboard/server/discord.js';

function resources(overrides = {}) {
  return {
    channels: [{ id: '223456789012345678' }],
    categories: [{ id: '323456789012345678' }],
    roles: [{ id: '423456789012345678', assignable: true }],
    capabilities: {
      canKickMembers: true,
      canManageChannels: true,
      canManageMessages: true,
      canManageRoles: true,
      canModerateMembers: true,
      ...overrides,
    },
  };
}

test('dashboard accepts settings when bot capabilities are sufficient', () => {
  assert.doesNotThrow(() =>
    validateSettingsResources(
      {
        logsChannelId: '223456789012345678',
        ticketCategoryId: '323456789012345678',
        autoRoleId: '423456789012345678',
        commandPermissions: {
          weather: {
            roleMode: 'deny-all-except',
            roleIds: ['423456789012345678'],
            channelMode: 'allow-all-except',
            channelIds: ['223456789012345678'],
          },
        },
        automod: {
          antiLink: true,
          antiAlt: true,
          antiBot: true,
          antiRaid: true,
          antiSwear: true,
          antiSpam: true,
          antiMentionSpam: true,
          blockedRoleIds: ['423456789012345678'],
          exemptRoleIds: ['423456789012345678'],
          exemptChannelIds: ['223456789012345678'],
        },
      },
      resources(),
    ),
  );
});

test('dashboard rejects message filters without Manage Messages', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        { automod: { antiLink: true } },
        resources({ canManageMessages: false }),
      ),
    /BOT_MISSING_PERMISSION/u,
  );
});

test('dashboard rejects join protections without Kick Members', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        { automod: { antiAlt: true } },
        resources({ canKickMembers: false }),
      ),
    /BOT_MISSING_PERMISSION/u,
  );
});

test('dashboard rejects blocked-word timeout flow without Moderate Members', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        { automod: { antiSwear: true } },
        resources({ canModerateMembers: false }),
      ),
    /BOT_MISSING_PERMISSION/u,
  );
});

test('dashboard rejects ticket categories without Manage Channels', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        { ticketCategoryId: '323456789012345678' },
        resources({ canManageChannels: false }),
      ),
    /BOT_MISSING_PERMISSION/u,
  );
});


test('dashboard rejects spam filters without Manage Messages', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        { automod: { antiSpam: true } },
        resources({ canManageMessages: false }),
      ),
    /BOT_MISSING_PERMISSION/u,
  );
});

test('dashboard validates automod role and channel exemptions', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        { automod: { exemptRoleIds: ['523456789012345678'] } },
        resources(),
      ),
    /INVALID_ROLE/u,
  );
  assert.throws(
    () =>
      validateSettingsResources(
        { automod: { exemptChannelIds: ['523456789012345678'] } },
        resources(),
      ),
    /INVALID_CHANNEL/u,
  );
});


test('dashboard validates blocked role policies', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        { automod: { blockedRoleIds: ['523456789012345678'] } },
        resources(),
      ),
    /INVALID_ROLE/u,
  );
});

test('dashboard validates action log and starboard channels', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        {
          actionLog: {
            enabled: true,
            channelId: '523456789012345678',
            messageDelete: true,
            messageEdit: true,
            memberJoin: true,
            memberLeave: true,
            roleChanges: true,
          },
        },
        resources(),
      ),
    /INVALID_CHANNEL/u,
  );

  assert.throws(
    () =>
      validateSettingsResources(
        {
          starboard: {
            enabled: true,
            channelId: '223456789012345678',
            threshold: 3,
            emoji: '⭐',
            ignoreChannelIds: ['523456789012345678'],
          },
        },
        resources(),
      ),
    /INVALID_CHANNEL/u,
  );
});


test('dashboard validates command role and channel access selectors', () => {
  assert.throws(
    () =>
      validateSettingsResources(
        {
          commandPermissions: {
            weather: {
              roleMode: 'deny-all-except',
              roleIds: ['523456789012345678'],
              channelMode: 'allow-all-except',
              channelIds: [],
            },
          },
        },
        resources(),
      ),
    /INVALID_ROLE/u,
  );

  assert.throws(
    () =>
      validateSettingsResources(
        {
          commandPermissions: {
            weather: {
              roleMode: 'allow-all-except',
              roleIds: [],
              channelMode: 'deny-all-except',
              channelIds: ['523456789012345678'],
            },
          },
        },
        resources(),
      ),
    /INVALID_CHANNEL/u,
  );
});
