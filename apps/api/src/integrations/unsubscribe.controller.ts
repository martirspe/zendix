import { Controller, Get, Inject, Param, Post, Res, BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { SecretVault } from './secret-vault';
import { Database } from '../database';

export function signUnsubscribe(tenantId:string,contactId:string,key:Buffer):string {
  const payload=Buffer.from(JSON.stringify({tenantId,contactId})).toString('base64url');
  return payload+'.'+createHmac('sha256',key).update('unsubscribe:'+payload).digest('base64url');
}
export function verifyUnsubscribe(token:string,key:Buffer):{tenantId:string;contactId:string} {
  const [payload,signature,...extra]=token.split('.');
  if(!payload||!signature||extra.length||token.length>1024)throw new Error('Invalid token');
  const expected=createHmac('sha256',key).update('unsubscribe:'+payload).digest();
  const actual=Buffer.from(signature,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid token');
  const parsed=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as {tenantId?:unknown;contactId?:unknown};
  if(typeof parsed.tenantId!=='string'||typeof parsed.contactId!=='string')throw new Error('Invalid token');
  return {tenantId:parsed.tenantId,contactId:parsed.contactId};
}

@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(Database) private readonly db:Database){}
  private async identity(token:string){try{return verifyUnsubscribe(token,await this.vault.masterKey());}catch{throw new BadRequestException('Enlace de baja inválido.');}}
  @Get(':token')
  async confirm(@Param('token') token:string,@Res() reply:FastifyReply){
    await this.identity(token);
    return reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').type('text/html; charset=utf-8').send('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><title>Cancelar suscripción</title><body style="font-family:Arial;max-width:480px;margin:80px auto;padding:24px"><h1>Tu bandeja, tus decisiones</h1><p>Confirma si quieres dejar de recibir comunicaciones de este remitente.</p><form method="post"><button style="background:#c8f542;padding:16px;border:0;border-radius:6px">Cancelar mi suscripción</button></form></body></html>');
  }
  @Post(':token')
  async unsubscribe(@Param('token') token:string,@Res() reply:FastifyReply){
    const identity=await this.identity(token);
    await this.db.contact.updateMany({where:{tenantId:identity.tenantId,id:identity.contactId,status:{in:['subscribed','unsubscribed']}},data:{status:'unsubscribed'}});
    return reply.header('Cache-Control','no-store').type('text/html; charset=utf-8').send('<!doctype html><html lang="es"><title>Suscripción cancelada</title><body style="font-family:Arial;padding:40px"><h1>Tu baja quedó registrada</h1><p>No recibirás nuevas comunicaciones de este remitente.</p></body></html>');
  }
}
