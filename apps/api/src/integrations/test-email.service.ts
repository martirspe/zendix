import {signEmailView} from './email-view.controller';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Database } from '../database';
import { SecretVault } from './secret-vault';
import { MailchannelsSmtp } from './mailchannels-smtp';
import { DomainsController } from '../domains.controller';
import { EmailDocumentDto } from '../email-document.dto';
import { compileEmail, EmailBlock } from '../../../../packages/email/src/compiler';
import { signUnsubscribe } from './unsubscribe.controller';
import { smtpFailure } from './delivery-state';

interface TestJob {tenantId:string;testEmailId:string;}
const statuses=['queued','preparing','submitting','accepted','failed','uncertain','cancelled'] as const;
export type TestStatus=typeof statuses[number];

/** A stalled submission is never replayed: SMTP cannot guarantee idempotency after DATA. */
export function recoveryStatus(status:string):TestStatus {return status==='submitting'?'uncertain':status==='preparing'?'queued':status as TestStatus;}

@Injectable()
export class TestEmailService implements OnModuleInit,OnModuleDestroy {
  private queue!:Queue<TestJob>;
  private worker!:Worker<TestJob>;
  private timer?:ReturnType<typeof setInterval>;
  private reconciling=false;
  constructor(@Inject(Database) private readonly db:Database,@Inject(SecretVault) private readonly vault:SecretVault,@Inject(MailchannelsSmtp) private readonly smtp:MailchannelsSmtp,@Inject(DomainsController) private readonly domains:DomainsController){}

