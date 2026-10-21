import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { signUnsubscribe, verifyUnsubscribe } from './integrations/unsubscribe.controller';
test('unsubscribe signatures bind the tenant and contact and reject altered payloads',()=>{
 const key=randomBytes(32), token=signUnsubscribe('tenant-a','contact-a',key);
 assert.deepEqual(verifyUnsubscribe(token,key),{tenantId:'tenant-a',contactId:'contact-a'});
 assert.throws(()=>verifyUnsubscribe(token,randomBytes(32)));
 assert.throws(()=>verifyUnsubscribe(Buffer.from(JSON.stringify({tenantId:'tenant-b',contactId:'contact-a'})).toString('base64url')+'.'+token.split('.')[1],key));
});
