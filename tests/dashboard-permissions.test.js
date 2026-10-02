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
        automod: {
          antiLink: true,
          antiAlt: true,
          antiBot: true,
          antiRaid: true,
          antiSwear: true,
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
