import {BadRequestException,Controller,Get,Inject,NotFoundException,Param,Query,Req,UseGuards} from '@nestjs/common';
import {Database} from './database';
import {TenantGuard,TenantRequest} from './tenant.guard';
import {SecretVault} from './integrations/secret-vault';
import type {MailchannelsEmailSettings} from './integrations/mailchannels-email-api';
import {createHash} from 'node:crypto';
import {campaignSnapshot,signCampaignConfirmation} from './campaign-send-token';
import {hasRecordedConsent} from './consent';

@Controller('campaign-review') @UseGuards(TenantGuard)
export class CampaignReviewController {
 constructor(@Inject(Database) private readonly db:Database,@Inject(SecretVault) private readonly vault:SecretVault){}
 @Get(':id') async review(@Req() request:TenantRequest,@Param('id') id:string,@Query('scheduledAt') scheduledAtValue?:string,@Query('timeZone') timeZone='UTC'){
  const tenantId=request.tenantId;
  const campaign=await this.db.campaign.findUnique({where:{tenantId_id:{tenantId,id}}});
  if(!campaign)throw new NotFoundException();
  const emailApi=await this.vault.load<MailchannelsEmailSettings>(tenantId,'mailchannels-email-api');
  const host=emailApi?.fromEmail.split('@')[1];
  const [domain,previewContact,acceptedPreviews,audiences,providerAccount,failedProviderEvent]=await Promise.all([
   host?this.db.domain.findUnique({where:{tenantId_hostname:{tenantId,hostname:host}}}):null,
   emailApi?this.db.contact.findUnique({where:{tenantId_email:{tenantId,email:emailApi.testRecipient}}}):null,
   this.db.testEmail.findMany({where:{tenantId,campaignId:id,status:'accepted'},orderBy:{createdAt:'desc'},take:100,select:{fingerprint:true,recipient:true,subject:true}}),
   this.db.campaignAudience.findMany({where:{tenantId,campaignId:id},select:{listId:true,list:{select:{name:true}}}}),
   this.db.emailProviderAccount.findUnique({where:{tenantId_provider:{tenantId,provider:'mailchannels'}},select:{webhookVerifiedAt:true}}),
   this.db.providerWebhookEvent.findFirst({where:{tenantId,provider:'mailchannels',status:'failed'},select:{id:true}})
  ]);
  const listIds=audiences.map(item=>item.listId);
  const audienceContacts=listIds.length?await this.db.contact.findMany({where:{tenantId,archivedAt:null,status:'subscribed',memberships:{some:{tenantId,listId:{in:listIds}}}},select:{id:true,attributes:true}}):[];
  const eligibleContactIds=audienceContacts.filter(contact=>hasRecordedConsent(contact.attributes)).map(contact=>contact.id);
  const eligibleContacts=eligibleContactIds.length;
  const document=campaign.document as {html?:string;blocks?:unknown[]};
  const attributes=previewContact?.attributes;
  const previewConsented=Boolean(attributes&&typeof attributes==='object'&&!Array.isArray(attributes)&&attributes['consent']);
  const previewReadyFor=(subject:string,variant:'A'|'B')=>Boolean(emailApi&&acceptedPreviews.some(preview=>preview.recipient===emailApi.testRecipient&&preview.fingerprint===createHash('sha256').update(JSON.stringify({campaignId:id,recipient:emailApi.testRecipient,from:emailApi.fromEmail,variant,subject,preheader:campaign.preheader,document:campaign.document})).digest('hex')));
  const previewsReady=previewReadyFor(campaign.subject,'A')&&(!campaign.subjectVariant||previewReadyFor(campaign.subjectVariant,'B'));
  const checks=[
   {code:'subject',label:'Asunto de la campaña',ready:Boolean(campaign.subject.trim()&&!/[\r\n]/.test(campaign.subject)),action:'Editor visual'},
   {code:'design',label:'Diseño guardado',ready:Boolean(document.html?.trim()||document.blocks?.length),action:'Editor visual'},
   {code:'emailApi',label:'MailChannels Email API conectada',ready:Boolean(emailApi),action:'Conexiones'},
   {code:'sender',label:'DNS del remitente comprobado',ready:Boolean(domain?.checkedAt&&domain.spfVerified&&domain.dkimVerified&&domain.dmarcVerified&&domain.lockdownVerified),action:'Dominios'},
   {code:'audience',label:'Audiencia seleccionada con consentimiento',ready:listIds.length>0&&eligibleContacts>0,action:'Editor visual'},
   {code:'providerEvents',label:'Webhook de MailChannels autenticado y validado',ready:Boolean(providerAccount?.webhookVerifiedAt&&!failedProviderEvent),action:'Conexiones'},
   {code:'sendConfirmation',label:'Confirmación de envío comercial',ready:false,action:'Editor visual'},
   {code:'recipient',label:'Destinatario de prueba activo y suscrito',ready:Boolean(previewContact?.status==='subscribed'&&!previewContact.archivedAt&&previewConsented),action:'Contactos'},
   {code:'preview',label:campaign.subjectVariant?'Pruebas aceptadas para los asuntos A y B actuales':'Prueba aceptada para la versión actual',ready:previewsReady,action:'Editor visual'}
  ];
  let scheduledAt:string|undefined;
  if(scheduledAtValue){const parsed=new Date(scheduledAtValue);if(!Number.isFinite(parsed.getTime())||parsed.getTime()<Date.now()+10*60_000||parsed.getTime()>Date.now()+90*24*60*60_000)throw new BadRequestException({code:'CAMPAIGN_SCHEDULE_INVALID',message:'Programa la campaña entre 10 minutos y 90 días a partir de ahora.'});try{new Intl.DateTimeFormat('es',{timeZone}).format(parsed);}catch{throw new BadRequestException({code:'CAMPAIGN_TIME_ZONE_INVALID',message:'Selecciona una zona horaria válida.'});}scheduledAt=parsed.toISOString();}
  const prerequisites=checks.filter(check=>check.code!=='sendConfirmation');
  const canConfirm=campaign.status==='draft'&&prerequisites.every(check=>check.ready);
  const confirmation=checks.find(check=>check.code==='sendConfirmation');if(confirmation)confirmation.ready=canConfirm;
  const confirmationToken=canConfirm?signCampaignConfirmation(campaignSnapshot(tenantId,id,campaign.subject,campaign.preheader,campaign.document,listIds,eligibleContactIds,scheduledAt,{subjectVariant:campaign.subjectVariant,variantPercent:campaign.variantPercent}),tenantId,id,await this.vault.masterKey()):null;
  const blockingReasons=checks.filter(check=>!check.ready).map(check=>check.code==='providerEvents'?'Conecta MailChannels, valida el webhook firmado y resuelve los eventos fallidos antes de enviar.':check.code==='preview'?'Envía una prueba de la versión actual y comprueba el diseño antes de confirmar.':check.code==='sendConfirmation'?'Esta campaña no está disponible para envío. Revisa los requisitos pendientes.':'Completa: '+check.label+'.');
  return {campaignId:id,checks,eligibleContacts,audiences:audiences.map(item=>({id:item.listId,name:item.list.name})),audienceSelected:listIds.length>0,subject:campaign.subject,subjectVariant:campaign.subjectVariant,variantPercent:campaign.variantPercent,fromEmail:emailApi?.fromEmail??'',testRecipient:emailApi?.testRecipient??'',publicBaseUrl:emailApi?.publicBaseUrl??'',previewReady:checks.filter(check=>['subject','design','emailApi','sender','recipient'].includes(check.code)).every(check=>check.ready),commercialSendingEnabled:canConfirm,confirmationToken,scheduledAt:scheduledAt??null,timeZone,blockingReasons,dnsNote:'El estado DNS se vuelve a comprobar al confirmar y al procesar la cola.',previewNote:campaign.subjectVariant?'Antes de confirmar, envía una prueba aceptada de cada asunto A y B con el diseño actual.':'La prueba debe corresponder exactamente a la versión actual del asunto y diseño.',audienceNote:listIds.length?'Audiencia calculada como contactos activos, suscritos y con consentimiento en las listas elegidas. Los contactos repetidos se cuentan una sola vez.':'Selecciona al menos una lista para calcular la audiencia. Los contactos se deduplican entre listas.'};
 }
}
