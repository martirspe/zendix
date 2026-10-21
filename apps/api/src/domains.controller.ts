import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Delete, ConflictException, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsFQDN } from 'class-validator';
import { ownershipRecord } from './integrations/domain-ownership';
import { SecretVault } from './integrations/secret-vault';
import { SmtpSettings } from './integrations/mailchannels-smtp';
import { Resolver } from 'node:dns/promises';
import { Database } from './database';
import { TenantGuard, TenantRequest } from './tenant.guard';
import { DnsRecords, inspectRecords } from './dns-diagnostics';

class CreateDomainDto { @IsFQDN({require_tld: true}) hostname!: string; }

@Controller('domains')
@UseGuards(TenantGuard)
export class DomainsController {
  constructor(@Inject(Database) private readonly db: Database, @Inject(SecretVault) private readonly vault:SecretVault) {}

  private instructions(tenantId: string, hostname: string) {
    return ownershipRecord(tenantId,hostname);
  }

  @Get()
  async list(@Req() request: TenantRequest) {
    const domains = await this.db.domain.findMany({where: {tenantId: request.tenantId}, take: 100});
    return domains.map(domain => ({...domain, ownershipRecord: this.instructions(request.tenantId, domain.hostname)}));
  }

  @Post()
  async create(@Req() request: TenantRequest, @Body(new ValidationPipe({expectedType: CreateDomainDto, whitelist: true, forbidNonWhitelisted: true})) input: CreateDomainDto) {
    const hostname = input.hostname.toLowerCase().replace(/\.$/, '');
    const domain = await this.db.domain.upsert({where: {tenantId_hostname: {tenantId: request.tenantId, hostname}}, create: {tenantId: request.tenantId, hostname}, update: {}});
    return {...domain, ownershipRecord: this.instructions(request.tenantId, hostname)};
  }

  @Post(':id/check')
  async check(@Req() request: TenantRequest, @Param('id') id: string) {
    const domain = await this.db.domain.findFirst({where: {id, tenantId: request.tenantId}});
    if (!domain) throw new NotFoundException();
    const resolver = new Resolver({timeout: 3000, tries: 1});
    const errors: string[] = [];
    const txt = async (name: string): Promise<string[]> => {
      try { return (await resolver.resolveTxt(name)).map(chunks => chunks.join('')); }
      catch (error: unknown) {
        const code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';
        if (!['ENODATA', 'ENOTFOUND'].includes(code)) errors.push(name);
        return [];
      }
    };
    const smtp=await this.vault.load<SmtpSettings>(request.tenantId,'mailchannels');
    const selector = smtp ? 'mailcraft' : process.env['MAILCHANNELS_DKIM_SELECTOR'] ?? 'mailchannels';
    if (!/^[a-zA-Z0-9_-]{1,63}$/.test(selector)) throw new Error('Invalid DKIM selector configuration');
    const host = domain.hostname;
    const [spf, dkim, dmarc, ownership, lockdown] = await Promise.all([txt(host), txt(selector + '._domainkey.' + host), txt('_dmarc.' + host), txt('_mailcraft.' + host), txt('_mailchannels.' + host)]);
    let mx: string[] = [];
    try { mx = (await resolver.resolveMx(host)).map(record => record.exchange); }
    catch { errors.push('MX'); }
    const records: DnsRecords = {spf, dkim, dmarc, ownership, lockdown, mx};
    const result = inspectRecords(records, this.instructions(request.tenantId, host).value, smtp?.accountId ?? process.env['MAILCHANNELS_ACCOUNT_ID'] ?? '');
    const data = {checkedAt: new Date(), spfVerified: result.ownership && result.spf, dkimVerified: result.ownership && result.dkim, dmarcVerified: result.ownership && result.dmarc, lockdownVerified: result.ownership && result.lockdown};
    await this.db.domain.updateMany({where: {id, tenantId: request.tenantId}, data});
    return {id, result, records, errors, selector, checkedAt: data.checkedAt, sendingEnabled: false};
  }
  @Delete(':id') async remove(@Req() request:TenantRequest,@Param('id') id:string){const domain=await this.db.domain.findFirst({where:{tenantId:request.tenantId,id}});if(!domain)throw new NotFoundException();const smtp=await this.vault.load<SmtpSettings>(request.tenantId,'mailchannels');if(smtp?.fromEmail.split('@')[1]===domain.hostname)throw new ConflictException('Este dominio está conectado al remitente SMTP. Configura otro remitente antes de quitarlo.');await this.db.domain.deleteMany({where:{tenantId:request.tenantId,id}});return {deleted:true};}

}
