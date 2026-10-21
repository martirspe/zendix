import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import { OwnerGuard, TenantGuard, TenantRequest } from '../tenant.guard';
import { SecretVault } from './secret-vault';
import { MailchannelsSmtp, SmtpSettings } from './mailchannels-smtp';
import { CloudflareService } from './cloudflare.service';

class SmtpDto implements SmtpSettings {
  @Matches(/^[a-zA-Z0-9._-]{1,128}$/) accountId!:string;
  @IsString() @MinLength(1) @MaxLength(254) username!:string;
  @IsString() @MinLength(1) @MaxLength(1024) password!:string;
  @IsEmail() fromEmail!:string;
  @IsString() @MaxLength(100) fromName!:string;
  @IsEmail() testRecipient!:string;
  @IsUrl({require_tld:false,protocols:['https','http'],require_protocol:true}) publicBaseUrl!:string;
  @IsIn([587,2525]) port!:number;
}
class CloudflareDto { @IsOptional() @IsString() @MinLength(20) @MaxLength(2048) token?:string; }

@Controller('integrations') @UseGuards(TenantGuard,OwnerGuard)
export class IntegrationsController {
  constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(MailchannelsSmtp) private readonly smtp:MailchannelsSmtp,@Inject(CloudflareService) private readonly cloudflare:CloudflareService){}
  @Get()
  async status(@Req() request:TenantRequest){
    const smtp=await this.vault.load<SmtpSettings>(request.tenantId,'mailchannels');
    const cloudflare=await this.vault.load(request.tenantId,'cloudflare');
    return {smtpConnected:Boolean(smtp),cloudflareConnected:Boolean(cloudflare),fromEmail:smtp?.fromEmail??'',fromName:smtp?.fromName??'',testRecipient:smtp?.testRecipient??'',publicBaseUrl:smtp?.publicBaseUrl??'',testOnly:true};
  }
  @Post('mailchannels')
  async connect(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:SmtpDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:SmtpDto){
    const base=new URL(input.publicBaseUrl);
    if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||(process.env['NODE_ENV']==='production'&&base.protocol!=='https:'))throw new BadRequestException({code:'INVALID_PUBLIC_URL',message:'Usa el origen público de la aplicación, sin rutas, credenciales ni parámetros. En producción debe ser HTTPS.'});
    if(process.env['NODE_ENV']==='production'&&base.origin!==process.env['APP_PUBLIC_URL'])throw new BadRequestException({code:'PUBLIC_URL_MISMATCH',message:'La URL de bajas debe coincidir con el origen público de MailCraft.'});
    return this.smtp.connect(request.tenantId,{...input,fromEmail:input.fromEmail.toLowerCase(),testRecipient:input.testRecipient.toLowerCase(),publicBaseUrl:input.publicBaseUrl.replace(/\/$/,'')});
  }
  @Post('cloudflare/:domainId')
  async configure(@Req() request:TenantRequest,@Param('domainId') domainId:string,@Body(new ValidationPipe({expectedType:CloudflareDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:CloudflareDto){return this.cloudflare.configure(request.tenantId,domainId,input.token);}
}
