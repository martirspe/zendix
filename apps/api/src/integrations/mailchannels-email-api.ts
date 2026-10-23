import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { SecretVault } from './secret-vault';
import { Database } from '../database';

export interface MailchannelsEmailSettings { apiKey:string; accountId:string; fromEmail:string; fromName:string; testRecipient:string; publicBaseUrl:string; }
export interface MailchannelsMessage { recipient:string; fromEmail:string; fromName:string; subject:string; html:string; text:string; unsubscribeUrl:string; dkimSelector:string; dispatchId:string; }

@Injectable()
export class MailchannelsEmailApi {
  private readonly baseUrl='https://api.mailchannels.net/tx/v1';
  constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(Database) private readonly db:Database){}
  async settings(tenantId:string):Promise<MailchannelsEmailSettings>{
    const settings=await this.vault.load<MailchannelsEmailSettings>(tenantId,'mailchannels-email-api');
    if(!settings)throw new BadRequestException({code:'EMAIL_API_NOT_CONFIGURED',message:'Conecta MailChannels Email API desde Conexiones.'});
    return settings;
  }
  assertRecipient(settings:MailchannelsEmailSettings,recipient:string):void{if(recipient.toLowerCase()!==settings.testRecipient.toLowerCase())throw new BadRequestException({code:'TEST_RECIPIENT_NOT_ALLOWED',message:'La prueba solo puede enviarse al destinatario autorizado en la conexión de MailChannels.'});}
  async connect(tenantId:string,settings:MailchannelsEmailSettings){
    const webhookUrl=settings.publicBaseUrl+'/webhooks/mailchannels';
    const account=await this.db.emailProviderAccount.findUnique({where:{provider_accountHandle:{provider:'mailchannels',accountHandle:settings.accountId}}});
    if(account&&account.tenantId!==tenantId)throw new ConflictException({code:'EMAIL_API_ACCOUNT_IN_USE',message:'Esta cuenta de MailChannels ya está conectada a otro espacio de trabajo.'});
    const existing=await this.db.emailProviderAccount.findUnique({where:{tenantId_provider:{tenantId,provider:'mailchannels'}}});
    if(existing&&existing.accountHandle!==settings.accountId)throw new ConflictException({code:'EMAIL_API_ACCOUNT_IMMUTABLE',message:'Esta cuenta de MailChannels ya tiene eventos asociados. Desconecta primero la cuenta anterior desde la configuración del proveedor.'});
    await this.db.emailProviderAccount.upsert({where:{tenantId_provider:{tenantId,provider:'mailchannels'}},create:{tenantId,provider:'mailchannels',accountHandle:settings.accountId},update:{accountHandle:settings.accountId,webhookVerifiedAt:null}});
    await this.validateWebhook(tenantId,settings);
    await this.vault.store(tenantId,'mailchannels-email-api',settings);
    return {connected:true,fromEmail:settings.fromEmail,testRecipient:settings.testRecipient,webhookVerified:true};
  }
  async validateWebhook(tenantId:string,providedSettings?:MailchannelsEmailSettings){
    const settings=providedSettings??await this.settings(tenantId),webhookUrl=settings.publicBaseUrl+'/webhooks/mailchannels',headers={'X-Api-Key':settings.apiKey};
    const request=async(path:string,init?:RequestInit)=>fetch(this.baseUrl+path,{...init,headers:{...headers,...init?.headers},signal:AbortSignal.timeout(15000),redirect:'error'}).catch(()=>{throw new BadRequestException({code:'EMAIL_API_UNREACHABLE',message:'No se pudo conectar con MailChannels Email API. Revisa la conexión e inténtalo de nuevo.'});});
    const response=await request('/webhook');
    if(response.status===401||response.status===403)throw new BadRequestException({code:'EMAIL_API_AUTH_FAILED',message:'MailChannels rechazó la clave API. Usa una clave con alcance api.'});
    if(!response.ok)throw new BadRequestException({code:'EMAIL_API_CONNECTION_FAILED',message:'MailChannels Email API no pudo validar la conexión.'});
    const hooks=await response.json() as {webhook?:string}[];
    if(hooks.some(hook=>hook.webhook!==webhookUrl))throw new ConflictException({code:'EMAIL_API_WEBHOOK_IN_USE',message:'Esta cuenta ya tiene otro webhook. Cámbialo desde MailChannels antes de conectar MailCraft.'});
    if(!hooks.some(hook=>hook.webhook===webhookUrl)){
      const enroll=await request('/webhook?endpoint='+encodeURIComponent(webhookUrl),{method:'POST'});
      if(!enroll.ok)throw new BadRequestException({code:'EMAIL_API_WEBHOOK_FAILED',message:'MailChannels no pudo registrar el webhook seguro de MailCraft.'});
    }
    const validation=await request('/webhook/validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({request_id:'mailcraft-validation-'+tenantId})});
    if(!validation.ok)throw new BadRequestException({code:'EMAIL_API_WEBHOOK_FAILED',message:'No se pudo validar la recepción HTTPS del webhook de MailCraft.'});
    const validationResult=await validation.json() as {all_passed?:boolean};
    if(validationResult.all_passed!==true)throw new BadRequestException({code:'EMAIL_API_WEBHOOK_FAILED',message:'MailChannels no confirmó la recepción del evento de validación.'});
    await this.db.emailProviderAccount.update({where:{tenantId_provider:{tenantId,provider:'mailchannels'}},data:{webhookVerifiedAt:new Date()}});
    return {verified:true};
  }
  async createDkimKey(tenantId:string,domain:string,selector:string){
    const settings=await this.settings(tenantId);
    const stored=await this.vault.load<{selector:string;publicKey:string}>(tenantId,'mailchannels-dkim:'+domain);
    if(stored?.selector===selector)return stored;
    let response:Response;
    try{response=await fetch(this.baseUrl+'/domains/'+encodeURIComponent(domain)+'/dkim-keys',{method:'POST',headers:{'content-type':'application/json','X-Api-Key':settings.apiKey},signal:AbortSignal.timeout(15000),redirect:'error',body:JSON.stringify({selector,algorithm:'rsa',key_length:2048})});}
    catch{throw new BadRequestException({code:'EMAIL_API_UNREACHABLE',message:'No se pudo configurar DKIM en MailChannels. Revisa la conexión e inténtalo de nuevo.'});}
    if(!response.ok)throw new BadRequestException({code:'EMAIL_API_DKIM_FAILED',message:'MailChannels no pudo crear la clave DKIM administrada para este dominio.'});
    const result=await response.json() as {domain?:string;selector?:string;public_key?:string;status?:string};
    if(result.domain!==domain||result.selector!==selector||result.status!=='active'||!result.public_key||!/^[A-Za-z0-9+/]+={0,2}$/.test(result.public_key))throw new BadRequestException({code:'EMAIL_API_DKIM_INVALID',message:'MailChannels devolvió una clave DKIM incompleta o inesperada.'});
    await this.vault.store(tenantId,'mailchannels-dkim:'+domain,{selector,publicKey:result.public_key});
    return {selector,publicKey:result.public_key};
  }
  async send(tenantId:string,message:MailchannelsMessage){
    const settings=await this.settings(tenantId);
    const providerHeaders:Record<string,string>={'List-Unsubscribe':'<'+message.unsubscribeUrl+'>','X-MailCraft-Dispatch-Id':message.dispatchId};
    if(settings.publicBaseUrl.startsWith('https://'))providerHeaders['List-Unsubscribe-Post']='List-Unsubscribe=One-Click';
    let response:Response;
    try{response=await fetch(this.baseUrl+'/send',{method:'POST',headers:{'content-type':'application/json','X-Api-Key':settings.apiKey},signal:AbortSignal.timeout(30000),redirect:'error',body:JSON.stringify({personalizations:[{to:[{email:message.recipient}],headers:providerHeaders}],from:{email:message.fromEmail,name:message.fromName},subject:message.subject,content:[{type:'text/plain',value:message.text},{type:'text/html',value:message.html}],dkim_selector:message.dkimSelector,tracking_settings:{click_tracking:{enable:true},open_tracking:{enable:true}}})});}
    catch{throw Object.assign(new Error('EMAIL_API_UNREACHABLE'),{code:'ECONNECTION'});}
    if(!response.ok)throw Object.assign(new Error('EMAIL_API_REJECTED'),{code:response.status===401||response.status===403?'EAUTH':'EREJECTED'});
    const responseText=await response.text();
    let responseData:{request_id?:string;requestId?:string}={};
    try{responseData=JSON.parse(responseText) as typeof responseData;}catch{}
    return {accepted:true,providerMessageId:response.headers.get('x-request-id')??response.headers.get('request-id')??responseData.request_id??responseData.requestId??null};
  }
}
