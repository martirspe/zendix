import { ConflictException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { createHash } from 'node:crypto';
import { Database } from '../database';

interface ProviderEvent { email?:string; customer_handle:string; timestamp:number; event:string; request_id?:string; url?:string; [key:string]:unknown; }
interface ProviderEventJob { tenantId:string; eventId:string; }
const eventTypes=new Set(['processed','delivered','dropped','unsubscribed','hard-bounced','soft-bounced','open','click','complained','test']);

export function providerEventKey(accountHandle:string,event:ProviderEvent):string{return createHash('sha256').update(accountHandle+'\n'+JSON.stringify(event)).digest('base64url');}

@Injectable()
export class ProviderWebhookService implements OnModuleInit,OnModuleDestroy {
 private queue!:Queue<ProviderEventJob>;
 private worker!:Worker<ProviderEventJob>;
 private timer?:ReturnType<typeof setInterval>;
 private reconciling=false;
 constructor(@Inject(Database) private readonly db:Database){}

 onModuleInit(){
  const url=new URL(process.env['REDIS_URL']??'redis://redis:6379');
  const connection={host:url.hostname,port:Number(url.port||6379),password:url.password||undefined,maxRetriesPerRequest:null};
  this.queue=new Queue<ProviderEventJob>('mailcraft-provider-events',{connection});
  this.worker=new Worker<ProviderEventJob>('mailcraft-provider-events',job=>this.process(job),{connection,concurrency:8,lockDuration:120000});
  this.worker.on('error',()=>undefined);
  this.worker.on('failed',(job)=>{if(job&&job.attemptsMade>=10)void this.db.providerWebhookEvent.updateMany({where:{tenantId:job.data.tenantId,id:job.data.eventId,status:'received'},data:{status:'failed'}}).catch(()=>undefined);});
  this.queue.on('error',()=>undefined);
  this.timer=setInterval(()=>{void this.reconcile().catch(()=>undefined);},5000);this.timer.unref();void this.reconcile().catch(()=>undefined);
 }
 async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.worker?.close();await this.queue?.close();}

 async receive(input:unknown){
  if(!Array.isArray(input)||input.length===0||input.length>1000)throw new ConflictException('Lote de eventos inválido.');
  const payloads=input as unknown[];
  const normalized=payloads.map((value)=>{
   if(!value||typeof value!=='object'||Array.isArray(value))throw new ConflictException('Evento de proveedor inválido.');
   const event=value as Record<string,unknown>,accountHandle=event['customer_handle'],timestamp=event['timestamp'],eventType=event['event'],requestId=event['request_id'];
   if(typeof accountHandle!=='string'||accountHandle.length>128||typeof timestamp!=='number'||!Number.isSafeInteger(timestamp)||timestamp<=0||!Number.isFinite(timestamp)||typeof eventType!=='string'||!eventTypes.has(eventType)||(requestId!==undefined&&(typeof requestId!=='string'||requestId.length<1||requestId.length>256))||(eventType==='click'&&(typeof event['url']!=='string'||event['url'].length>4096)))throw new ConflictException('Campos del evento de proveedor inválidos.');
   return {accountHandle,event:event as unknown as ProviderEvent,occurredAt:new Date(timestamp*1000)};
  });
  const handles=[...new Set(normalized.map(item=>item.accountHandle))];
  const accounts=await this.db.emailProviderAccount.findMany({where:{provider:'mailchannels',accountHandle:{in:handles}},select:{tenantId:true,accountHandle:true}});
  const tenantByHandle=new Map(accounts.map(account=>[account.accountHandle,account.tenantId]));
  if(handles.some(handle=>!tenantByHandle.has(handle)))throw new ConflictException('La cuenta del evento no tiene un webhook de MailChannels validado.');
  const groups=new Map<string,typeof normalized>();
  for(const item of normalized){const tenantId=tenantByHandle.get(item.accountHandle);if(!tenantId)throw new ConflictException('La cuenta del evento no está conectada.');const group=groups.get(tenantId)??[];group.push(item);groups.set(tenantId,group);}
  for(const [tenantId,events] of groups){
   await this.db.providerWebhookEvent.createMany({data:events.map(item=>({tenantId,provider:'mailchannels',providerEventId:providerEventKey(item.accountHandle,item.event),accountHandle:item.accountHandle,requestId:item.event.request_id,eventType:item.event.event,occurredAt:item.occurredAt,payload:item.event as Prisma.InputJsonValue})),skipDuplicates:true});
   await this.enqueuePending(tenantId,events.map(item=>providerEventKey(item.accountHandle,item.event)));
  }
  return {received:true,count:normalized.length};
 }

 private async enqueuePending(tenantId:string,eventKeys?:string[]){
  const events=await this.db.providerWebhookEvent.findMany({where:{tenantId,provider:'mailchannels',status:'received',...(eventKeys?{providerEventId:{in:eventKeys}}:{})},take:1000,select:{id:true}});
  for(const event of events){const jobId='provider-'+event.id;const existing=await this.queue.getJob(jobId);if(existing&&['failed','completed'].includes(await existing.getState()))await existing.remove();await this.queue.add('process',{tenantId,eventId:event.id},{jobId,attempts:10,backoff:{type:'exponential',delay:1000},removeOnComplete:{age:604800},removeOnFail:{age:604800}});}
 }
 private async reconcile(){if(this.reconciling)return;this.reconciling=true;try{const tenants=await this.db.providerWebhookEvent.findMany({where:{provider:'mailchannels',status:'received'},distinct:['tenantId'],take:100,select:{tenantId:true}});for(const item of tenants)await this.enqueuePending(item.tenantId);}finally{this.reconciling=false;}}

 private async process(job:Job<ProviderEventJob>){
  const {tenantId,eventId}=job.data;
  const record=await this.db.providerWebhookEvent.findFirst({where:{tenantId,id:eventId,provider:'mailchannels'}});
  if(!record||record.status!=='received')return;
  const payload=record.payload as ProviderEvent;
  if(payload.event==='test'){await this.db.providerWebhookEvent.updateMany({where:{tenantId,id:eventId,status:'received'},data:{status:'processed',processedAt:new Date(),attempts:{increment:1}}});return;}
  const dispatch=payload.request_id?await this.db.emailDispatch.findFirst({where:{tenantId,provider:'mailchannels',providerId:payload.request_id},select:{id:true,contactId:true,status:true}}):null;
  const testEmail=!dispatch&&payload.request_id?await this.db.testEmail.findFirst({where:{tenantId,messageId:payload.request_id},select:{id:true,contactId:true}}):null;
  if(!dispatch&&!testEmail){if(job.attemptsMade<9)throw new Error('PROVIDER_REQUEST_NOT_CORRELATED');await this.db.providerWebhookEvent.updateMany({where:{tenantId,id:eventId,status:'received'},data:{status:'failed',attempts:{increment:1}}});return;}
  await this.db.$transaction(async tx=>{
   if(dispatch){
    const eventPayload=payload.event==='click'&&payload.url?{url:safeClickUrl(payload.url)}:undefined;
    await tx.emailEvent.createMany({data:[{tenantId,dispatchId:dispatch.id,providerEventId:record.providerEventId,type:payload.event,...(eventPayload?{payload:eventPayload}:{}),occurredAt:record.occurredAt}],skipDuplicates:true});
    const status=payload.event==='delivered'?'delivered':payload.event==='hard-bounced'?'bounced':payload.event==='soft-bounced'?'soft_bounced':payload.event==='complained'?'complained':payload.event==='unsubscribed'?'unsubscribed':payload.event==='dropped'?'dropped':payload.event==='processed'?'processed':null;
    if(status){const terminal=['bounced','complained','unsubscribed','dropped'];await tx.emailDispatch.updateMany({where:{tenantId,id:dispatch.id,...(terminal.includes(status)?{}:{status:{notIn:terminal}})},data:{status}});}
   }
   const contactId=dispatch?.contactId??testEmail?.contactId;
   if(contactId){const status=payload.event==='hard-bounced'?'bounced':payload.event==='complained'?'complained':payload.event==='unsubscribed'?'unsubscribed':null;if(status)await tx.contact.updateMany({where:{tenantId,id:contactId,archivedAt:null,status:'subscribed'},data:{status}});}
   await tx.providerWebhookEvent.updateMany({where:{tenantId,id:eventId,status:'received'},data:{status:'processed',processedAt:new Date(),attempts:{increment:1}}});
  });
 }
}

function safeClickUrl(value:string):string|null{try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;url.search='';url.hash='';return url.toString().slice(0,2048);}catch{return null;}}
