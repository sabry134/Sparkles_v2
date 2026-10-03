import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import test from 'node:test';
import { guildResources } from '../dashboard/server/discord.js';

function fixture() {
  const nextId = (() => {
    let value = BigInt(randomInt(100_000_000, 999_999_999)) * 1_000_000_000n;
    return () => String(value++);
  })();
  const guildId = nextId();
  const botId = nextId();
  const botRoleId = nextId();
  const categoryId = nextId();
  const channelId = nextId();
  const lowerRoleId = nextId();
  const higherRoleId = nextId();
  const config = Object.freeze({ botToken: randomBytes(32).toString('hex') });
  const roles = [
    { id: guildId, permissions: '0', position: 0, name: '@everyone' },
    { id: botRoleId, permissions: String(1n << 3n), position: 2, managed: true },
    { id: lowerRoleId, permissions: '0', position: 1, name: 'Member', color: 0 },
    { id: higherRoleId, permissions: '0', position: 3, name: 'Owner', color: 0 },
  ];
  const routes = new Map([
    ['/api/v10/users/@me', { id: botId, bot: true }],
    [
      `/api/v10/guilds/${guildId}/channels`,
      [
        { id: channelId, name: 'general', type: 0, position: 0, parent_id: categoryId },
        { id: categoryId, name: 'Community', type: 4, position: 0 },
      ],
    ],
    [`/api/v10/guilds/${guildId}/roles`, roles],
    [`/api/v10/guilds/${guildId}/members/${botId}`, { roles: [botRoleId] }],
  ]);
  return { config, guildId, botId, botRoleId, lowerRoleId, higherRoleId, roles, routes };
}

function mockDiscord(context, data, handleIdentity) {
  return context.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, 'https://discord.com');
    assert.equal(options.headers.authorization, `Bot ${data.config.botToken}`);
    assert.equal(options.method ?? 'GET', 'GET');
    if (target.pathname === '/api/v10/users/@me' && handleIdentity) {
      return handleIdentity();
    }
    if (!data.routes.has(target.pathname)) {
      return Response.json({ code: 50035 }, { status: 400 });
    }
    return Response.json(data.routes.get(target.pathname));
  });
}

test('opening server settings loads the authenticated bot member and preserves role hierarchy', async (context) => {
  const data = fixture();
  const fetch = mockDiscord(context, data);

  const [resources, concurrentResources] = await Promise.all([
    guildResources(data.guildId, data.config),
    guildResources(data.guildId, data.config),
  ]);
  assert.deepEqual(concurrentResources, resources);
  assert.equal(resources.channels[0].name, 'general');
  assert.equal(resources.categories[0].name, 'Community');
  assert.equal(resources.capabilities.canManageRoles, true);
  assert.deepEqual(
    resources.roles.map(({ id, assignable }) => ({ id, assignable })),
    [
      { id: data.higherRoleId, assignable: false },
      { id: data.botRoleId, assignable: false },
      { id: data.lowerRoleId, assignable: true },
    ],
  );
  assert.equal(
    fetch.mock.calls.filter(({ arguments: [url] }) => url.endsWith('/users/@me')).length,
    1,
  );

  data.roles.find(({ id }) => id === data.botRoleId).permissions = '0';
  const withoutPermission = await guildResources(data.guildId, data.config);
  assert.equal(withoutPermission.capabilities.canManageRoles, false);
  assert.ok(withoutPermission.roles.every(({ assignable }) => !assignable));
});

test('a failed bot identity lookup can be retried when opening server settings', async (context) => {
  const data = fixture();
  let identityRequests = 0;
  mockDiscord(context, data, () => {
    identityRequests += 1;
    return identityRequests === 1
      ? Response.json({ code: 0 }, { status: 503 })
      : Response.json({ id: data.botId, bot: true });
  });

  const resources = await guildResources(data.guildId, data.config);
  assert.equal(resources.capabilities.canManageRoles, true);
  assert.equal(identityRequests, 2);
});

test('invalid upstream bot identities cannot become member request paths', async (context) => {
  const data = fixture();
  const fetch = mockDiscord(context, data, () => Response.json({ id: '../@me' }));

  await assert.rejects(guildResources(data.guildId, data.config), {
    code: 'DISCORD_API_ERROR',
  });
  assert.ok(fetch.mock.calls.every(({ arguments: [url] }) => !url.includes('/members/')));
});


test('AppError response details remain safe and structured', async () => {
  const { AppError, errorResponse } = await import('../dashboard/server/errors.js');
  const result = errorResponse(
    new AppError('INVALID_ROLE', 400, {
      details: [
        {
          code: 'role',
          path: 'automod.exemptRoleIds',
          roleId: '523456789012345678',
          reason: 'not_found',
        },
      ],
    }),
    'request-test',
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error.requestId, 'request-test');
  assert.equal(result.body.error.details[0].roleId, '523456789012345678');
});
