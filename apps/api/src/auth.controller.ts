import {Prisma} from '@prisma/client';
import { Body, Controller, ForbiddenException, Get, Inject, Post, Req, Res, UnauthorizedException, ConflictException, ValidationPipe, ServiceUnavailableException } from '@nestjs/common';
import { IsEmail, IsString, IsUUID, IsOptional, MinLength, MaxLength, IsBoolean, Equals, Matches } from 'class-validator';
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Database } from './database';
import { SessionsService, refreshCookie } from './sessions.service';
import { registrationEnabled, publicApplicationOrigin } from './runtime';
import { AuthEmailService } from './auth-email.service';
import { jwtSecret } from './runtime';
import { RateLimiter } from './rate-limiter';
import {GoogleIdentityService} from './google-identity.service';
class RegistrationDto { @IsOptional() @IsString() @MinLength(2) @MaxLength(100) workspace?:string; @IsString() @MinLength(1) @MaxLength(100) firstName!:string; @IsString() @MinLength(1) @MaxLength(100) lastName!:string; @IsEmail() email!:string; @IsString() @MinLength(12) @MaxLength(128) password!:string; @IsBoolean() @Equals(true) acceptedTerms!:boolean; }
class LoginDto { @IsEmail() email!:string; @IsString() @MinLength(1) @MaxLength(128) password!:string; @IsOptional() @IsUUID() workspaceId?:string; }
class EmailDto { @IsEmail() email!:string; }
class VerifyCodeDto extends EmailDto { @IsString() @Matches(/^\d{6}$/) code!:string; @IsOptional() @IsUUID() workspaceId?:string; }
class ResetPasswordDto extends VerifyCodeDto { @IsString() @MinLength(12) @MaxLength(128) password!:string; }
class GoogleLoginDto { @IsString() @MinLength(20) @MaxLength(16384) idToken!:string; @IsOptional() @IsBoolean() @Equals(true) acceptedTerms?:boolean; @IsOptional() @IsUUID() workspaceId?:string; }
const validation=(expectedType:typeof RegistrationDto|typeof LoginDto|typeof EmailDto|typeof VerifyCodeDto|typeof ResetPasswordDto|typeof GoogleLoginDto)=>new ValidationPipe({expectedType,whitelist:true,forbidNonWhitelisted:true,transform:true});
const deriveKey=(password:string,salt:string):Promise<Buffer>=>new Promise((resolve,reject)=>scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key)));
function setCookie(reply:FastifyReply,value:string,clear=false){reply.header('Set-Cookie','mc_refresh='+value+'; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age='+(clear?'0':'2592000')+(process.env['NODE_ENV']==='production'?'; Secure':''));reply.header('Cache-Control','no-store');}
type AuthPurpose='login'|'verification'|'password-reset';
function normalizeEmail(value:string):string{return value.trim().toLowerCase();}
function codeHash(tenantId:string,email:string,purpose:AuthPurpose,code:string):string{return createHmac('sha256',jwtSecret()).update([tenantId,email,purpose,code].join(':')).digest('hex');}
function codeMatches(tenantId:string,email:string,purpose:AuthPurpose,code:string,expected:string):boolean{const candidate=Buffer.from(codeHash(tenantId,email,purpose,code),'hex'),stored=Buffer.from(expected,'hex');return candidate.length===stored.length&&timingSafeEqual(candidate,stored);}
function emailVerificationRequired():boolean{return process.env['AUTH_REQUIRE_EMAIL_VERIFICATION']==='true'||(process.env['NODE_ENV']==='production'&&process.env['AUTH_REQUIRE_EMAIL_VERIFICATION']!=='false');}
@Controller('auth')
export class AuthController {
 constructor(@Inject(Database) private readonly db:Database,@Inject(SessionsService) private readonly sessions:SessionsService,@Inject(AuthEmailService) private readonly authEmail:AuthEmailService,@Inject(RateLimiter) private readonly limiter:RateLimiter,@Inject(GoogleIdentityService) private readonly google:GoogleIdentityService){}
 @Get('config') config(){const production=process.env['NODE_ENV']==='production';return {production,registrationEnabled:registrationEnabled(),emailCodeEnabled:this.authEmail.enabled,googleAuthEnabled:this.google.enabled,googleClientId:this.google.enabled?this.google.clientId:'',emailVerificationRequired:emailVerificationRequired(),publicBaseUrl:publicApplicationOrigin(),defaults:production?undefined:{fromEmail:process.env['DEV_SENDER_EMAIL']??'',testRecipient:process.env['DEV_TEST_RECIPIENT']??''}};}
 @Post('register') async register(@Body(validation(RegistrationDto)) input:RegistrationDto,@Res({passthrough:true}) reply:FastifyReply){
  if(!registrationEnabled())throw new ForbiddenException('El registro público no está habilitado.');
  if(emailVerificationRequired()&&!this.authEmail.enabled)throw new ServiceUnavailableException({code:'AUTH_EMAIL_NOT_CONFIGURED',message:'El registro requiere correo de verificación. Contacta con el administrador de MailCraft.'});
  const salt=randomBytes(16).toString('hex'),passwordHash=salt+':'+(await deriveKey(input.password,salt)).toString('hex');
  const tenant=await this.db.$transaction(async tx=>{
   return tx.tenant.create({data:{name:input.workspace?.trim() || 'Mi organización',users:{create:{email:normalizeEmail(input.email),firstName:input.firstName.trim(),lastName:input.lastName.trim(),termsAcceptedAt:new Date(),emailVerified:!emailVerificationRequired(),emailVerifiedAt:emailVerificationRequired()?null:new Date(),passwordHash,role:'owner'}}},include:{users:true}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}).catch((error:unknown)=>{if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2034')throw new ConflictException('Otro registro está en curso. Intenta iniciar sesión o vuelve a intentarlo.');throw error;});
  const user=tenant.users[0];if(!user)throw new ConflictException();
  if(emailVerificationRequired()){const code=await this.issueCodes([tenant.id],user.email,'verification');await this.authEmail.sendCode(user.email,'verification',code);return {verificationRequired:true,email:user.email};}
  const session=await this.sessions.create(user.id,tenant.id);setCookie(reply,session.cookie);return session.body;
 }
 @Post('login') async login(@Body(validation(LoginDto)) input:LoginDto,@Res({passthrough:true}) reply:FastifyReply){
  reply.header('Cache-Control','no-store');
  await this.limiter.check('auth-login:'+normalizeEmail(input.email),10,900);
  const users=await this.db.user.findMany({where:{email:input.email.trim().toLowerCase(),...(input.workspaceId?{tenantId:input.workspaceId}:{})},take:21,orderBy:{id:'asc'},include:{tenant:{select:{name:true}}}});
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
  if(!user.emailVerified){if(!this.authEmail.enabled)throw new ServiceUnavailableException({code:'AUTH_EMAIL_NOT_CONFIGURED',message:'Tu correo requiere verificación. Contacta con el administrador de MailCraft.'});const code=await this.issueCodes([user.tenantId],user.email,'verification');await this.authEmail.sendCode(user.email,'verification',code);return {verificationRequired:true,email:user.email};}
  const session=await this.sessions.create(user.id,user.tenantId);setCookie(reply,session.cookie);return session.body;
 }
 @Post('google') async loginWithGoogle(@Body(validation(GoogleLoginDto)) input:GoogleLoginDto,@Res({passthrough:true}) reply:FastifyReply){
  const profile=await this.google.verifyIdToken(input.idToken);
  await this.limiter.check('auth-google:'+profile.email,10,900);
  let users=await this.db.user.findMany({where:{googleSub:profile.sub,...(input.workspaceId?{tenantId:input.workspaceId}:{})},take:21,include:{tenant:{select:{name:true}}}});
  if(users.length>20)throw new UnauthorizedException('No se pudo resolver el acceso. Contacta con el administrador.');
  const matchingEmail=await this.db.user.findMany({where:{email:profile.email,...(input.workspaceId?{tenantId:input.workspaceId}:{})},take:21});
  if(matchingEmail.length>20)throw new UnauthorizedException('No se pudo resolver el acceso. Contacta con el administrador.');
  if(matchingEmail.some(user=>user.googleSub&&user.googleSub!==profile.sub))throw new ConflictException('Este correo está vinculado a otra cuenta de Google.');
  const unlinked=matchingEmail.filter(user=>!user.googleSub);
  if(unlinked.length){const now=new Date();await this.db.$transaction(async tx=>{await tx.user.updateMany({where:{tenantId:{in:unlinked.map(user=>user.tenantId)},email:profile.email,googleSub:null},data:{googleSub:profile.sub,emailVerified:true,emailVerifiedAt:now}});});}
  if(matchingEmail.length){
   users=await this.db.user.findMany({where:{googleSub:profile.sub,...(input.workspaceId?{tenantId:input.workspaceId}:{})},take:21,orderBy:{id:'asc'},include:{tenant:{select:{name:true}}}});
  }else if(!users.length){
   if(input.workspaceId)throw new UnauthorizedException('Esta organización no está vinculada a tu cuenta de Google.');
   if(!registrationEnabled())throw new ForbiddenException({code:'GOOGLE_SIGNUP_REQUIRED',message:'El registro público no está habilitado. Contacta con el administrador de MailCraft.'});
   if(input.acceptedTerms!==true)throw new ConflictException({code:'GOOGLE_SIGNUP_REQUIRED',message:'Crea tu cuenta y acepta los términos para continuar con Google.'});
   const salt=randomBytes(16).toString('hex'),passwordHash=salt+':'+randomBytes(64).toString('hex'),now=new Date();
   const tenant=await this.db.tenant.create({data:{name:'Mi organización',users:{create:{email:profile.email,googleSub:profile.sub,firstName:profile.firstName,lastName:profile.lastName,termsAcceptedAt:now,emailVerified:true,emailVerifiedAt:now,passwordHash,role:'owner'}}},include:{users:true}});
   const user=tenant.users[0];if(!user)throw new UnauthorizedException();const session=await this.sessions.create(user.id,tenant.id);setCookie(reply,session.cookie);return session.body;
  }
  if(!users.length)throw new UnauthorizedException('Esta organización no está vinculada a tu cuenta de Google.');
  if(users.length>1)return {requiresWorkspaceSelection:true,workspaces:users.map(user=>({id:user.tenantId,name:user.tenant.name}))};
  const user=users[0];if(!user)throw new UnauthorizedException();
  if(user.email!==profile.email)throw new ConflictException('El correo de esta cuenta de Google cambió. Contacta con el administrador de MailCraft.');
  if(!user.emailVerified)await this.db.user.update({where:{tenantId_id:{tenantId:user.tenantId,id:user.id}},data:{emailVerified:true,emailVerifiedAt:new Date()}});
  const session=await this.sessions.create(user.id,user.tenantId);setCookie(reply,session.cookie);return session.body;
 }
 @Post('login-code/request') async requestLoginCode(@Body(validation(EmailDto)) input:EmailDto){
  if(!this.authEmail.enabled)throw new ServiceUnavailableException({code:'AUTH_EMAIL_NOT_CONFIGURED',message:'El acceso por correo no está disponible. Usa tu contraseña.'});
  const email=normalizeEmail(input.email),users=await this.db.user.findMany({where:{email},select:{tenantId:true}});
  await this.limiter.check('auth-login-code:'+email,3,900);
  if(users.length){const code=await this.issueCodes([...new Set(users.map(user=>user.tenantId))],email,'login');await this.authEmail.sendCode(email,'login',code);}
  return {message:'Si el correo tiene una cuenta, recibirás un código de acceso. Revisa también spam.',expiresMinutes:10};
 }
 @Post('login-code/verify') async verifyLoginCode(@Body(validation(VerifyCodeDto)) input:VerifyCodeDto,@Res({passthrough:true}) reply:FastifyReply){
  const user=await this.verifyCode(input,'login');if(!user)return {requiresWorkspaceSelection:true,workspaces:await this.workspaceChoices(input,'login')};
  await this.db.user.update({where:{tenantId_id:{tenantId:user.tenantId,id:user.id}},data:{emailVerified:true,emailVerifiedAt:new Date()}});
  const session=await this.sessions.create(user.id,user.tenantId);setCookie(reply,session.cookie);return session.body;
 }
 @Post('email/verify') async verifyRegistrationEmail(@Body(validation(VerifyCodeDto)) input:VerifyCodeDto,@Res({passthrough:true}) reply:FastifyReply){
  const user=await this.verifyCode(input,'verification');if(!user)return {requiresWorkspaceSelection:true,workspaces:await this.workspaceChoices(input,'verification')};
  await this.db.user.update({where:{tenantId_id:{tenantId:user.tenantId,id:user.id}},data:{emailVerified:true,emailVerifiedAt:new Date()}});
  const session=await this.sessions.create(user.id,user.tenantId);setCookie(reply,session.cookie);return session.body;
 }
 @Post('email/verification/resend') async resendVerification(@Body(validation(EmailDto)) input:EmailDto){
  if(!this.authEmail.enabled)throw new ServiceUnavailableException({code:'AUTH_EMAIL_NOT_CONFIGURED',message:'El correo de verificación no está configurado.'});
  const email=normalizeEmail(input.email),users=await this.db.user.findMany({where:{email,emailVerified:false},select:{tenantId:true}});
  await this.limiter.check('auth-verify-resend:'+email,3,900);
  if(users.length){const code=await this.issueCodes([...new Set(users.map(user=>user.tenantId))],email,'verification');await this.authEmail.sendCode(email,'verification',code);}
  return {message:'Si la cuenta necesita verificación, enviaremos un nuevo código.'};
 }
 @Post('password-reset/request') async requestPasswordReset(@Body(validation(EmailDto)) input:EmailDto){
  if(!this.authEmail.enabled)throw new ServiceUnavailableException({code:'AUTH_EMAIL_NOT_CONFIGURED',message:'La recuperación por correo no está configurada.'});
  const email=normalizeEmail(input.email),users=await this.db.user.findMany({where:{email},select:{tenantId:true}});
  await this.limiter.check('auth-password-reset:'+email,3,900);
  if(users.length){const code=await this.issueCodes([...new Set(users.map(user=>user.tenantId))],email,'password-reset');await this.authEmail.sendCode(email,'password-reset',code);}
  return {message:'Si el correo tiene una cuenta, recibirás un código para restablecer la contraseña.'};
 }
 @Post('password-reset/confirm') async confirmPasswordReset(@Body(validation(ResetPasswordDto)) input:ResetPasswordDto){
  const user=await this.verifyCode(input,'password-reset');if(!user)return {requiresWorkspaceSelection:true,workspaces:await this.workspaceChoices(input,'password-reset')};
  const salt=randomBytes(16).toString('hex'),passwordHash=salt+':'+(await deriveKey(input.password,salt)).toString('hex'),now=new Date();
  await this.db.$transaction(async tx=>{await tx.user.update({where:{tenantId_id:{tenantId:user.tenantId,id:user.id}},data:{passwordHash,emailVerified:true,emailVerifiedAt:now}});await tx.refreshSession.updateMany({where:{tenantId:user.tenantId,userId:user.id,revokedAt:null},data:{revokedAt:now}});await tx.authChallenge.updateMany({where:{tenantId:user.tenantId,email:normalizeEmail(input.email),purpose:'password-reset',consumedAt:null},data:{consumedAt:now}});});
  return {passwordReset:true,message:'La contraseña se actualizó. Inicia sesión con tu nueva contraseña.'};
 }
 @Post('refresh') async refresh(@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){
  try{const session=await this.sessions.rotate(refreshCookie(request.headers));setCookie(reply,session.cookie);return session.body;}
  catch(error:unknown){const body=error instanceof UnauthorizedException?error.getResponse():null;if(!(body&&typeof body==='object'&&'code' in body&&body.code==='REFRESH_RACE'))setCookie(reply,'',true);throw error;}
 }
 @Post('logout') async logout(@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){await this.sessions.logout(refreshCookie(request.headers));setCookie(reply,'',true);return {loggedOut:true};}
 private async issueCodes(tenantIds:string[],email:string,purpose:AuthPurpose):Promise<string>{const code=randomInt(0,1_000_000).toString().padStart(6,'0'),now=new Date(),expiresAt=new Date(Date.now()+10*60_000);for(const tenantId of tenantIds){await this.db.authChallenge.updateMany({where:{tenantId,email,purpose,consumedAt:null},data:{consumedAt:now}});await this.db.authChallenge.deleteMany({where:{tenantId,email,purpose,OR:[{expiresAt:{lt:new Date(Date.now()-86400_000)}},{consumedAt:{not:null}}]}});await this.db.authChallenge.create({data:{tenantId,email,purpose,tokenHash:codeHash(tenantId,email,purpose,code),expiresAt}});}return code;}
 private async verifyCode(input:VerifyCodeDto|ResetPasswordDto,purpose:AuthPurpose){const email=normalizeEmail(input.email),users=await this.db.user.findMany({where:{email,...(input.workspaceId?{tenantId:input.workspaceId}:{})},take:21,include:{tenant:{select:{name:true}}}});if(users.length>20)throw new UnauthorizedException('No se pudo resolver el acceso. Contacta con el administrador.');const tenantIds=users.map(user=>user.tenantId);const now=new Date(),challenges=tenantIds.length?await this.db.authChallenge.findMany({where:{tenantId:{in:tenantIds},email,purpose,consumedAt:null,expiresAt:{gt:now},attempts:{lt:5}},orderBy:{createdAt:'desc'}}):[];const matches=users.filter(user=>challenges.some(challenge=>challenge.tenantId===user.tenantId&&codeMatches(user.tenantId,email,purpose,input.code,challenge.tokenHash)));if(!matches.length){for(const challenge of challenges)await this.db.authChallenge.updateMany({where:{tenantId:challenge.tenantId,id:challenge.id,attempts:{lt:5}},data:{attempts:{increment:1}}});throw new UnauthorizedException('Código inválido o vencido. Revisa el último correo o solicita otro código.');}if(matches.length>1)return null;const user=matches[0];if(!user)throw new UnauthorizedException();const allTenants=await this.db.user.findMany({where:{email},select:{tenantId:true}});const claimed=await this.db.authChallenge.updateMany({where:{tenantId:{in:[...new Set(allTenants.map(item=>item.tenantId))]},email,purpose,consumedAt:null,expiresAt:{gt:now},attempts:{lt:5}},data:{consumedAt:now}});if(!claimed.count)throw new UnauthorizedException('Este código ya se utilizó. Solicita uno nuevo.');return user;}
 private async workspaceChoices(input:VerifyCodeDto|ResetPasswordDto,purpose:AuthPurpose){const users=await this.db.user.findMany({where:{email:normalizeEmail(input.email)},take:21,orderBy:{id:'asc'},include:{tenant:{select:{name:true}}}});if(users.length<2)throw new UnauthorizedException('Código inválido o vencido. Revisa el último correo o solicita otro código.');const challenges=await this.db.authChallenge.findMany({where:{tenantId:{in:users.map(user=>user.tenantId)},email:normalizeEmail(input.email),purpose,consumedAt:null,expiresAt:{gt:new Date()},attempts:{lt:5}}});const matching=users.filter(user=>challenges.some(challenge=>challenge.tenantId===user.tenantId&&codeMatches(user.tenantId,normalizeEmail(input.email),purpose,input.code,challenge.tokenHash)));if(!matching.length)throw new UnauthorizedException('Código inválido o vencido. Revisa el último correo o solicita otro código.');return matching.map(user=>({id:user.tenantId,name:user.tenant.name}));}
}
