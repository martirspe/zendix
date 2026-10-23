import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import { OwnerGuard, TenantGuard, TenantRequest } from '../tenant.guard';
import { SecretVault } from './secret-vault';
import { MailchannelsEmailApi, MailchannelsEmailSettings } from './mailchannels-email-api';
import { CloudflareService } from './cloudflare.service';
import { Database } from '../database';

class EmailApiDto implements MailchannelsEmailSettings {
  @IsString() @MinLength(20) @MaxLength(2048) apiKey!:string;
  @Matches(/^[a-zA-Z0-9._-]{1,128}$/) accountId!:string;
  @IsEmail() fromEmail!:string;
  @IsString() @MaxLength(100) fromName!:string;
  @IsEmail() testRecipient!:string;
  @IsUrl({require_tld:false,protocols:['https','http'],require_protocol:true}) publicBaseUrl!:string;
}
class CloudflareDto { @IsOptional() @IsString() @MinLength(20) @MaxLength(2048) token?:string; }

@Controller('integrations') @UseGuards(TenantGuard,OwnerGuard)
export class IntegrationsController {
  constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(MailchannelsEmailApi) private readonly emailApi:MailchannelsEmailApi,@Inject(CloudflareService) private readonly cloudflare:CloudflareService,@Inject(Database) private readonly db:Database){}
  @Get()
  async status(@Req() request:TenantRequest){
    const emailApi=await this.vault.load<MailchannelsEmailSettings>(request.tenantId,'mailchannels-email-api');
    const cloudflare=await this.vault.load(request.tenantId,'cloudflare');
    const providerAccount=await this.db.emailProviderAccount.findUnique({where:{tenantId_provider:{tenantId:request.tenantId,provider:'mailchannels'}},select:{webhookVerifiedAt:true}});
    return {emailApiConnected:Boolean(emailApi),webhookVerified:Boolean(providerAccount?.webhookVerifiedAt),cloudflareConnected:Boolean(cloudflare),fromEmail:emailApi?.fromEmail??'',fromName:emailApi?.fromName??'',testRecipient:emailApi?.testRecipient??'',publicBaseUrl:emailApi?.publicBaseUrl??'',apiKeyConfigured:Boolean(emailApi),testOnly:true};
  }
  @Post('mailchannels-email-api')
  async connect(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:EmailApiDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:EmailApiDto){
    const base=new URL(input.publicBaseUrl);
    if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||(process.env['NODE_ENV']==='production'&&base.protocol!=='https:'))throw new BadRequestException({code:'INVALID_PUBLIC_URL',message:'Usa el origen público de la aplicación, sin rutas, credenciales ni parámetros. En producción debe ser HTTPS.'});
    if(process.env['NODE_ENV']==='production'&&base.origin!==process.env['APP_PUBLIC_URL'])throw new BadRequestException({code:'PUBLIC_URL_MISMATCH',message:'La URL de bajas debe coincidir con el origen público de MailCraft.'});
    return this.emailApi.connect(request.tenantId,{...input,fromEmail:input.fromEmail.toLowerCase(),testRecipient:input.testRecipient.toLowerCase(),publicBaseUrl:input.publicBaseUrl.replace(/\/$/,'')});
  }
  @Post('cloudflare/:domainId')
  async configure(@Req() request:TenantRequest,@Param('domainId') domainId:string,@Body(new ValidationPipe({expectedType:CloudflareDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:CloudflareDto){return this.cloudflare.configure(request.tenantId,domainId,input.token);}
}
