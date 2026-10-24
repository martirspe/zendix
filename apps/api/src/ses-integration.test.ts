import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSesEvent } from './integrations/provider-webhook.service';
import { verifySnsEnvelope } from './integrations/ses-webhook.controller';

const tenantId='00000000-0000-4000-8000-000000000001';
const dispatchId='00000000-0000-4000-8000-000000000002';
test('SES events require tenant and dispatch tags for correlation',()=>{
 const valid={eventType:'Bounce',mail:{messageId:'ses-message',timestamp:new Date().toISOString(),tags:{mailcraft_tenant:[tenantId],mailcraft_dispatch:[dispatchId]}},bounce:{bounceType:'Permanent'}};
 assert.equal(normalizeSesEvent(valid).tenantId,tenantId);
 assert.throws(()=>normalizeSesEvent({...valid,mail:{...valid.mail,tags:{mailcraft_tenant:[tenantId]}}}));
 assert.throws(()=>normalizeSesEvent({...valid,eventType:'Unknown'}));
});
test('SNS rejects an unexpected topic before fetching any certificate',async()=>{
 await assert.rejects(verifySnsEnvelope({Type:'Notification',TopicArn:'arn:aws:sns:us-east-1:123456789012:other',SignatureVersion:'2'},'arn:aws:sns:us-east-1:123456789012:mailcraft'));
});
test('SNS rejects certificate URLs outside its regional AWS endpoint',async()=>{
 const topic='arn:aws:sns:us-east-1:123456789012:mailcraft';
 await assert.rejects(verifySnsEnvelope({Type:'Notification',TopicArn:topic,MessageId:'00000000-0000-4000-8000-000000000003',Message:'{}',Timestamp:new Date().toISOString(),SignatureVersion:'2',Signature:'AA==',SigningCertURL:'https://example.invalid/SimpleNotificationService.pem'},topic));
});
