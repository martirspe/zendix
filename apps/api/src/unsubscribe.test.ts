import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { signUnsubscribe } from './integrations/unsubscribe.controller';
test('unsubscribe signatures bind the tenant and contact and reject altered payloads',()=>{
 const key=randomBytes(32),tenantId=randomUUID(),contactId=randomUUID(),token=signUnsubscribe(tenantId,contactId,key);
 assert.match(token,/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
 assert.ok(token.length<100);
 const signature=token.split('.')[2];
 assert.notEqual(signUnsubscribe(randomUUID(),contactId,key).split('.')[2],signature);
 assert.notEqual(signUnsubscribe(tenantId,randomUUID(),key).split('.')[2],signature);
 assert.notEqual(signUnsubscribe(tenantId,contactId,randomBytes(32)).split('.')[2],signature);
});
