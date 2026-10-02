import assert from 'node:assert/strict';
import test from 'node:test';
import { securityInternals } from '../src/modules/extended.js';

test('web status blocks private and special network ranges', () => {
  const privateAddresses = [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '::',
    '::1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ];

  for (const address of privateAddresses) {
    assert.equal(securityInternals.isPrivateAddress(address), true, address);
  }
});

test('web status permits normal public addresses', () => {
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) {
    assert.equal(securityInternals.isPrivateAddress(address), false, address);
  }
});
