import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectRecords, DnsRecords } from './dns-diagnostics';

const records: DnsRecords = {
  spf: ['v=spf1 include:relay.mailchannels.net -all'],
  dkim: ['v=DKIM1; k=rsa; p=YWJjZA=='],
  dmarc: ['v=DMARC1; p=reject;'],
  ownership: ['proof'], lockdown: ['v=mc1 auth=account'], mx: ['mx.example.com'],
};
test('DNS inspection separates ownership from public record detection', () => {
  assert.equal(inspectRecords(records, 'another-tenant-proof', 'account').ownership, false);
  assert.equal(inspectRecords(records, 'proof', 'account').spf, true);
  assert.equal(inspectRecords(records, 'proof', '').lockdown, false);
  assert.equal(inspectRecords(records, 'proof', 'account-prefix').lockdown, false);
});
test('DNS inspection rejects duplicate SPF, permissive policy and revoked DKIM', () => {
  assert.equal(inspectRecords({...records, spf: [...records.spf, ...records.spf]}, 'proof', 'account').spf, false);
  assert.equal(inspectRecords({...records, spf: ['v=spf1 include:relay.mailchannels.net +all']}, 'proof', 'account').spf, false);
  assert.equal(inspectRecords({...records, dkim: ['v=DKIM1; p=']}, 'proof', 'account').dkim, false);
});
