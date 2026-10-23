import {Injectable,ServiceUnavailableException} from '@nestjs/common';
import {readFileSync} from 'node:fs';

@Injectable()
export class AuthEmailService {
 private readonly apiUrl='https://api.mailchannels.net/tx/v1/send';
 private apiKey():string{
  const path=process.env['AUTH_EMAIL_API_KEY_FILE'];
  if(path){try{return readFileSync(path,'utf8').trim();}catch{return '';}}
  return process.env['NODE_ENV']==='production'?'':process.env['AUTH_EMAIL_API_KEY']?.trim()??'';
 }
 get enabled():boolean{return Boolean(this.apiKey()&&process.env['AUTH_EMAIL_FROM_EMAIL']?.trim());}
 async sendCode(email:string,purpose:'login'|'verification'|'password-reset',code:string):Promise<void>{
  const apiKey=this.apiKey(),fromEmail=process.env['AUTH_EMAIL_FROM_EMAIL']?.trim(),fromName=process.env['AUTH_EMAIL_FROM_NAME']?.trim()||'MailCraft';
  if(!apiKey||!fromEmail)throw new ServiceUnavailableException({code:'AUTH_EMAIL_NOT_CONFIGURED',message:'El correo de acceso no está configurado. Contacta con el administrador de MailCraft.'});
  const labels={login:{subject:'Tu código de acceso a MailCraft',intro:'Usa este código para iniciar sesión.'},verification:{subject:'Verifica tu correo de MailCraft',intro:'Confirma tu dirección de correo para activar tu cuenta.'},'password-reset':{subject:'Restablece tu contraseña de MailCraft',intro:'Usa este código para elegir una nueva contraseña.'}};
  const copy=labels[purpose];
  try{
   const response=await fetch(this.apiUrl,{method:'POST',headers:{'content-type':'application/json','X-Api-Key':apiKey},signal:AbortSignal.timeout(20000),redirect:'error',body:JSON.stringify({personalizations:[{to:[{email}]}],from:{email:fromEmail,name:fromName},subject:copy.subject,content:[{type:'text/plain',value:copy.intro+' Código: '+code+'. Vence en 10 minutos. Si no solicitaste este mensaje, puedes ignorarlo.'},{type:'text/html',value:'<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:520px;margin:0 auto;padding:32px"><p style="color:#64748b;font-size:12px;font-weight:bold;letter-spacing:1px">MAILCRAFT</p><h1 style="font-size:24px">'+copy.subject+'</h1><p>'+copy.intro+'</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 20px;background:#f7f8fa;border-radius:8px">'+code+'</p><p style="color:#64748b;font-size:13px">Este código vence en 10 minutos. Si no solicitaste este mensaje, puedes ignorarlo.</p></div>'}]})});
   if(!response.ok)throw new Error('Provider rejected the authentication email');
  }catch{
   throw new ServiceUnavailableException({code:'AUTH_EMAIL_DELIVERY_FAILED',message:'No pudimos enviar el correo de acceso. Intenta más tarde o usa tu contraseña.'});
  }
 }
}
