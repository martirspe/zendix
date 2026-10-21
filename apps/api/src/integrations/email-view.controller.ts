import {Controller,Get,Inject,Param,Res,NotFoundException} from '@nestjs/common';
import {createHmac,timingSafeEqual} from 'node:crypto';
import type {FastifyReply} from 'fastify';
import {SecretVault} from './secret-vault';
import {Database} from '../database';
export function signEmailView(tenantId:string,messageId:string,key:Buffer):string {const payload=Buffer.from(JSON.stringify({tenantId,messageId})).toString('base64url');return payload+'.'+createHmac('sha256',key).update('email-view:'+payload).digest('base64url');}
export function verifyEmailView(token:string,key:Buffer):{tenantId:string;messageId:string}{
 const [payload,signature,...extra]=token.split('.');if(!payload||!signature||extra.length||token.length>1024)throw new Error('Invalid token');
 const expected=createHmac('sha256',key).update('email-view:'+payload).digest(),actual=Buffer.from(signature,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid token');
 const parsed=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as {tenantId?:unknown;messageId?:unknown};if(typeof parsed.tenantId!=='string'||typeof parsed.messageId!=='string')throw new Error('Invalid token');return {tenantId:parsed.tenantId,messageId:parsed.messageId};
}
@Controller('email-view')
export class EmailViewController {
 constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(Database) private readonly db:Database){}
 @Get(':token') async view(@Param('token') token:string,@Res() reply:FastifyReply){
  let identity:{tenantId:string;messageId:string};try{identity=verifyEmailView(token,await this.vault.masterKey());}catch{throw new NotFoundException('El enlace del correo no es válido.');}
  const message=await this.db.testEmail.findUnique({where:{tenantId_id:{tenantId:identity.tenantId,id:identity.messageId}}});if(!message)throw new NotFoundException('El correo ya no está disponible.');
  return reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('X-Robots-Tag','noindex, nofollow, noarchive').header('X-Frame-Options','DENY').header('Content-Security-Policy',"sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'").type('text/html; charset=utf-8').send(message.html);
 }
}
