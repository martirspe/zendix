import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Database } from '../database';
import { SecretVault } from './secret-vault';
import { MailchannelsSmtp } from './mailchannels-smtp';
import { ownershipRecord } from './domain-ownership';
import { DnsRecord, planDns } from './cloudflare-plan';
import {validateSpfBudget} from './spf-budget';
import {Resolver} from 'node:dns/promises';

interface Zone {id:string;name:string;status:string;}
interface CloudflareSettings {token:string;zoneId:string;zoneName:string;}
interface CloudflareResponse<T> {success:boolean;result:T;result_info?:{total_pages:number};}

@Injectable()
export class CloudflareService {
  constructor(@Inject(Database) private readonly db: Database, @Inject(SecretVault) private readonly vault: SecretVault, @Inject(MailchannelsSmtp) private readonly smtp: MailchannelsSmtp) {}
  protected async resolveSpf(hostname:string):Promise<string[]>{const resolver=new Resolver({timeout:3000,tries:1});return (await resolver.resolveTxt(hostname)).map(parts=>parts.join(''));}

  private async request<T>(token:string,path:string,method='GET',body?:unknown):Promise<CloudflareResponse<T>> {
    let response: Response;
    try { response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'}); }
    catch { throw new BadRequestException({code:'CLOUDFLARE_UNREACHABLE',message:'No se pudo conectar con Cloudflare. Revisa la conexión y vuelve a intentarlo.'}); }
    if(!response.ok)throw new BadRequestException({code:'CLOUDFLARE_REQUEST_FAILED',message:'Cloudflare rechazó la operación. Revisa los permisos Zone:Read y DNS:Edit para esta zona.'});
    const data=await response.json() as CloudflareResponse<T>;
    if(!data.success)throw new BadRequestException({code:'CLOUDFLARE_REQUEST_FAILED',message:'Cloudflare no pudo completar la operación.'});
    return data;
  }

  async configure(tenantId:string,domainId:string,newToken?:string) {
    const domain=await this.db.domain.findFirst({where:{tenantId,id:domainId}});
    if(!domain)throw new NotFoundException();
    const settings=await this.smtp.settings(tenantId);
    if(settings.fromEmail.split('@')[1]!==domain.hostname)throw new BadRequestException({code:'SENDER_DOMAIN_MISMATCH',message:'El dominio debe coincidir con el remitente configurado en MailChannels.'});
    const stored=await this.vault.load<CloudflareSettings>(tenantId,'cloudflare');
    const token=newToken??stored?.token;
    if(!token)throw new BadRequestException({code:'CLOUDFLARE_NOT_CONNECTED',message:'Introduce un token de Cloudflare limitado a este dominio.'});
    const zones=(await this.request<Zone[]>(token,'/zones?name='+encodeURIComponent(domain.hostname)+'&status=active')).result;
    const zone=zones.find(item=>item.name===domain.hostname&&item.status==='active');
    if(!zone)throw new BadRequestException({code:'CLOUDFLARE_ZONE_NOT_FOUND',message:'No se encontró una zona activa para este dominio. Revisa el token y los nameservers.'});
    await this.vault.store(tenantId,'cloudflare',{token,zoneId:zone.id,zoneName:zone.name});
    const selector='mailcraft';
    const key=await this.vault.dkim(tenantId,domain.hostname);
    const names=[domain.hostname,'_mailcraft.'+domain.hostname,'_dmarc.'+domain.hostname,selector+'._domainkey.'+domain.hostname,'_mailchannels.'+domain.hostname];
    const readRecords=async()=>{
      const pages=await Promise.all(names.map(name=>this.request<DnsRecord[]>(token,'/zones/'+zone.id+'/dns_records?name='+encodeURIComponent(name)+'&per_page=100')));
      if(pages.some(page=>(page.result_info?.total_pages??1)>1))throw new ConflictException({code:'DNS_RECORD_LIMIT',message:'Demasiados registros en este nombre. Revisa el DNS antes de continuar.'});
      return pages.flatMap(page=>page.result);
    };
    const records=await readRecords();
    let changes;
    try{changes=planDns(records,domain.hostname,ownershipRecord(tenantId,domain.hostname).value,settings.accountId,selector,key.publicKey);}
    catch(error:unknown){throw new ConflictException({code:error instanceof Error?error.message:'DNS_CONFLICT',message:'Hay un conflicto en SPF, DKIM, DMARC o Domain Lockdown. No se cambió ningún registro. Revisa el código del conflicto.'});}
    const spfChange=changes.find(change=>change.name===domain.hostname&&/^v=spf1/i.test(change.content));
    if(spfChange){try{await validateSpfBudget(spfChange.content,name=>this.resolveSpf(name));}catch{throw new ConflictException({code:'SPF_LOOKUP_REVIEW_REQUIRED',message:'No se pudo confirmar el límite de consultas del SPF resultante. No se cambió el DNS. Revisa los includes actuales antes de continuar.'});}}
    const fingerprint=(items:DnsRecord[])=>createHash('sha256').update(JSON.stringify([...items].sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
    if(changes.length&&fingerprint(records)!==fingerprint(await readRecords()))throw new ConflictException({code:'DNS_CHANGED',message:'Los registros cambiaron durante la revisión. Vuelve a intentarlo.'});
    if(changes.length){
      const posts=changes.filter(change=>change.action==='create').map(change=>({type:'TXT',name:change.name,content:JSON.stringify(change.content),ttl:1,comment:'MailCraft domain setup'}));
      const patches=changes.filter(change=>change.action==='update').map(change=>({id:change.id,content:JSON.stringify(change.content)}));
      await this.request(token,'/zones/'+zone.id+'/dns_records/batch','POST',{posts,patches});
    }
    return {configured:true,zone:zone.name,changes:changes.map(change=>({action:change.action,name:change.name,content:JSON.stringify(change.content)})),message:changes.length?'Registros instalados. Espera su propagación y comprueba el DNS.':'Los registros ya estaban configurados.'};
  }
}
