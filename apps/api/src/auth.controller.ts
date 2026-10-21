import {Prisma} from '@prisma/client';
import { Body, Controller, ForbiddenException, Get, Inject, Post, Req, Res, UnauthorizedException, ConflictException, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsString, IsUUID, IsOptional, MinLength, MaxLength } from 'class-validator';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Database } from './database';
import { SessionsService, refreshCookie } from './sessions.service';
import { registrationEnabled, publicApplicationOrigin } from './runtime';
class RegistrationDto { @IsOptional() @IsString() @MinLength(2) @MaxLength(100) workspace?:string; @IsEmail() email!:string; @IsString() @MinLength(12) @MaxLength(128) password!:string; }
class LoginDto { @IsEmail() email!:string; @IsString() @MinLength(1) @MaxLength(128) password!:string; @IsOptional() @IsUUID() workspaceId?:string; }
const validation=(expectedType:typeof RegistrationDto|typeof LoginDto)=>new ValidationPipe({expectedType,whitelist:true,forbidNonWhitelisted:true,transform:true});
const deriveKey=(password:string,salt:string):Promise<Buffer>=>new Promise((resolve,reject)=>scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key)));
function setCookie(reply:FastifyReply,value:string,clear=false){reply.header('Set-Cookie','mc_refresh='+value+'; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age='+(clear?'0':'2592000')+(process.env['NODE_ENV']==='production'?'; Secure':''));reply.header('Cache-Control','no-store');}
@Controller('auth')
export class AuthController {
 constructor(@Inject(Database) private readonly db:Database,@Inject(SessionsService) private readonly sessions:SessionsService){}
 @Get('config') config(){const production=process.env['NODE_ENV']==='production';return {production,registrationEnabled:registrationEnabled(),publicBaseUrl:publicApplicationOrigin(),defaults:production?undefined:{fromEmail:process.env['DEV_SENDER_EMAIL']??'',testRecipient:process.env['DEV_TEST_RECIPIENT']??''}};}
 @Post('register') async register(@Body(validation(RegistrationDto)) input:RegistrationDto,@Res({passthrough:true}) reply:FastifyReply){
  if(!registrationEnabled())throw new ForbiddenException('El registro público no está habilitado.');
  const salt=randomBytes(16).toString('hex'),passwordHash=salt+':'+(await deriveKey(input.password,salt)).toString('hex');
  const tenant=await this.db.$transaction(async tx=>{
   if(await tx.user.findFirst({where:{email:input.email.toLowerCase()},select:{id:true}}))throw new ConflictException('No se pudo crear la cuenta con este email. Si ya tienes una cuenta, inicia sesión.');
   return tx.tenant.create({data:{name:input.workspace?.trim() || 'Mi organización',users:{create:{email:input.email.toLowerCase(),passwordHash,role:'owner'}}},include:{users:true}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}).catch((error:unknown)=>{if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2034')throw new ConflictException('Otro registro está en curso. Intenta iniciar sesión o vuelve a intentarlo.');throw error;});
  const user=tenant.users[0];if(!user)throw new ConflictException();
  const session=await this.sessions.create(user.id,tenant.id);setCookie(reply,session.cookie);return session.body;
 }
 @Post('login') async login(@Body(validation(LoginDto)) input:LoginDto,@Res({passthrough:true}) reply:FastifyReply){
  reply.header('Cache-Control','no-store');
  const users=await this.db.user.findMany({where:{email:input.email.toLowerCase(),...(input.workspaceId?{tenantId:input.workspaceId}:{})},take:21,orderBy:{id:'asc'},include:{tenant:{select:{name:true}}}});
  if(users.length>20)throw new UnauthorizedException('No se pudo resolver el acceso. Contacta con el administrador.');
  const matches:typeof users=[];
  for(const user of users){
   const [salt,stored]=user.passwordHash.split(':');
   const candidate=await deriveKey(input.password,salt??''),expected=Buffer.from(stored??'','hex');
   if(candidate.length===expected.length&&timingSafeEqual(candidate,expected))matches.push(user);
  }
  if(!users.length)await deriveKey(input.password,'00000000000000000000000000000000');
  if(!matches.length)throw new UnauthorizedException('El email o la contraseña no son correctos.');
  if(matches.length>1)return {requiresWorkspaceSelection:true,workspaces:matches.map(user=>({id:user.tenantId,name:user.tenant.name}))};
  const user=matches[0];if(!user)throw new UnauthorizedException();
  const session=await this.sessions.create(user.id,user.tenantId);setCookie(reply,session.cookie);return session.body;
 }
 @Post('refresh') async refresh(@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){
  try{const session=await this.sessions.rotate(refreshCookie(request.headers));setCookie(reply,session.cookie);return session.body;}
  catch(error:unknown){const body=error instanceof UnauthorizedException?error.getResponse():null;if(!(body&&typeof body==='object'&&'code' in body&&body.code==='REFRESH_RACE'))setCookie(reply,'',true);throw error;}
 }
 @Post('logout') async logout(@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){await this.sessions.logout(refreshCookie(request.headers));setCookie(reply,'',true);return {loggedOut:true};}
}
