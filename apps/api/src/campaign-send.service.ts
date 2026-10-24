import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, EmailProvider } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Database } from './database';
import { SecretVault } from './integrations/secret-vault';
import { SesEmail, SesSettings } from './integrations/ses-email';
import { DomainsController } from './domains.controller';
import { EmailDocumentDto } from './email-document.dto';
import { compileEmail, EmailBlock } from '../../../packages/email/src/compiler';
import { signUnsubscribe } from './integrations/unsubscribe.controller';
import { signEmailView } from './integrations/email-view.controller';
import { campaignSnapshot, verifyCampaignConfirmation } from './campaign-send-token';
import {hasRecordedConsent} from './consent';

interface DispatchJob {tenantId:string;dispatchId:string;}
interface EligibleContact {id:string;email:string;firstName:string;attributes:Prisma.JsonValue;}
interface CampaignSnapshot {campaign:{id:string;status:string;subject:string;subjectVariant:string|null;variantPercent:number|null;preheader:string;document:Prisma.JsonValue};listIds:string[];contacts:EligibleContact[];}
const consented=hasRecordedConsent;

@Injectable()
export class CampaignSendService implements OnModuleInit,OnModuleDestroy {
 private queue!:Queue<DispatchJob>;
 private worker!:Worker<DispatchJob>;
 private timer?:ReturnType<typeof setInterval>;
 private reconciling=false;
 private readonly dnsCache=new Map<string,{checkedAt:number;ready:boolean}>();
 constructor(@Inject(Database) private readonly db:Database,@Inject(SecretVault) private readonly vault:SecretVault,@Inject(SesEmail) private readonly ses:SesEmail,@Inject(DomainsController) private readonly domains:DomainsController){}

