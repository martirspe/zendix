import { ConflictException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { Database } from '../database';

interface SesEvent {eventType:string;mail:{messageId:string;timestamp:string;source?:string;destination?:string[];tags?:Record<string,string[]>};bounce?:{bounceType?:string;timestamp?:string};complaint?:{timestamp?:string};delivery?:{timestamp?:string};open?:{timestamp?:string};click?:{link?:string;timestamp?:string};}
interface ProviderEventJob {tenantId:string;eventId:string;}
const eventTypes=new Set(['Send','Delivery','Bounce','Complaint','Reject','Open','Click']);
export function normalizeSesEvent(value:unknown):{tenantId:string;dispatchId:string;event:SesEvent;occurredAt:Date}{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ConflictException('Evento SES inválido.');
  const event=value as SesEvent;
  const tenantId=event.mail?.tags?.['mailcraft_tenant']?.[0],dispatchId=event.mail?.tags?.['mailcraft_dispatch']?.[0];
  const eventTimestamp=event.eventType==='Bounce'?event.bounce?.timestamp:event.eventType==='Complaint'?event.complaint?.timestamp:event.eventType==='Delivery'?event.delivery?.timestamp:event.eventType==='Open'?event.open?.timestamp:event.eventType==='Click'?event.click?.timestamp:undefined;
  const occurredAt=new Date(eventTimestamp??event.mail?.timestamp??'');
  if(!eventTypes.has(event.eventType)||!event.mail?.messageId||event.mail.messageId.length>256||!tenantId||!dispatchId||!/^[0-9a-f-]{36}$/i.test(tenantId)||!/^[0-9a-f-]{36}$/i.test(dispatchId)||!Number.isFinite(occurredAt.getTime()))throw new ConflictException('Campos del evento SES inválidos.');
  return {tenantId,dispatchId,event,occurredAt};
}
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
  this.worker.on('error',()=>undefined);this.worker.on('failed',job=>{if(job&&job.attemptsMade>=10)void this.db.providerWebhookEvent.updateMany({where:{tenantId:job.data.tenantId,id:job.data.eventId,status:'received'},data:{status:'failed'}}).catch(()=>undefined);});this.queue.on('error',()=>undefined);
  this.timer=setInterval(()=>{void this.reconcile().catch(()=>undefined);},5000);this.timer.unref();void this.reconcile().catch(()=>undefined);
 }
 async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.worker?.close();await this.queue?.close();}
 async receiveSes(snsMessageId:string,value:unknown){
  if(!/^[0-9a-f-]{36}$/i.test(snsMessageId))throw new ConflictException('Identificador SNS inválido.');
  const {tenantId,dispatchId,event,occurredAt}=normalizeSesEvent(value);
  const account=await this.db.emailProviderAccount.findUnique({where:{tenantId_provider:{tenantId,provider:'ses'}}});
  if(!account?.webhookVerifiedAt)throw new ConflictException('La conexión SES no tiene eventos verificados.');
  const dispatch=await this.db.emailDispatch.findFirst({where:{tenantId,id:dispatchId,provider:'ses'},select:{fromEmail:true,recipient:true,providerId:true,status:true}});
  const testEmail=dispatch?null:await this.db.testEmail.findFirst({where:{tenantId,id:dispatchId},select:{fromEmail:true,recipient:true,messageId:true,status:true}});
  const sender=dispatch??testEmail,storedId=dispatch?.providerId??testEmail?.messageId;
  if(!sender||sender.fromEmail!==account.accountHandle||event.mail.source!==sender.fromEmail||!event.mail.destination?.includes(sender.recipient??'')||(storedId!==null&&storedId!==event.mail.messageId))throw new ConflictException('El evento SES no corresponde al remitente y envío de este espacio.');
  if(storedId===null){
   if(!['submitting','uncertain'].includes(sender.status))throw new ConflictException('El envío SES aún no tiene un identificador verificable.');
   if(dispatch)await this.db.emailDispatch.updateMany({where:{tenantId,id:dispatchId,provider:'ses',providerId:null,status:{in:['submitting','uncertain']}},data:{providerId:event.mail.messageId,status:'accepted'}});
   else await this.db.testEmail.updateMany({where:{tenantId,id:dispatchId,messageId:null,status:{in:['submitting','uncertain']}},data:{messageId:event.mail.messageId,status:'accepted',errorCode:null}});
  }
  await this.db.providerWebhookEvent.createMany({data:[{tenantId,provider:'ses',providerEventId:snsMessageId,accountHandle:account.accountHandle,requestId:event.mail.messageId,eventType:event.eventType,occurredAt,payload:event as unknown as Prisma.InputJsonValue}],skipDuplicates:true});
  await this.enqueuePending(tenantId,[snsMessageId]);
  return {received:true};
 }
 private async enqueuePending(tenantId:string,eventKeys?:string[]){
  const events=await this.db.providerWebhookEvent.findMany({where:{tenantId,provider:'ses',status:'received',...(eventKeys?{providerEventId:{in:eventKeys}}:{})},take:1000,select:{id:true}});
  for(const event of events){const jobId='provider-'+event.id;const existing=await this.queue.getJob(jobId);if(existing&&['failed','completed'].includes(await existing.getState()))await existing.remove();await this.queue.add('process',{tenantId,eventId:event.id},{jobId,attempts:10,backoff:{type:'exponential',delay:1000},removeOnComplete:{age:604800},removeOnFail:{age:604800}});}
 }
 private async reconcile(){if(this.reconciling)return;this.reconciling=true;try{const tenants=await this.db.providerWebhookEvent.findMany({where:{provider:'ses',status:'received'},distinct:['tenantId'],take:100,select:{tenantId:true}});for(const item of tenants)await this.enqueuePending(item.tenantId);}finally{this.reconciling=false;}}
 private async process(job:Job<ProviderEventJob>){
  const {tenantId,eventId}=job.data;
  const record=await this.db.providerWebhookEvent.findFirst({where:{tenantId,id:eventId,provider:'ses'}});
  if(!record||record.status!=='received')return;
  const event=record.payload as unknown as SesEvent;
  const dispatch=await this.db.emailDispatch.findFirst({where:{tenantId,provider:'ses',providerId:event.mail.messageId},select:{id:true,contactId:true,status:true}});
  const testEmail=!dispatch?await this.db.testEmail.findFirst({where:{tenantId,messageId:event.mail.messageId},select:{id:true,contactId:true}}):null;
  if(!dispatch&&!testEmail){if(job.attemptsMade<9)throw new Error('SES_MESSAGE_NOT_CORRELATED');await this.db.providerWebhookEvent.updateMany({where:{tenantId,id:eventId,status:'received'},data:{status:'failed',attempts:{increment:1}}});return;}
  const kind=event.eventType==='Bounce'?(event.bounce?.bounceType==='Permanent'?'hard-bounced':'soft-bounced'):event.eventType==='Complaint'?'complained':event.eventType==='Reject'?'dropped':event.eventType==='Delivery'?'delivered':event.eventType==='Send'?'processed':event.eventType.toLowerCase();
  await this.db.$transaction(async tx=>{
   if(dispatch){
    const click=kind==='click'&&event.click?.link?{url:safeClickUrl(event.click.link)}:undefined;
    await tx.emailEvent.createMany({data:[{tenantId,dispatchId:dispatch.id,providerEventId:record.providerEventId,type:kind,...(click?{payload:click}:{}),occurredAt:record.occurredAt}],skipDuplicates:true});
    const status=kind==='delivered'?'delivered':kind==='hard-bounced'?'bounced':kind==='soft-bounced'?'soft_bounced':kind==='complained'?'complained':kind==='dropped'?'dropped':kind==='processed'?'processed':null;
    if(status){const terminal=['bounced','complained','dropped'];await tx.emailDispatch.updateMany({where:{tenantId,id:dispatch.id,...(terminal.includes(status)?{}:{status:{notIn:terminal}})},data:{status}});}
   }
   const contactId=dispatch?.contactId??testEmail?.contactId;
   if(contactId){const status=kind==='hard-bounced'?'bounced':kind==='complained'?'complained':null;if(status)await tx.contact.updateMany({where:{tenantId,id:contactId,archivedAt:null,status:'subscribed'},data:{status}});}
   await tx.providerWebhookEvent.updateMany({where:{tenantId,id:eventId,status:'received'},data:{status:'processed',processedAt:new Date(),attempts:{increment:1}}});
  });
 }
}
function safeClickUrl(value:string):string|null{try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;url.search='';url.hash='';return url.toString().slice(0,2048);}catch{return null;}}
