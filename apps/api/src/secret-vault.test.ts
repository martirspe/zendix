import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { seal, unseal } from './integrations/secret-vault';

test('encrypted credentials are bound to tenant and provider and detect tampering', () => {
  const key = randomBytes(32), payload = {password: 'synthetic-test-secret'};
  const encrypted = seal(payload, key, 'tenant-a:cloudflare');
  assert.ok(!encrypted.includes(payload.password));
  assert.deepEqual(unseal(encrypted, key, 'tenant-a:cloudflare'), payload);
  assert.throws(() => unseal(encrypted, key, 'tenant-b:cloudflare'));
  assert.throws(() => unseal(encrypted, key, 'tenant-a:ses'));
  assert.throws(() => unseal(encrypted.slice(0, -3) + 'xxx', key, 'tenant-a:cloudflare'));
});
