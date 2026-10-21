import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CloudflareService} from './integrations/cloudflare.service';
import {Database} from './database';
import {SecretVault} from './integrations/secret-vault';
import {MailchannelsSmtp} from './integrations/mailchannels-smtp';
import {DnsRecord} from './integrations/cloudflare-plan';

test('Cloudflare console flow applies one safe batch and does not repeat existing DNS changes',async context=>{
 const records:DnsRecord[]=[{id:'spf',name:'example.com',type:'TXT',content:'v=spf1 include:_spf.google.com -all',ttl:3600},{id:'mx',name:'example.com',type:'MX',content:'aspmx.l.google.com',ttl:3600}];
 let batches=0;
 context.mock.method(globalThis,'fetch',async(input:unknown,options?:RequestInit)=>{
  const url=new URL(String(input));let result:unknown;
  if(url.pathname.endsWith('/zones'))result=[{id:'zone',name:'example.com',status:'active'}];
  else if(url.pathname.endsWith('/batch')){
   batches++;const body=JSON.parse(String(options?.body)) as {posts:{type:string;name:string;content:string}[];patches:{id:string;content:string}[]};
   for(const patch of body.patches){const record=records.find(item=>item.id===patch.id);assert.ok(record);record.content=patch.content;}
   for(const post of body.posts)records.push({...post,id:'record-'+records.length,ttl:1});result={};
  }else result=records.filter(record=>record.name===url.searchParams.get('name'));
  return new Response(JSON.stringify({success:true,result}),{status:200,headers:{'content-type':'application/json'}});
 });
 const db={domain:{findFirst:async({where}:{where:{tenantId:string}})=>where.tenantId==='tenant'?{id:'domain',hostname:'example.com'}:null}} as unknown as Database;
 const vault={load:async()=>({token:'synthetic-test-token'}),store:async()=>undefined,dkim:async()=>({publicKey:'public-key',privateKey:'not-returned'})} as unknown as SecretVault;
 const smtp={settings:async()=>({accountId:'account',fromEmail:'sender@example.com'})} as unknown as MailchannelsSmtp;
 class TestCloudflare extends CloudflareService{protected override async resolveSpf(){return ['v=spf1 ip4:192.0.2.0/24 -all'];}}
 const service=new TestCloudflare(db,vault,smtp);
 assert.equal((await service.configure('tenant','domain')).configured,true);
 assert.equal((await service.configure('tenant','domain')).changes.length,0);
 assert.equal(batches,1);assert.equal(records.find(record=>record.id==='mx')?.content,'aspmx.l.google.com');
 await assert.rejects(service.configure('other-tenant','domain'));
});
