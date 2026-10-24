import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { GetAccountCommand, GetConfigurationSetEventDestinationsCommand, GetEmailIdentityCommand, SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ListSubscriptionsByTopicCommand, SNSClient } from '@aws-sdk/client-sns';
import { Database } from '../database';
import { SecretVault } from './secret-vault';

export interface SesSettings { region:string; configurationSet:string; fromEmail:string; fromName:string; testRecipient:string; publicBaseUrl:string; }
export interface SesMessage { recipient:string; fromEmail:string; fromName:string; subject:string; html:string; text:string; unsubscribeUrl:string; dispatchId:string; }

@Injectable()
export class SesEmail {
  constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(Database) private readonly db:Database){}
  async settings(tenantId:string):Promise<SesSettings>{
    const settings=await this.vault.load<SesSettings>(tenantId,'ses');
    if(!settings)throw new BadRequestException({code:'SES_NOT_CONFIGURED',message:'Conecta Amazon SES desde Conexiones.'});
    return settings;
  }
  assertRecipient(settings:SesSettings,recipient:string):void{
    if(recipient.toLowerCase()!==settings.testRecipient.toLowerCase())throw new BadRequestException({code:'TEST_RECIPIENT_NOT_ALLOWED',message:'La prueba solo puede enviarse al destinatario autorizado en la conexión de SES.'});
  }
  private clients(region:string){return {ses:new SESv2Client({region,maxAttempts:1}),sns:new SNSClient({region,maxAttempts:1})};}
  private topicArn(region:string):string{
    const arn=process.env['SES_EVENTS_TOPIC_ARN']?.trim()??'';
    if(!new RegExp('^arn:aws[a-z-]*:sns:'+region+':[0-9]{12}:[A-Za-z0-9_-]+$').test(arn))throw new BadRequestException({code:'SES_EVENTS_NOT_CONFIGURED',message:'Configura un tema SNS de eventos de SES en la misma región.'});
    return arn;
  }
  async validateWebhook(tenantId:string,provided?:SesSettings){
    const settings=provided??await this.settings(tenantId);
    const topicArn=this.topicArn(settings.region),{ses,sns}=this.clients(settings.region);
    try{
      const [identity,account,destinations,subscriptions]=await Promise.all([
        ses.send(new GetEmailIdentityCommand({EmailIdentity:settings.fromEmail.split('@')[1]})),
        ses.send(new GetAccountCommand({})),
        ses.send(new GetConfigurationSetEventDestinationsCommand({ConfigurationSetName:settings.configurationSet})),
        sns.send(new ListSubscriptionsByTopicCommand({TopicArn:topicArn}))
      ]);
      if(identity.DkimAttributes?.Tokens?.length!==3||!identity.MailFromAttributes?.MailFromDomain||!account.ProductionAccessEnabled||!account.SendingEnabled)throw new Error('SES_IDENTITY_NOT_READY');
      if(!['BOUNCE','COMPLAINT'].every(reason=>account.SuppressionAttributes?.SuppressedReasons?.includes(reason as never)))throw new Error('SES_SUPPRESSION_NOT_READY');
      const events=['SEND','DELIVERY','BOUNCE','COMPLAINT','REJECT','OPEN','CLICK'];
      if(!destinations.EventDestinations?.some(destination=>destination.Enabled&&destination.SnsDestination?.TopicArn===topicArn&&events.every(event=>destination.MatchingEventTypes?.includes(event as never))))throw new Error('SES_EVENTS_NOT_READY');
      const endpoint=settings.publicBaseUrl+'/webhooks/ses';
      if(!subscriptions.Subscriptions?.some(subscription=>subscription.Protocol==='https'&&subscription.Endpoint===endpoint&&subscription.SubscriptionArn?.startsWith('arn:')))throw new Error('SES_SUBSCRIPTION_NOT_READY');
      await this.db.emailProviderAccount.updateMany({where:{tenantId,provider:'ses',accountHandle:settings.fromEmail},data:{webhookVerifiedAt:new Date()}});
      return {verified:true};
    }catch(error:unknown){
      if(error instanceof BadRequestException)throw error;
      const code=error instanceof Error&&error.message.startsWith('SES_')?error.message:'SES_VALIDATION_FAILED';
      throw new BadRequestException({code,message:'Verifica la identidad, Easy DKIM, el acceso de producción, la configuración de eventos y la suscripción HTTPS de SNS en AWS.'});
    }finally{ses.destroy();sns.destroy();}
  }
  async connect(tenantId:string,settings:SesSettings){
    const existing=await this.db.emailProviderAccount.findUnique({where:{tenantId_provider:{tenantId,provider:'ses'}}});
    if(existing&&existing.accountHandle!==settings.fromEmail)throw new ConflictException({code:'SES_SENDER_IMMUTABLE',message:'El remitente tiene eventos asociados. Configura una cuenta nueva antes de cambiarlo.'});
    const owner=await this.db.emailProviderAccount.findUnique({where:{provider_accountHandle:{provider:'ses',accountHandle:settings.fromEmail}}});
    if(owner&&owner.tenantId!==tenantId)throw new ConflictException({code:'SES_SENDER_IN_USE',message:'El remitente ya pertenece a otro espacio de trabajo.'});
    await this.db.emailProviderAccount.upsert({where:{tenantId_provider:{tenantId,provider:'ses'}},create:{tenantId,provider:'ses',accountHandle:settings.fromEmail},update:{webhookVerifiedAt:null}});
    await this.validateWebhook(tenantId,settings);
    await this.vault.store(tenantId,'ses',settings);
    return {connected:true,fromEmail:settings.fromEmail,testRecipient:settings.testRecipient,webhookVerified:true};
  }
  async identity(tenantId:string,domain:string){
    const settings=await this.settings(tenantId),client=new SESv2Client({region:settings.region,maxAttempts:1});
    try{return await client.send(new GetEmailIdentityCommand({EmailIdentity:domain}));}
    finally{client.destroy();}
  }
  async send(tenantId:string,message:SesMessage){
    const settings=await this.settings(tenantId),client=new SESv2Client({region:settings.region,maxAttempts:1});
    const headers=[{Name:'List-Unsubscribe',Value:'<'+message.unsubscribeUrl+'>'},{Name:'X-MailCraft-Dispatch-Id',Value:message.dispatchId}];
    if(settings.publicBaseUrl.startsWith('https://'))headers.push({Name:'List-Unsubscribe-Post',Value:'List-Unsubscribe=One-Click'});
    try{
      const displayName='=?UTF-8?B?'+Buffer.from(settings.fromName).toString('base64')+'?=';
      const response=await client.send(new SendEmailCommand({FromEmailAddress:`${displayName} <${message.fromEmail}>`,Destination:{ToAddresses:[message.recipient]},ConfigurationSetName:settings.configurationSet,EmailTags:[{Name:'mailcraft_tenant',Value:tenantId},{Name:'mailcraft_dispatch',Value:message.dispatchId}],Content:{Simple:{Subject:{Data:message.subject,Charset:'UTF-8'},Body:{Text:{Data:message.text,Charset:'UTF-8'},Html:{Data:message.html,Charset:'UTF-8'}},Headers:headers}}}));
      return {accepted:true,providerMessageId:response.MessageId??null};
    }catch(error:unknown){
      const name=error instanceof Error?error.name:'';
      throw Object.assign(new Error('SES_SEND_FAILED'),{code:['MessageRejected','BadRequestException','NotFoundException'].includes(name)?'EREJECTED':name==='AccessDeniedException'?'EAUTH':'ECONNECTION'});
    }finally{client.destroy();}
  }
}
