import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSesEvent } from './integrations/provider-webhook.service';
import { verifySnsEnvelope } from './integrations/ses-webhook.controller';
import { ownershipRecord } from './integrations/domain-ownership';
import { SesEmail } from './integrations/ses-email';

const tenantId='00000000-0000-4000-8000-000000000001';
const dispatchId='00000000-0000-4000-8000-000000000002';
test('SES events require tenant and dispatch tags for correlation',()=>{
 const valid={eventType:'Bounce',mail:{messageId:'ses-message',timestamp:new Date().toISOString(),tags:{zendix_tenant:[tenantId],zendix_dispatch:[dispatchId]}},bounce:{bounceType:'Permanent'}};
 assert.equal(normalizeSesEvent(valid).tenantId,tenantId);
 assert.throws(()=>normalizeSesEvent({...valid,mail:{...valid.mail,tags:{zendix_tenant:[tenantId]}}}));
 assert.throws(()=>normalizeSesEvent({...valid,eventType:'Unknown'}));
});
test('SNS rejects an unexpected topic before fetching any certificate',async()=>{
 await assert.rejects(verifySnsEnvelope({Type:'Notification',TopicArn:'arn:aws:sns:us-east-1:123456789012:other',SignatureVersion:'2'},'arn:aws:sns:us-east-1:123456789012:zendix'));
});
test('SNS rejects certificate URLs outside its regional AWS endpoint',async()=>{
 const topic='arn:aws:sns:us-east-1:123456789012:zendix';
 await assert.rejects(verifySnsEnvelope({Type:'Notification',TopicArn:topic,MessageId:'00000000-0000-4000-8000-000000000003',Message:'{}',Timestamp:new Date().toISOString(),SignatureVersion:'2',Signature:'AA==',SigningCertURL:'https://example.invalid/SimpleNotificationService.pem'},topic));
});
test('sender-domain ownership proofs are isolated by tenant',()=>{
 const previous=process.env['DOMAIN_VERIFICATION_SECRET'];process.env['DOMAIN_VERIFICATION_SECRET']='synthetic-test-secret';
 try{assert.notEqual(ownershipRecord('tenant-a','example.com').value,ownershipRecord('tenant-b','example.com').value);}
 finally{if(previous===undefined)delete process.env['DOMAIN_VERIFICATION_SECRET'];else process.env['DOMAIN_VERIFICATION_SECRET']=previous;}
});
test('SES tenant settings use platform-owned infrastructure values',()=>{
 const previous={region:process.env['AWS_REGION'],configurationSet:process.env['SES_CONFIGURATION_SET'],publicUrl:process.env['APP_PUBLIC_URL']};
 process.env['AWS_REGION']='us-east-1';process.env['SES_CONFIGURATION_SET']='zendix-production-campaigns';process.env['APP_PUBLIC_URL']='https://app.zendix.site/';
 try{assert.deepEqual(new SesEmail({} as never,{} as never).platformSettings(),{region:'us-east-1',configurationSet:'zendix-production-campaigns',publicBaseUrl:'https://app.zendix.site'});}
 finally{for(const [key,value] of Object.entries({AWS_REGION:previous.region,SES_CONFIGURATION_SET:previous.configurationSet,APP_PUBLIC_URL:previous.publicUrl})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('SES identity provisioning rejects a domain already owned by another tenant',async()=>{
 const database={domain:{findFirstOrThrow:async()=>({id:'domain-a'}),findFirst:async()=>({id:'domain-b'})}};
 await assert.rejects(new SesEmail({} as never,database as never).provisionIdentity('tenant-a','example.com'),(error:unknown)=>error instanceof Error&&error.message==='Este dominio ya pertenece a otro espacio de trabajo.');
});
