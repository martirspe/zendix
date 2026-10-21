import {Controller,Get,Inject,NotFoundException,Param,Req,UseGuards} from '@nestjs/common';
import {Database} from './database';
import {TenantGuard,TenantRequest} from './tenant.guard';
import {SecretVault} from './integrations/secret-vault';
import type {SmtpSettings} from './integrations/mailchannels-smtp';

@Controller('campaign-review') @UseGuards(TenantGuard)
export class CampaignReviewController {
 constructor(@Inject(Database) private readonly db:Database,@Inject(SecretVault) private readonly vault:SecretVault){}
 @Get(':id') async review(@Req() request:TenantRequest,@Param('id') id:string){
  const tenantId=request.tenantId;
  const campaign=await this.db.campaign.findUnique({where:{tenantId_id:{tenantId,id}}});
  if(!campaign)throw new NotFoundException();
  const smtp=await this.vault.load<SmtpSettings>(tenantId,'mailchannels');
  const host=smtp?.fromEmail.split('@')[1];
  const [domain,eligibleContacts,previewContact,acceptedPreview]=await Promise.all([
   host?this.db.domain.findUnique({where:{tenantId_hostname:{tenantId,hostname:host}}}):null,
   this.db.contact.count({where:{tenantId,archivedAt:null,status:'subscribed'}}),
   smtp?this.db.contact.findUnique({where:{tenantId_email:{tenantId,email:smtp.testRecipient}}}):null,
   this.db.testEmail.findFirst({where:{tenantId,campaignId:id,status:'accepted'},orderBy:{createdAt:'desc'},select:{updatedAt:true}})
  ]);
  const document=campaign.document as {html?:string;blocks?:unknown[]};
  const attributes=previewContact?.attributes;
  const previewConsented=Boolean(attributes&&typeof attributes==='object'&&!Array.isArray(attributes)&&attributes['consent']);
  const checks=[
   {code:'subject',label:'Asunto de la campaña',ready:Boolean(campaign.subject.trim()&&!/[\r\n]/.test(campaign.subject)),action:'Editor visual'},
   {code:'design',label:'Diseño guardado',ready:Boolean(document.html?.trim()||document.blocks?.length),action:'Editor visual'},
   {code:'smtp',label:'MailChannels conectado',ready:Boolean(smtp),action:'Conexiones'},
   {code:'sender',label:'DNS del remitente comprobado',ready:Boolean(domain?.checkedAt&&domain.spfVerified&&domain.dkimVerified&&domain.dmarcVerified&&domain.lockdownVerified),action:'Dominios'},
   {code:'recipient',label:'Destinatario de prueba activo y suscrito',ready:Boolean(previewContact?.status==='subscribed'&&!previewContact.archivedAt&&previewConsented),action:'Contactos'},
   {code:'preview',label:'Prueba aceptada por SMTP',ready:Boolean(acceptedPreview),action:'Editor visual'}
  ];
  return {campaignId:id,checks,eligibleContacts,fromEmail:smtp?.fromEmail??'',testRecipient:smtp?.testRecipient??'',publicBaseUrl:smtp?.publicBaseUrl??'',previewReady:checks.filter(check=>check.code!=='preview').every(check=>check.ready),commercialSendingEnabled:false,blockingReasons:['La recepción autenticada de eventos del proveedor y la gestión de rebotes y quejas deben completarse antes de habilitar campañas comerciales.','La selección de audiencia y la confirmación del envío comercial todavía no están implementadas.'],dnsNote:'El estado DNS corresponde a la última comprobación. Se verifica de nuevo antes de cada prueba.',previewNote:'La aceptación SMTP no confirma la entrega en la bandeja ni que la prueba corresponda a la última edición del diseño.'};
 }
}
