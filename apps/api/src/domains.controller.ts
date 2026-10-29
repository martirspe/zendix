import { Controller, Get, Inject, NotFoundException, Param, Post, Delete, ConflictException, Req, UseGuards, ValidationPipe, Body } from '@nestjs/common';
import { IsFQDN } from 'class-validator';
import { Resolver } from 'node:dns/promises';
import { ownershipRecord } from './integrations/domain-ownership';
import { SecretVault } from './integrations/secret-vault';
import { SesEmail, SesSettings } from './integrations/ses-email';
import { Database } from './database';
import { OwnerGuard, TenantGuard, TenantRequest } from './tenant.guard';

class CreateDomainDto { @IsFQDN({require_tld:true}) hostname!:string; }
@Controller('domains') @UseGuards(TenantGuard)
export class DomainsController {
 constructor(@Inject(Database) private readonly db:Database,@Inject(SecretVault) private readonly vault:SecretVault,@Inject(SesEmail) private readonly ses:SesEmail){}
 @Get() async list(@Req() request:TenantRequest){return (await this.db.domain.findMany({where:{tenantId:request.tenantId},take:100})).map(domain=>({...domain,ownershipRecord:ownershipRecord(request.tenantId,domain.hostname)}));}
 @Post() async create(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:CreateDomainDto,whitelist:true,forbidNonWhitelisted:true})) input:CreateDomainDto){const hostname=input.hostname.toLowerCase().replace(/\.$/,'');const domain=await this.db.domain.upsert({where:{tenantId_hostname:{tenantId:request.tenantId,hostname}},create:{tenantId:request.tenantId,hostname},update:{}});return {...domain,ownershipRecord:ownershipRecord(request.tenantId,hostname)};}
 @Post(':id/provision') @UseGuards(OwnerGuard) async provision(@Req() request:TenantRequest,@Param('id') id:string){
  const domain=await this.db.domain.findFirst({where:{tenantId:request.tenantId,id}});if(!domain)throw new NotFoundException();
  const proof=ownershipRecord(request.tenantId,domain.hostname),resolver=new Resolver({timeout:3000,tries:1});let values:string[]=[];
  try{values=(await resolver.resolveTxt(proof.name)).map(parts=>parts.join(''));}catch{}
  if(!values.includes(proof.value))throw new ConflictException('Publica y verifica primero el TXT de propiedad de Zendix.');
  const identity=await this.ses.provisionIdentity(request.tenantId,domain.hostname);
  return {provisioned:true,dkimTokens:identity.DkimAttributes?.Tokens??[],mailFromDomain:identity.MailFromAttributes?.MailFromDomain??null};
 }
 @Post(':id/check') async check(@Req() request:TenantRequest,@Param('id') id:string){
  const domain=await this.db.domain.findFirst({where:{tenantId:request.tenantId,id}});if(!domain)throw new NotFoundException();
  const settings=await this.vault.load<SesSettings>(request.tenantId,'ses');
  const resolver=new Resolver({timeout:3000,tries:1}),errors:string[]=[];
  const txt=async(name:string)=>{try{return (await resolver.resolveTxt(name)).map(parts=>parts.join(''));}catch{return [];}};
  const cname=async(name:string)=>{try{return await resolver.resolveCname(name);}catch{return [];}};
  const mx=async(name:string)=>{try{return await resolver.resolveMx(name);}catch{return [];}};
  const host=domain.hostname,proof=ownershipRecord(request.tenantId,host);
  const identity=settings&&settings.fromEmail.split('@')[1]===host?await this.ses.identity(request.tenantId,host).catch(()=>null):null;
  const tokens=identity?.DkimAttributes?.Tokens??[];
  const mailFrom=identity?.MailFromAttributes?.MailFromDomain;
  const [ownership,dmarc,dkimRecords,mailFromSpf,mailFromMx]=await Promise.all([txt(proof.name),txt('_dmarc.'+host),Promise.all(tokens.map(token=>cname(token+'._domainkey.'+host))),mailFrom?txt(mailFrom):Promise.resolve([]),mailFrom?mx(mailFrom):Promise.resolve([])]);
  const dkim=tokens.length===3&&tokens.every((token,index)=>dkimRecords[index]?.some(value=>value.replace(/\.$/,'').endsWith('.amazonses.com')&&value.startsWith(token+'.')));
  const spf=Boolean(mailFrom&&mailFrom.endsWith('.'+host)&&mailFromSpf.some(value=>/^v=spf1\s+include:amazonses\.com\s+[~-]all$/i.test(value))&&mailFromMx.some(value=>value.exchange===`feedback-smtp.${settings?.region}.amazonses.com`));
  const result={ownership:ownership.includes(proof.value),spf,dkim:Boolean(dkim&&identity?.DkimAttributes?.Status==='SUCCESS'),dmarc:dmarc.some(value=>/^v=DMARC1\s*;/i.test(value)&&/;\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i.test(value)),identity:Boolean(identity?.VerifiedForSendingStatus&&identity?.MailFromAttributes?.MailFromDomainStatus==='SUCCESS'),mx:mailFromMx.length>0};
  if(!identity&&settings)errors.push('SES_IDENTITY');
  const checkedAt=new Date();await this.db.domain.updateMany({where:{tenantId:request.tenantId,id},data:{checkedAt,spfVerified:result.ownership&&result.spf,dkimVerified:result.ownership&&result.dkim,dmarcVerified:result.ownership&&result.dmarc,sesVerified:result.ownership&&result.identity}});
  return {id,result,records:{ownership,dmarc,dkim:dkimRecords.flat(),spf:mailFromSpf,mx:mailFromMx.map(value=>value.exchange),identity:[]},errors,selector:'Easy DKIM (SES)',checkedAt,sendingEnabled:false,dkimTokens:tokens,mailFromDomain:mailFrom??null};
 }
 @Delete(':id') async remove(@Req() request:TenantRequest,@Param('id') id:string){const domain=await this.db.domain.findFirst({where:{tenantId:request.tenantId,id}});if(!domain)throw new NotFoundException();const settings=await this.vault.load<SesSettings>(request.tenantId,'ses');if(settings?.fromEmail.split('@')[1]===domain.hostname)throw new ConflictException('Este dominio está conectado al remitente de Amazon SES. Configura otro remitente antes de quitarlo.');await this.db.domain.deleteMany({where:{tenantId:request.tenantId,id}});return {deleted:true};}
}
