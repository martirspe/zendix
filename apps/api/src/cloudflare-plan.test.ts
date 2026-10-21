import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDns, DnsRecord } from './integrations/cloudflare-plan';
test('DNS planning preserves MX and DMARC policy and extends one existing SPF', () => {
  const records: DnsRecord[] = [{id:'mx',name:'example.com',type:'MX',content:'aspmx.l.google.com',ttl:3600},{id:'spf',name:'example.com',type:'TXT',content:'v=spf1 include:_spf.google.com -all',ttl:3600},{id:'dmarc',name:'_dmarc.example.com',type:'TXT',content:'v=DMARC1; p=reject;',ttl:3600}];
  const plan = planDns(records,'example.com','proof','account','mailcraft','key');
  assert.equal(plan.filter(change => change.name === 'example.com').length,1);
  assert.ok(plan.find(change => change.id === 'spf')?.content.includes('include:_spf.google.com -all'));
  assert.ok(!plan.some(change => change.name === '_dmarc.example.com'));
  assert.ok(!plan.some(change => change.id === 'mx'));
});
test('DNS planning is idempotent and rejects multiple SPF records and selector conflicts', () => {
  const plan = planDns([],'example.com','proof','account','mailcraft','key');
  const records = plan.map((change,index) => ({id:String(index),name:change.name,type:'TXT',content:change.content,ttl:1}));
  assert.deepEqual(planDns(records,'example.com','proof','account','mailcraft','key'),[]);
  assert.throws(() => planDns([...records,{id:'extra',name:'example.com',type:'TXT',content:'v=spf1 -all',ttl:1}],'example.com','proof','account','mailcraft','key'));
  assert.throws(() => planDns(records,'example.com','proof','account','mailcraft','another-key'));
});