 onModuleInit(){
  const url=new URL(process.env['REDIS_URL']??'redis://redis:6379');
  const connection={host:url.hostname,port:Number(url.port||6379),password:url.password||undefined,maxRetriesPerRequest:null};
  this.queue=new Queue<DispatchJob>('mailcraft-campaign-dispatch',{connection});
  this.worker=new Worker<DispatchJob>('mailcraft-campaign-dispatch',job=>this.process(job),{connection,concurrency:4,lockDuration:120000});
  this.queue.on('error',()=>undefined);this.worker.on('error',()=>undefined);this.worker.on('failed',()=>undefined);
  this.timer=setInterval(()=>{void this.reconcile().catch(()=>undefined);},5000);this.timer.unref();void this.reconcile().catch(()=>undefined);
 }
 async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.worker?.close();await this.queue?.close();}

 async confirm(tenantId:string,campaignId:string,token:string){return this.submit(tenantId,campaignId,token);}

 async schedule(tenantId:string,campaignId:string,token:string,scheduledAtValue:string,timeZone:string){
  const scheduledAt=new Date(scheduledAtValue);
  if(!Number.isFinite(scheduledAt.getTime())||scheduledAt.getTime()<Date.now()+10*60_000||scheduledAt.getTime()>Date.now()+90*24*60*60_000)throw new BadRequestException({code:'CAMPAIGN_SCHEDULE_INVALID',message:'Programa la campaña entre 10 minutos y 90 días a partir de ahora.'});
  try{new Intl.DateTimeFormat('es',{timeZone}).format(scheduledAt);}catch{throw new BadRequestException({code:'CAMPAIGN_TIME_ZONE_INVALID',message:'Selecciona una zona horaria válida.'});}
  return this.submit(tenantId,campaignId,token,scheduledAt,timeZone);
 }

 private async submit(tenantId:string,campaignId:string,token:string,scheduledAt?:Date,timeZone='UTC'){
  const settings=await this.ses.settings(tenantId);
  const snapshot=await this.db.$transaction(tx=>this.capture(tx,tenantId,campaignId),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  await this.assertPrerequisites(tenantId,snapshot,settings,token,scheduledAt?.toISOString());
  const key=await this.vault.masterKey();
  const result=await this.db.$transaction(async tx=>{
   const latest=await this.capture(tx,tenantId,campaignId);
   if(latest.campaign.status!=='draft')throw new ConflictException({code:'CAMPAIGN_ALREADY_SUBMITTED',message:'Esta campaña ya se confirmó y no se volverá a encolar.'});
   const variant={subjectVariant:latest.campaign.subjectVariant,variantPercent:latest.campaign.variantPercent};
   const freshSnapshot=campaignSnapshot(tenantId,campaignId,latest.campaign.subject,latest.campaign.preheader,latest.campaign.document,latest.listIds,latest.contacts.map(contact=>contact.id),scheduledAt?.toISOString(),variant);
   if(!verifyCampaignConfirmation(token,freshSnapshot,tenantId,campaignId,key))throw new ConflictException({code:'CAMPAIGN_REVIEW_EXPIRED',message:'La audiencia o el diseño cambiaron. Revisa la campaña y confirma de nuevo.'});
   if(!latest.listIds.length||!latest.contacts.length)throw new BadRequestException({code:'CAMPAIGN_AUDIENCE_EMPTY',message:'La audiencia ya no contiene contactos con consentimiento.'});
   for(let offset=0;offset<latest.contacts.length;offset+=1000){
    const batch=latest.contacts.slice(offset,offset+1000);
    await tx.emailDispatch.createMany({data:batch.map(contact=>{const bucket=parseInt(createHash('sha256').update(campaignId+':'+contact.id).digest('hex').slice(0,8),16)%100;const subject=latest.campaign.subjectVariant&&latest.campaign.variantPercent&&bucket<latest.campaign.variantPercent?latest.campaign.subjectVariant:latest.campaign.subject;return {id:randomUUID(),tenantId,campaignId,contactId:contact.id,provider:EmailProvider.ses,status:scheduledAt?'scheduled':'pending',recipient:contact.email,fromEmail:settings.fromEmail,subject};}),skipDuplicates:false});
   }
   const changed=await tx.campaign.updateMany({where:{tenantId,id:campaignId,status:'draft'},data:{status:scheduledAt?'scheduled':'sending',scheduledAt:scheduledAt??null,timeZone}});
   if(!changed.count)throw new ConflictException({code:'CAMPAIGN_ALREADY_SUBMITTED',message:'Esta campaña ya se confirmó y no se volverá a encolar.'});
   return {campaignId,queued:latest.contacts.length};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  if(!scheduledAt)await this.enqueuePending(tenantId,campaignId);
  return {campaignId:result.campaignId,status:scheduledAt?'scheduled':'sending',queued:result.queued,scheduledAt:scheduledAt?.toISOString()??null};
 }

 async cancelSchedule(tenantId:string,campaignId:string){return this.db.$transaction(async tx=>{const campaign=await tx.campaign.findFirst({where:{tenantId,id:campaignId,status:'scheduled'},select:{scheduledAt:true}});if(!campaign)throw new ConflictException({code:'CAMPAIGN_NOT_SCHEDULED',message:'La campaña ya no está programada o comenzó su envío.'});if(!campaign.scheduledAt||campaign.scheduledAt<=new Date())throw new ConflictException({code:'CAMPAIGN_SCHEDULE_DUE',message:'La hora programada ya llegó y la campaña está pasando a la cola. Comprueba su estado antes de volver a intentarlo.'});const changed=await tx.campaign.updateMany({where:{tenantId,id:campaignId,status:'scheduled',scheduledAt:campaign.scheduledAt},data:{status:'draft',scheduledAt:null}});if(!changed.count)throw new ConflictException({code:'CAMPAIGN_NOT_SCHEDULED',message:'La campaña ya no está programada o comenzó su envío.'});await tx.emailDispatch.deleteMany({where:{tenantId,campaignId,status:'scheduled'}});return {campaignId,status:'draft',cancelled:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}

 private async capture(tx:Prisma.TransactionClient,tenantId:string,campaignId:string):Promise<CampaignSnapshot>{
  const campaign=await tx.campaign.findUnique({where:{tenantId_id:{tenantId,id:campaignId}},select:{id:true,status:true,subject:true,subjectVariant:true,variantPercent:true,preheader:true,document:true}});
  if(!campaign)throw new NotFoundException();
  const audience=await tx.campaignAudience.findMany({where:{tenantId,campaignId},select:{listId:true}});
  const listIds=audience.map(item=>item.listId).sort();
  const candidates=listIds.length?await tx.contact.findMany({where:{tenantId,archivedAt:null,status:'subscribed',memberships:{some:{tenantId,listId:{in:listIds}}}},select:{id:true,email:true,firstName:true,attributes:true}}):[];
  const contacts=candidates.filter(contact=>consented(contact.attributes));
  return {campaign,listIds,contacts};
 }

 private async assertPrerequisites(tenantId:string,snapshot:CampaignSnapshot,settings:SesSettings,token:string,scheduledAt?:string){
  if(snapshot.campaign.status!=='draft')throw new ConflictException({code:'CAMPAIGN_ALREADY_SUBMITTED',message:'Esta campaña ya se confirmó y no se volverá a encolar.'});
  await this.ses.validateWebhook(tenantId);
  const account=await this.db.emailProviderAccount.findUnique({where:{tenantId_provider:{tenantId,provider:'ses'}},select:{webhookVerifiedAt:true}});
  const failed=await this.db.providerWebhookEvent.findFirst({where:{tenantId,provider:'ses',status:'failed'},select:{id:true}});
  if(!account?.webhookVerifiedAt||failed)throw new BadRequestException({code:'PROVIDER_EVENTS_NOT_READY',message:'Valida el webhook firmado de Amazon SES y resuelve los eventos pendientes antes de enviar.'});
  if(!snapshot.listIds.length||!snapshot.contacts.length)throw new BadRequestException({code:'CAMPAIGN_AUDIENCE_EMPTY',message:'Selecciona una audiencia con contactos suscritos y consentimiento.'});
  if(!snapshot.campaign.subject.trim()||/[\r\n]/.test(snapshot.campaign.subject))throw new BadRequestException({code:'CAMPAIGN_SUBJECT_INVALID',message:'Guarda un asunto válido antes de confirmar el envío.'});
  const document=plainToInstance(EmailDocumentDto,snapshot.campaign.document);
  if(validateSync(document,{whitelist:true,forbidNonWhitelisted:true}).length)throw new BadRequestException({code:'CAMPAIGN_DESIGN_INVALID',message:'Guarda de nuevo el diseño antes de confirmar el envío.'});
  const recipient=await this.db.contact.findUnique({where:{tenantId_email:{tenantId,email:settings.testRecipient}},select:{id:true,status:true,archivedAt:true,attributes:true}});
  if(!recipient||recipient.status!=='subscribed'||recipient.archivedAt||!consented(recipient.attributes))throw new BadRequestException({code:'CAMPAIGN_TEST_CONTACT_REQUIRED',message:'El destinatario autorizado de prueba debe estar suscrito y tener consentimiento.'});
  const fingerprint=createHash('sha256').update(JSON.stringify({campaignId:snapshot.campaign.id,recipient:settings.testRecipient,from:settings.fromEmail,variant:'A',subject:snapshot.campaign.subject,preheader:snapshot.campaign.preheader,document:snapshot.campaign.document})).digest('hex');
  const preview=await this.db.testEmail.findFirst({where:{tenantId,campaignId:snapshot.campaign.id,status:'accepted',recipient:settings.testRecipient,fingerprint},select:{id:true}});
  if(!preview)throw new BadRequestException({code:'CAMPAIGN_PREVIEW_REQUIRED',message:'Envía una prueba aceptada de la versión actual antes de confirmar el envío.'});
  const host=settings.fromEmail.split('@')[1]??'';
  const domain=await this.db.domain.findUnique({where:{tenantId_hostname:{tenantId,hostname:host}}});
  if(!domain)throw new BadRequestException({code:'SENDER_DOMAIN_NOT_CONFIGURED',message:'Configura el dominio del remitente antes del envío.'});
  const report=await this.domains.check({tenantId,userId:'campaign-preflight',headers:{}},domain.id);
  if(report.errors.length||!report.result.ownership||!report.result.spf||!report.result.dkim||!report.result.dmarc||!report.result.identity)throw new BadRequestException({code:'DNS_NOT_READY',message:'Falta verificar SPF, DKIM, DMARC, propiedad o identidad SES antes del envío.'});
  const fresh=await this.db.$transaction(tx=>this.capture(tx,tenantId,snapshot.campaign.id),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  const variant={subjectVariant:fresh.campaign.subjectVariant,variantPercent:fresh.campaign.variantPercent};
  const current=campaignSnapshot(tenantId,snapshot.campaign.id,fresh.campaign.subject,fresh.campaign.preheader,fresh.campaign.document,fresh.listIds,fresh.contacts.map(contact=>contact.id),undefined,variant);
  const confirmedSnapshot=scheduledAt?campaignSnapshot(tenantId,snapshot.campaign.id,fresh.campaign.subject,fresh.campaign.preheader,fresh.campaign.document,fresh.listIds,fresh.contacts.map(contact=>contact.id),scheduledAt,variant):current;
  if(!verifyCampaignConfirmation(token,confirmedSnapshot,tenantId,snapshot.campaign.id,await this.vault.masterKey()))throw new ConflictException({code:'CAMPAIGN_REVIEW_EXPIRED',message:'La confirmación caducó o la campaña cambió. Revisa y confirma de nuevo.'});
 }

 private async enqueuePending(tenantId:string,campaignId?:string){
  const records=await this.db.emailDispatch.findMany({where:{tenantId,provider:'ses',status:'pending',...(campaignId?{campaignId}:{})},take:500,orderBy:{id:'asc'},select:{id:true,campaignId:true}});
  for(const record of records){const jobId='dispatch-'+record.id;const existing=await this.queue.getJob(jobId);if(existing&&['failed','completed'].includes(await existing.getState()))await existing.remove();await this.queue.add('send',{tenantId,dispatchId:record.id},{jobId,attempts:1,removeOnComplete:{age:604800},removeOnFail:{age:604800}});}
 }
 private async reconcile(){if(this.reconciling)return;this.reconciling=true;try{const stale=new Date(Date.now()-180000);await this.db.emailDispatch.updateMany({where:{provider:'ses',status:'preparing',updatedAt:{lt:stale}},data:{status:'pending'}});await this.db.emailDispatch.updateMany({where:{provider:'ses',status:'submitting',updatedAt:{lt:stale}},data:{status:'uncertain'}});const due=await this.db.campaign.findMany({where:{status:'scheduled',scheduledAt:{lte:new Date()}},select:{tenantId:true,id:true},take:50});for(const campaign of due)await this.activateScheduled(campaign.tenantId,campaign.id);const campaigns=await this.db.campaign.findMany({where:{status:'sending'},select:{tenantId:true,id:true},take:100});for(const campaign of campaigns){await this.enqueuePending(campaign.tenantId,campaign.id);await this.finishCampaign(campaign.tenantId,campaign.id);}}finally{this.reconciling=false;}}

 private async activateScheduled(tenantId:string,campaignId:string){try{const settings=await this.ses.settings(tenantId);await this.ses.validateWebhook(tenantId);const account=await this.db.emailProviderAccount.findUnique({where:{tenantId_provider:{tenantId,provider:'ses'}},select:{webhookVerifiedAt:true}});const failed=await this.db.providerWebhookEvent.findFirst({where:{tenantId,provider:'ses',status:'failed'},select:{id:true}});if(!account?.webhookVerifiedAt||failed||!await this.senderReady(tenantId,settings.fromEmail))throw new Error('SCHEDULED_PREREQUISITES_FAILED');await this.db.$transaction(async tx=>{const campaign=await tx.campaign.findFirst({where:{tenantId,id:campaignId,status:'scheduled',scheduledAt:{lte:new Date()}},select:{id:true}});if(!campaign)return;const pending=await tx.emailDispatch.updateMany({where:{tenantId,campaignId,status:'scheduled'},data:{status:'pending'}});if(!pending.count)throw new Error('SCHEDULED_DISPATCHES_MISSING');const changed=await tx.campaign.updateMany({where:{tenantId,id:campaignId,status:'scheduled'},data:{status:'sending'}});if(!changed.count)throw new Error('SCHEDULED_CAMPAIGN_TRANSITION_FAILED');},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});await this.enqueuePending(tenantId,campaignId);}catch{await this.db.$transaction(async tx=>{const changed=await tx.campaign.updateMany({where:{tenantId,id:campaignId,status:'scheduled',scheduledAt:{lte:new Date()}},data:{status:'failed'}});if(changed.count)await tx.emailDispatch.updateMany({where:{tenantId,campaignId,status:'scheduled'},data:{status:'failed'}});});}}

 private async senderReady(tenantId:string,fromEmail:string){
  const host=fromEmail.split('@')[1]??'',cacheKey=tenantId+':'+host,cached=this.dnsCache.get(cacheKey);
  if(cached&&Date.now()-cached.checkedAt<60000)return cached.ready;
  await this.ses.validateWebhook(tenantId);
  const domain=await this.db.domain.findUnique({where:{tenantId_hostname:{tenantId,hostname:host}}});if(!domain)return false;
  const report=await this.domains.check({tenantId,userId:'campaign-worker',headers:{}},domain.id);
  const ready=!report.errors.length&&report.result.ownership&&report.result.spf&&report.result.dkim&&report.result.dmarc&&report.result.identity;
  this.dnsCache.set(cacheKey,{checkedAt:Date.now(),ready});return ready;
 }

 private async process(job:Job<DispatchJob>){
  const {tenantId,dispatchId:id}=job.data;
  const record=await this.db.emailDispatch.findFirst({where:{tenantId,id,provider:'ses'}});if(!record||record.status!=='pending')return;
  const claim=await this.db.emailDispatch.updateMany({where:{tenantId,id,provider:'ses',status:'pending'},data:{status:'preparing'}});if(!claim.count)return;
  let submitting=false;
  try{
   if(!record.recipient||!record.fromEmail||!record.subject)throw new Error('DISPATCH_SNAPSHOT_INVALID');
   const [settings,campaign,contact]=await Promise.all([
    this.ses.settings(tenantId),
    this.db.campaign.findUnique({where:{tenantId_id:{tenantId,id:record.campaignId}}}),
    this.db.contact.findUnique({where:{tenantId_id:{tenantId,id:record.contactId}}})
   ]);
   if(!campaign||campaign.status!=='sending')throw new Error('CAMPAIGN_NOT_SENDING');
   if(!contact||contact.email!==record.recipient||contact.archivedAt||contact.status!=='subscribed'||!consented(contact.attributes))throw new Error('RECIPIENT_SUPPRESSED');
   const member=await this.db.campaignAudience.count({where:{tenantId,campaignId:record.campaignId,list:{memberships:{some:{tenantId,contactId:contact.id}}}}});
   if(!member)throw new Error('RECIPIENT_LEFT_AUDIENCE');
   if(settings.fromEmail!==record.fromEmail)throw new Error('SENDER_SETTINGS_CHANGED');
   if(!await this.senderReady(tenantId,record.fromEmail))throw new Error('DNS_NOT_READY');
   const document=plainToInstance(EmailDocumentDto,campaign.document);
   if(validateSync(document,{whitelist:true,forbidNonWhitelisted:true}).length)throw new Error('CAMPAIGN_DESIGN_INVALID');
   const unsubscribeUrl=settings.publicBaseUrl+'/unsubscribe/'+signUnsubscribe(tenantId,contact.id,await this.vault.masterKey());
   const mirrorUrl=settings.publicBaseUrl+'/email-view/'+signEmailView(tenantId,id,await this.vault.masterKey());
   const replace=(value:string)=>value.replace(/\{\{contact\.first_name\}\}/g,()=>contact.firstName).replace(/\{\{contact\.email\}\}/g,()=>contact.email);
   const blocks=(document.blocks as EmailBlock[]).map(block=>({...block,content:replace(block.content)}));
   const html=compileEmail({subject:replace(record.subject),preheader:replace(campaign.preheader),blocks,...(document.html?{html:document.html}:{})},{firstName:contact.firstName,email:contact.email}).replaceAll('{{unsubscribe_url}}',unsubscribeUrl.replace(/&/g,'&amp;')).replaceAll('{{mirror_url}}',mirrorUrl.replace(/&/g,'&amp;'));
   const transitioned=await this.db.emailDispatch.updateMany({where:{tenantId,id,status:'preparing'},data:{status:'submitting',html}});if(!transitioned.count)return;submitting=true;
   const result=await this.ses.send(tenantId,{recipient:record.recipient,fromEmail:settings.fromEmail,fromName:settings.fromName,subject:record.subject,html,text:replace(record.subject)+'\n\nPara cancelar tu suscripción: '+unsubscribeUrl,unsubscribeUrl,dispatchId:id});
   if(!result.providerMessageId){await this.db.emailDispatch.updateMany({where:{tenantId,id,status:'submitting'},data:{status:'uncertain'}});return;}
   await this.db.emailDispatch.updateMany({where:{tenantId,id,status:'submitting'},data:{status:'accepted',providerId:result.providerMessageId}});
  }catch(error:unknown){
   const code=error instanceof Error?error.message:'';
   const providerCode=error&&typeof error==='object'&&'code' in error?String(error.code):'';
   const known=['RECIPIENT_SUPPRESSED','RECIPIENT_LEFT_AUDIENCE','CAMPAIGN_NOT_SENDING','SENDER_SETTINGS_CHANGED','DNS_NOT_READY','DISPATCH_SNAPSHOT_INVALID','CAMPAIGN_DESIGN_INVALID'];
   const status=submitting?(providerCode==='EAUTH'||providerCode==='EREJECTED'?'failed':'uncertain'):'failed';
   await this.db.emailDispatch.updateMany({where:{tenantId,id,status:{in:['preparing','submitting']}},data:{status}});
   if(known.includes(code))this.dnsCache.delete(tenantId+':'+(record.fromEmail?.split('@')[1]??''));
  }finally{await this.finishCampaign(tenantId,record.campaignId);}
 }

 private async finishCampaign(tenantId:string,campaignId:string){
  const open=await this.db.emailDispatch.count({where:{tenantId,campaignId,status:{in:['pending','preparing','submitting']}}});if(open)return;
  const failures=await this.db.emailDispatch.count({where:{tenantId,campaignId,status:{in:['failed','uncertain']}}});
  await this.db.campaign.updateMany({where:{tenantId,id:campaignId,status:'sending'},data:{status:failures?'failed':'sent'}});
 }
}
