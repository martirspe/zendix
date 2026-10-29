import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OwnerGuard, TenantGuard, TenantRequest } from '../tenant.guard';
import { SecretVault } from './secret-vault';
import { SenderSettings, SesEmail, SesSettings } from './ses-email';
import { CloudflareService } from './cloudflare.service';
import { Database } from '../database';

class SesDto implements SenderSettings {
  @IsEmail() fromEmail!:string;
  @IsString() @MinLength(1) @MaxLength(100) fromName!:string;
  @IsEmail() testRecipient!:string;
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
    const platform=this.emailApi.platformSettings();
    return {emailApiConnected:Boolean(emailApi),webhookVerified:Boolean(providerAccount?.webhookVerifiedAt),cloudflareConnected:Boolean(cloudflare),fromEmail:emailApi?.fromEmail??'',fromName:emailApi?.fromName??'',testRecipient:emailApi?.testRecipient??'',publicBaseUrl:platform.publicBaseUrl,region:platform.region,configurationSet:platform.configurationSet,testOnly:true};
  }
  @Post('ses')
  async connect(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:SesDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:SesDto){
    return this.emailApi.connect(request.tenantId,{...input,fromEmail:input.fromEmail.toLowerCase(),testRecipient:input.testRecipient.toLowerCase()});
  }
  @Post('cloudflare/:domainId')
  async configure(@Req() request:TenantRequest,@Param('domainId') domainId:string,@Body(new ValidationPipe({expectedType:CloudflareDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:CloudflareDto){return this.cloudflare.configure(request.tenantId,domainId,input.token);}
}