  onModuleInit(){
    const url=new URL(process.env['REDIS_URL']??'redis://redis:6379');
    const connection={host:url.hostname,port:Number(url.port||6379),password:url.password||undefined,maxRetriesPerRequest:null};
    this.queue=new Queue<TestJob>('mailcraft-test-emails',{connection});
    this.worker=new Worker<TestJob>('mailcraft-test-emails',job=>this.process(job),{connection,concurrency:1,lockDuration:120000});
    this.worker.on('error',()=>undefined);
    this.worker.on('failed',()=>undefined);
    this.queue.on('error',()=>undefined);
    this.timer=setInterval(()=>{void this.reconcile().catch(()=>undefined);},5000);
    this.timer.unref();
    void this.reconcile().catch(()=>undefined);
  }
  async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.worker?.close();await this.queue?.close();}

  async request(tenantId:string,campaignId:string,recipient:string,idempotencyKey:string){
    const settings=await this.smtp.settings(tenantId);this.smtp.assertRecipient(settings,recipient);
    const campaign=await this.db.campaign.findUnique({where:{tenantId_id:{tenantId,id:campaignId}}});
    if(!campaign)throw new NotFoundException();
    const document=plainToInstance(EmailDocumentDto,campaign.document);
    if(validateSync(document,{whitelist:true,forbidNonWhitelisted:true}).length)throw new BadRequestException({code:'INVALID_DESIGN',message:'Guarda de nuevo el diseño antes de enviar una prueba.'});
    const contact=await this.db.contact.findUnique({where:{tenantId_email:{tenantId,email:recipient}}});
    if(!contact||contact.archivedAt||contact.status!=='subscribed'||!contact.attributes||typeof contact.attributes!=='object'||Array.isArray(contact.attributes)||!contact.attributes['consent'])throw new BadRequestException({code:'RECIPIENT_NOT_SUBSCRIBED',message:'Añade el destinatario a tus contactos con consentimiento. No se enviarán pruebas a contactos dados de baja.'});
    if(!campaign.subject.trim()||/[\r\n]/.test(campaign.subject))throw new BadRequestException({code:'SUBJECT_REQUIRED',message:'Guarda un asunto válido antes de enviar la prueba.'});
    const fingerprint=createHash('sha256').update(JSON.stringify({campaignId,recipient,from:settings.fromEmail,subject:campaign.subject,preheader:campaign.preheader,document:campaign.document})).digest('hex');
    const existing=await this.db.testEmail.findUnique({where:{tenantId_idempotencyKey:{tenantId,idempotencyKey}}});
    if(existing){if(existing.fingerprint!==fingerprint)throw new ConflictException({code:'IDEMPOTENCY_CONFLICT',message:'La solicitud ya se usó para otro diseño. Inicia una nueva prueba.'});return this.publicRecord(existing);}
    const messageId=randomUUID(),mirrorUrl=settings.publicBaseUrl+'/email-view/'+signEmailView(tenantId,messageId,await this.vault.masterKey());
    const unsubscribeUrl=settings.publicBaseUrl+'/unsubscribe/'+signUnsubscribe(tenantId,contact.id,await this.vault.masterKey());
    const replace=(value:string)=>value.replace(/\{\{contact\.first_name\}\}/g,()=>contact.firstName).replace(/\{\{contact\.email\}\}/g,()=>contact.email);
    const blocks=(document.blocks as EmailBlock[]).map(block=>({...block,content:replace(block.content)}));
    const html=compileEmail({subject:replace(campaign.subject),preheader:replace(campaign.preheader),blocks,...(document.html?{html:document.html}:{})},{firstName:contact.firstName,email:contact.email}).replaceAll('{{unsubscribe_url}}',unsubscribeUrl.replace(/&/g,'&amp;')).replaceAll('{{mirror_url}}',mirrorUrl.replace(/&/g,'&amp;'));
    const record=await this.db.testEmail.upsert({where:{tenantId_idempotencyKey:{tenantId,idempotencyKey}},create:{id:messageId,tenantId,campaignId,contactId:contact.id,idempotencyKey,fingerprint,recipient,fromEmail:settings.fromEmail,subject:'[PRUEBA] '+replace(campaign.subject),html},update:{}});
    if(record.fingerprint!==fingerprint)throw new ConflictException({code:'IDEMPOTENCY_CONFLICT',message:'La solicitud ya se utilizó.'});
    await this.reconcile().catch(()=>undefined);
    return this.publicRecord(record);
  }

  async list(tenantId:string,campaignId?:string){return (await this.db.testEmail.findMany({where:{tenantId,...(campaignId?{campaignId}:{})},take:20,orderBy:{createdAt:'desc'}})).map(record=>this.publicRecord(record));}
  private publicRecord(record:{id:string;campaignId:string;status:string;recipient:string;fromEmail:string;errorCode:string|null;createdAt:Date;updatedAt:Date;messageId:string|null}){return {id:record.id,campaignId:record.campaignId,status:record.status,recipient:record.recipient,fromEmail:record.fromEmail,errorCode:record.errorCode,messageId:record.messageId,createdAt:record.createdAt,updatedAt:record.updatedAt};}

  private async reconcile(){
    if(this.reconciling)return;this.reconciling=true;
    try{
      const stale=new Date(Date.now()-180000);
      await this.db.testEmail.updateMany({where:{status:'submitting',updatedAt:{lt:stale}},data:{status:'uncertain',errorCode:'SMTP_RESULT_UNKNOWN'}});
      await this.db.testEmail.updateMany({where:{status:'preparing',updatedAt:{lt:stale}},data:{status:'queued'}});
      const pending=await this.db.testEmail.findMany({where:{status:'queued'},take:50,select:{tenantId:true,id:true}});
      for(const record of pending){const id='test-'+record.id;const job=await this.queue.getJob(id);if(job&&['failed','completed'].includes(await job.getState()))await job.remove();await this.queue.add('preview',{tenantId:record.tenantId,testEmailId:record.id},{jobId:id,attempts:1,removeOnComplete:{age:604800},removeOnFail:{age:604800}});}
    }finally{this.reconciling=false;}
  }

  private async process(job:Job<TestJob>){
    const {tenantId,testEmailId:id}=job.data;
    const record=await this.db.testEmail.findUnique({where:{tenantId_id:{tenantId,id}}});if(!record)return;
    if(record.status==='submitting'){await this.db.testEmail.updateMany({where:{tenantId,id,status:'submitting'},data:{status:'uncertain',errorCode:'SMTP_RESULT_UNKNOWN'}});return;}
    const claimed=await this.db.testEmail.updateMany({where:{tenantId,id,status:'queued'},data:{status:'preparing'}});if(!claimed.count)return;
    let submitting=false;
    try{
      const settings=await this.smtp.settings(tenantId);this.smtp.assertRecipient(settings,record.recipient);
      if(settings.fromEmail!==record.fromEmail)throw new Error('SENDER_SETTINGS_CHANGED');
      const host=settings.fromEmail.split('@')[1]??'';
      const domain=await this.db.domain.findUnique({where:{tenantId_hostname:{tenantId,hostname:host}}});if(!domain)throw new Error('SENDER_DOMAIN_NOT_CONFIGURED');
      const report=await this.domains.check({tenantId,userId:'worker',headers:{}},domain.id);
      if(report.errors.length||!report.result.ownership||!report.result.spf||!report.result.dkim||!report.result.dmarc||!report.result.lockdown)throw new Error('DNS_NOT_READY');
      const key=await this.vault.dkim(tenantId,host);
      const published=report.records.dkim.join('').replace(/\s/g,'');
      if(!published.includes('p='+key.publicKey))throw new Error('DKIM_KEY_MISMATCH');
      const current=await this.db.contact.findUnique({where:{tenantId_id:{tenantId,id:record.contactId}}});if(!current||current.archivedAt||current.status!=='subscribed')throw new Error('RECIPIENT_SUPPRESSED');
      const unsubscribeUrl=settings.publicBaseUrl+'/unsubscribe/'+signUnsubscribe(tenantId,current.id,await this.vault.masterKey());
      if(!record.html.includes(unsubscribeUrl))throw new Error('SENDER_SETTINGS_CHANGED');
      const headers:Record<string,string>={'X-AuthUser':'mailcraft/'+tenantId,'List-Unsubscribe':'<'+unsubscribeUrl+'>','X-MailCraft-Mode':'operator-preview'};
      if(settings.publicBaseUrl.startsWith('https://'))headers['List-Unsubscribe-Post']='List-Unsubscribe=One-Click';
      const transport=this.smtp.transport(settings);
      const submission=await this.db.testEmail.updateMany({where:{tenantId,id,status:'preparing'},data:{status:'submitting'}});
      if(!submission.count){transport.close();return;}submitting=true;
      try{
        const result=await transport.sendMail({from:{name:settings.fromName,address:settings.fromEmail},to:record.recipient,subject:record.subject,html:record.html,text:'Correo de prueba de MailCraft. Abre la versión HTML para revisar el diseño. Cancelar suscripción: '+unsubscribeUrl,headers,messageId:'<'+id+'@'+host+'>',dkim:{domainName:host,keySelector:'mailcraft',privateKey:key.privateKey,headerFieldNames:'from:to:subject:date:message-id:mime-version:content-type:content-transfer-encoding:list-unsubscribe:list-unsubscribe-post:x-authuser'}});
        await this.db.testEmail.updateMany({where:{tenantId,id,status:'submitting'},data:{status:result.accepted.length?'accepted':'failed',messageId:result.messageId,errorCode:result.accepted.length?null:'SMTP_RECIPIENT_REJECTED'}});
      }finally{transport.close();}
    }catch(error:unknown){
      const known=['DNS_NOT_READY','DKIM_KEY_MISMATCH','RECIPIENT_SUPPRESSED','SENDER_SETTINGS_CHANGED','SENDER_DOMAIN_NOT_CONFIGURED'];
      const failure=submitting?smtpFailure(error):{status:'failed',code:error instanceof Error&&known.includes(error.message)?error.message:'TEST_PREPARATION_FAILED'};
      await this.db.testEmail.updateMany({where:{tenantId,id,status:{in:['preparing','submitting']}},data:{status:failure.status,errorCode:failure.code}});
    }
  }
}
