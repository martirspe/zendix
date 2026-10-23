import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MailchannelsEmailApi,MailchannelsEmailSettings} from './integrations/mailchannels-email-api';

const settings:MailchannelsEmailSettings={apiKey:'test-api-key-with-enough-length',accountId:'test-account',fromEmail:'sender@example.com',fromName:'MailCraft',testRecipient:'person@example.com',publicBaseUrl:'https://app.example.com'};

test('MailChannels Email API validates credentials and keeps the API key out of its response',async context=>{
 let stored:unknown;
 let calls=0;
 context.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
  assert.equal(new Headers(init?.headers).get('X-Api-Key'),settings.apiKey);
  calls++;
  if(calls===1){assert.equal(String(input),'https://api.mailchannels.net/tx/v1/webhook');return new Response('[]',{status:200});}
  if(calls===2){assert.equal(String(input),'https://api.mailchannels.net/tx/v1/webhook?endpoint=https%3A%2F%2Fapp.example.com%2Fwebhooks%2Fmailchannels');assert.equal(init?.method,'POST');return new Response(null,{status:204});}
  assert.equal(String(input),'https://api.mailchannels.net/tx/v1/webhook/validate');assert.equal(init?.method,'POST');return new Response(JSON.stringify({all_passed:true}),{status:200});
 });
 const db={emailProviderAccount:{findUnique:async()=>null,upsert:async()=>undefined,update:async()=>undefined}};
 const provider=new MailchannelsEmailApi({load:async()=>null,store:async(_tenant:string,_kind:string,value:unknown)=>{stored=value;}} as never,db as never);
 const result=await provider.connect('tenant',settings);
 assert.deepEqual(result,{connected:true,fromEmail:settings.fromEmail,testRecipient:settings.testRecipient,webhookVerified:true});
 assert.equal(calls,3);
 assert.deepEqual(stored,settings);
});

test('MailChannels Email API sends one recipient with unsubscribe headers and provider-managed DKIM',async context=>{
 let sent:Record<string,unknown>|undefined;
 context.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
  assert.equal(String(input),'https://api.mailchannels.net/tx/v1/send');
  assert.equal(new Headers(init?.headers).get('X-Api-Key'),settings.apiKey);
  sent=JSON.parse(String(init?.body)) as Record<string,unknown>;
  return new Response(null,{status:202,headers:{'x-request-id':'provider-request'}});
 });
 const provider=new MailchannelsEmailApi({load:async()=>settings} as never,{} as never);
 const result=await provider.send('tenant',{recipient:'person@example.com',fromEmail:settings.fromEmail,fromName:settings.fromName,subject:'News',html:'<a href="https://app.example.com/unsubscribe/token/signature">Baja</a>',text:'Baja: https://app.example.com/unsubscribe/token/signature',unsubscribeUrl:'https://app.example.com/unsubscribe/token/signature',dkimSelector:'mailcraft',dispatchId:'dispatch-123'});
 assert.deepEqual(result,{accepted:true,providerMessageId:'provider-request'});
 const payload=sent as {personalizations:{to:{email:string}[];headers:Record<string,string>}[];dkim_selector:string;dkim_private_key?:string};
 assert.deepEqual(payload.personalizations[0]?.to,[{email:'person@example.com'}]);
 assert.equal(payload.personalizations[0]?.headers['List-Unsubscribe'],'<https://app.example.com/unsubscribe/token/signature>');
 assert.equal(payload.personalizations[0]?.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 assert.equal(payload.personalizations[0]?.headers['X-MailCraft-Dispatch-Id'],'dispatch-123');
 assert.equal(payload.dkim_selector,'mailcraft');
 assert.equal(payload.dkim_private_key,undefined);
});

test('MailChannels Email API does not treat transport loss as a safe retry',async context=>{
 context.mock.method(globalThis,'fetch',async()=>{throw new Error('network unavailable');});
 const provider=new MailchannelsEmailApi({load:async()=>settings} as never,{} as never);
 await assert.rejects(provider.send('tenant',{recipient:'person@example.com',fromEmail:settings.fromEmail,fromName:settings.fromName,subject:'News',html:'<p>News</p>',text:'News',unsubscribeUrl:'https://app.example.com/unsubscribe/token/signature',dkimSelector:'mailcraft',dispatchId:'dispatch-123'}),error=>error instanceof Error&&'code' in error&&error.code==='ECONNECTION');
});
