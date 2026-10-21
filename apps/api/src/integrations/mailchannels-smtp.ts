import { Injectable, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { SecretVault } from './secret-vault';

export interface SmtpSettings { accountId: string; username: string; password: string; fromEmail: string; fromName: string; testRecipient: string; publicBaseUrl: string; port: number; }
export function smtpTransport(settings: SmtpSettings) {
  return nodemailer.createTransport({host: 'smtp.mailchannels.net', port: settings.port, secure: false, requireTLS: true, tls: {minVersion: 'TLSv1.2', rejectUnauthorized: true}, auth: {user: settings.username, pass: settings.password}, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true});
}

@Injectable()
export class MailchannelsSmtp {
  constructor(@Inject(SecretVault) private readonly vault: SecretVault) {}
  transport(settings:SmtpSettings) { return smtpTransport(settings); }
  async settings(tenantId: string): Promise<SmtpSettings> {
    const settings = await this.vault.load<SmtpSettings>(tenantId, 'mailchannels');
    if (!settings) throw new BadRequestException({code:'SMTP_NOT_CONFIGURED',message:'Conecta MailChannels desde la consola.'});
    return settings;
  }
  async connect(tenantId: string, settings: SmtpSettings) {
    const transport = this.transport(settings);
    try { await transport.verify(); }
    catch(error:unknown) {
      const auth=error&&typeof error==='object'&&'code' in error&&error.code==='EAUTH';
      throw new BadRequestException({code:auth?'SMTP_AUTH_FAILED':'SMTP_CONNECTION_FAILED',message:auth?'MailChannels rechazó las credenciales. Revisa el usuario SMTP y su contraseña.':'No se pudo conectar por SMTP. Revisa la salida al puerto 587 o prueba el 2525.'});
    }
    finally { transport.close(); }
    await this.vault.store(tenantId,'mailchannels',settings);
    return {connected:true,fromEmail:settings.fromEmail,testRecipient:settings.testRecipient};
  }
  assertRecipient(settings: SmtpSettings, recipient: string): void {
    if (recipient.toLowerCase() !== settings.testRecipient.toLowerCase()) throw new ForbiddenException({code:'TEST_RECIPIENT_NOT_ALLOWED',message:'La prueba solo puede enviarse al destinatario autorizado en la conexión SMTP.'});
  }
}
