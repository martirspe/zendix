import { Controller, Get, Inject, Param, Post, Res, BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { SecretVault } from './secret-vault';
import { Database } from '../database';

function compactUuid(value:string):string {
  if(!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value))throw new Error('Invalid identifier');
  return Buffer.from(value.replaceAll('-',''),'hex').toString('base64url');
}
function expandUuid(value:string):string {
  if(!/^[A-Za-z0-9_-]{22}$/.test(value))throw new Error('Invalid identifier');
  const hex=Buffer.from(value,'base64url').toString('hex');
  if(hex.length!==32)throw new Error('Invalid identifier');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
export function signUnsubscribe(tenantId:string,contactId:string,key:Buffer):string {
  const identity=compactUuid(tenantId)+'.'+compactUuid(contactId);
  const signature=createHmac('sha256',key).update('unsubscribe:'+identity).digest('base64url');
  return identity+'.'+signature;
}

@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(Database) private readonly db:Database){}
  private async identity(token:string){
    try{
      const match=/^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);if(!match)throw new Error('Invalid token');
      const tenantId=expandUuid(match[1]??''),contactId=expandUuid(match[2]??''),signature=match[3]??'';
      const key=await this.vault.masterKey();
      const expected=createHmac('sha256',key).update('unsubscribe:'+match[1]+'.'+match[2]).digest(),actual=Buffer.from(signature,'base64url');
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid signature');
      const contact=await this.db.contact.findUnique({where:{tenantId_id:{tenantId,id:contactId}},select:{tenantId:true,id:true,archivedAt:true,status:true}});
      if(contact&&!contact.archivedAt&&['subscribed','unsubscribed'].includes(contact.status))return {tenantId:contact.tenantId,contactId:contact.id};
    }catch{}
    throw new BadRequestException('Enlace de baja inválido.');
  }
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
