import {Injectable,ServiceUnavailableException} from '@nestjs/common';
import {SESv2Client,SendEmailCommand} from '@aws-sdk/client-sesv2';
import {fromIni} from '@aws-sdk/credential-providers';

@Injectable()
export class AuthEmailService {
 get enabled():boolean{return Boolean(process.env['AUTH_EMAIL_SES_REGION']?.trim()&&process.env['AUTH_EMAIL_FROM_EMAIL']?.trim()&&process.env['AUTH_EMAIL_SES_CONFIGURATION_SET']?.trim()&&process.env['AUTH_EMAIL_AWS_PROFILE']?.trim());}
 async sendCode(email:string,purpose:'login'|'verification'|'password-reset',code:string):Promise<void>{
  const fromEmail=process.env['AUTH_EMAIL_FROM_EMAIL']?.trim(),fromName=process.env['AUTH_EMAIL_FROM_NAME']?.trim()||'Zendix';
  if(!this.enabled||!fromEmail)throw new ServiceUnavailableException({code:'AUTH_EMAIL_NOT_CONFIGURED',message:'El correo de acceso no está configurado. Contacta con el administrador de Zendix.'});
  const labels={login:{subject:'Tu código de acceso a Zendix',intro:'Usa este código para iniciar sesión.'},verification:{subject:'Verifica tu correo de Zendix',intro:'Confirma tu dirección de correo para activar tu cuenta.'},'password-reset':{subject:'Restablece tu contraseña de Zendix',intro:'Usa este código para elegir una nueva contraseña.'}};
  const copy=labels[purpose];
  try{
   const client=new SESv2Client({region:process.env['AUTH_EMAIL_SES_REGION'],credentials:fromIni({profile:process.env['AUTH_EMAIL_AWS_PROFILE']}),maxAttempts:1});
   try{
    await client.send(new SendEmailCommand({
     FromEmailAddress:`=?UTF-8?B?${Buffer.from(fromName).toString('base64')}?= <${fromEmail}>`,
     Destination:{ToAddresses:[email]},
     ConfigurationSetName:process.env['AUTH_EMAIL_SES_CONFIGURATION_SET'],
     Content:{Simple:{
      Subject:{Data:copy.subject,Charset:'UTF-8'},
      Body:{
       Text:{Data:copy.intro+' Código: '+code+'. Vence en 10 minutos. Si no solicitaste este mensaje, puedes ignorarlo.',Charset:'UTF-8'},
       Html:{Data:'<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:520px;margin:0 auto;padding:32px"><p style="color:#64748b;font-size:12px;font-weight:bold;letter-spacing:1px">ZENDIX</p><h1 style="font-size:24px">'+copy.subject+'</h1><p>'+copy.intro+'</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 20px;background:#f7f8fa;border-radius:8px">'+code+'</p><p style="color:#64748b;font-size:13px">Este código vence en 10 minutos. Si no solicitaste este mensaje, puedes ignorarlo.</p></div>',Charset:'UTF-8'}
      }
     }}
    }));
   }finally{client.destroy();}
  }catch{
   throw new ServiceUnavailableException({code:'AUTH_EMAIL_DELIVERY_FAILED',message:'No pudimos enviar el correo de acceso. Intenta más tarde o usa tu contraseña.'});
  }
 }
}
