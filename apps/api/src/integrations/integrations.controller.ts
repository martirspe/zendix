import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import { OwnerGuard, TenantGuard, TenantRequest } from '../tenant.guard';
import { SecretVault } from './secret-vault';
import { SesEmail, SesSettings } from './ses-email';
import { CloudflareService } from './cloudflare.service';
import { Database } from '../database';

class SesDto implements SesSettings {
  @Matches(/^[a-z]{2}(?:-[a-z]+)+-\d$/) region!:string;
  @Matches(/^[A-Za-z0-9_-]{1,64}$/) configurationSet!:string;
  @IsEmail() fromEmail!:string;
  @IsString() @MinLength(1) @MaxLength(100) fromName!:string;
  @IsEmail() testRecipient!:string;
  @IsUrl({require_tld:false,protocols:['https','http'],require_protocol:true}) publicBaseUrl!:string;
}
class CloudflareDto { @IsOptional() @IsString() @MinLength(20) @MaxLength(2048) token?:string; }

@Controller('integrations') @UseGuards(TenantGuard,OwnerGuard)
export class IntegrationsController {
  constructor(@Inject(SecretVault) private readonly vault:SecretVault,@Inject(SesEmail) private readonly emailApi:SesEmail,@Inject(CloudflareService) private readonly cloudflare:CloudflareService,@Inject(Database) private readonly db:Database){}
  @Get()
  async status(@Req() request:TenantRequest){
    const emailApi=await this.vault.load<SesSettings>(request.tenantId,'ses');
    const cloudflare=await this.vault.load(request.tenantId,'cloudflare');
    const providerAccount=await this.db.emailProviderAccount.findUnique({where:{tenantId_provider:{tenantId:request.tenantId,provider:'ses'}},select:{webhookVerifiedAt:true}});
    return {emailApiConnected:Boolean(emailApi),webhookVerified:Boolean(providerAccount?.webhookVerifiedAt),cloudflareConnected:Boolean(cloudflare),fromEmail:emailApi?.fromEmail??'',fromName:emailApi?.fromName??'',testRecipient:emailApi?.testRecipient??'',publicBaseUrl:emailApi?.publicBaseUrl??'',region:emailApi?.region??'',configurationSet:emailApi?.configurationSet??'',testOnly:true};
  }
  @Post('ses')
  async connect(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:SesDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:SesDto){
    const base=new URL(input.publicBaseUrl);
    if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||(process.env['NODE_ENV']==='production'&&base.protocol!=='https:'))throw new BadRequestException({code:'INVALID_PUBLIC_URL',message:'Usa el origen público de la aplicación, sin rutas, credenciales ni parámetros. En producción debe ser HTTPS.'});
    if(process.env['NODE_ENV']==='production'&&base.origin!==process.env['APP_PUBLIC_URL'])throw new BadRequestException({code:'PUBLIC_URL_MISMATCH',message:'La URL de bajas debe coincidir con el origen público de MailCraft.'});
    return this.emailApi.connect(request.tenantId,{...input,fromEmail:input.fromEmail.toLowerCase(),testRecipient:input.testRecipient.toLowerCase(),publicBaseUrl:input.publicBaseUrl.replace(/\/$/,'')});
  }
  @Post('cloudflare/:domainId')
  async configure(@Req() request:TenantRequest,@Param('domainId') domainId:string,@Body(new ValidationPipe({expectedType:CloudflareDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:CloudflareDto){return this.cloudflare.configure(request.tenantId,domainId,input.token);}
}
