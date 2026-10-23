import {Controller,Get,Inject,Param,Res,NotFoundException} from '@nestjs/common';
import {createHmac,timingSafeEqual} from 'node:crypto';
import type {FastifyReply} from 'fastify';
import {SecretVault} from './secret-vault';
import {Database} from '../database';
function compactUuid(value:string):string {if(!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value))throw new Error('Invalid identifier');return Buffer.from(value.replaceAll('-',''),'hex').toString('base64url');}
function expandUuid(value:string):string {if(!/^[A-Za-z0-9_-]{22}$/.test(value))throw new Error('Invalid identifier');const hex=Buffer.from(value,'base64url').toString('hex');if(hex.length!==32)throw new Error('Invalid identifier');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);}
export function signEmailView(tenantId:string,messageId:string,key:Buffer):string {const identity=compactUuid(tenantId)+'.'+compactUuid(messageId);const signature=createHmac('sha256',key).update('email-view:'+identity).digest('base64url');return identity+'.'+signature;}
@Controller('email-view')
export class EmailViewController {
 constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(Database) private readonly db:Database){}
 @Get(':token') async view(@Param('token') token:string,@Res() reply:FastifyReply){
  const match=/^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);if(!match)throw new NotFoundException('El enlace del correo no es válido.');
  let tenantId:string,messageId:string;try{tenantId=expandUuid(match[1]??'');messageId=expandUuid(match[2]??'');}catch{throw new NotFoundException('El enlace del correo no es válido.');}
  const expected=createHmac('sha256',await this.vault.masterKey()).update('email-view:'+match[1]+'.'+match[2]).digest(),actual=Buffer.from(match[3]??'','base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new NotFoundException('El enlace del correo no es válido.');
  const preview=await this.db.testEmail.findUnique({where:{tenantId_id:{tenantId,id:messageId}},select:{html:true}});
  const dispatch=preview?null:await this.db.emailDispatch.findUnique({where:{tenantId_id:{tenantId,id:messageId}},select:{html:true}});
  const html=preview?.html??dispatch?.html;if(!html)throw new NotFoundException('El correo ya no está disponible.');
  return reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('X-Robots-Tag','noindex, nofollow, noarchive').header('X-Frame-Options','DENY').header('Content-Security-Policy',"sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'").type('text/html; charset=utf-8').send(html);
 }
}
