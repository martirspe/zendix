import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../database';
import { SecretVault } from './secret-vault';
import { SesEmail } from './ses-email';
import { ownershipRecord } from './domain-ownership';

interface DnsRecord {id:string;name:string;type:string;content:string;priority?:number;}
interface Zone {id:string;name:string;status:string;}
interface CloudflareResponse<T> {success:boolean;result:T;result_info?:{total_pages:number};}
interface CloudflareSettings {token:string;zoneId:string;zoneName:string;}

@Injectable()
export class CloudflareService {
 constructor(@Inject(Database) private readonly db:Database,@Inject(SecretVault) private readonly vault:SecretVault,@Inject(SesEmail) private readonly ses:SesEmail){}
 private async request<T>(token:string,path:string,method='GET',body?:unknown):Promise<CloudflareResponse<T>>{
  let response:Response;
  try{response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new BadRequestException({code:'CLOUDFLARE_UNREACHABLE',message:'No se pudo conectar con Cloudflare.'});}
  if(!response.ok)throw new BadRequestException({code:'CLOUDFLARE_REQUEST_FAILED',message:'Cloudflare rechazó la operación. Comprueba Zone:Read y DNS:Edit.'});
  const data=await response.json() as CloudflareResponse<T>;if(!data.success)throw new BadRequestException({code:'CLOUDFLARE_REQUEST_FAILED',message:'Cloudflare no pudo completar la operación.'});return data;
 }
 async configure(tenantId:string,domainId:string,newToken?:string){
  const domain=await this.db.domain.findFirst({where:{tenantId,id:domainId}});if(!domain)throw new NotFoundException();
  const settings=await this.ses.settings(tenantId);
  if(settings.fromEmail.split('@')[1]!==domain.hostname)throw new BadRequestException({code:'SENDER_DOMAIN_MISMATCH',message:'El dominio debe coincidir con el remitente de Amazon SES.'});
  const stored=await this.vault.load<CloudflareSettings>(tenantId,'cloudflare'),token=newToken??stored?.token;
  if(!token)throw new BadRequestException({code:'CLOUDFLARE_NOT_CONNECTED',message:'Introduce un token de Cloudflare limitado a esta zona.'});
  const zones=(await this.request<Zone[]>(token,'/zones?name='+encodeURIComponent(domain.hostname)+'&status=active')).result;
  const zone=zones.find(item=>item.name===domain.hostname&&item.status==='active');if(!zone)throw new BadRequestException({code:'CLOUDFLARE_ZONE_NOT_FOUND',message:'No se encontró una zona activa para este dominio.'});
  const identity=await this.ses.identity(tenantId,domain.hostname);
  const tokens=identity.DkimAttributes?.Tokens??[],mailFrom=identity.MailFromAttributes?.MailFromDomain;
  if(tokens.length!==3||!mailFrom||!mailFrom.endsWith('.'+domain.hostname))throw new BadRequestException({code:'SES_IDENTITY_INCOMPLETE',message:'Configura Easy DKIM y un subdominio MAIL FROM en la identidad de SES antes de continuar.'});
  const desired=[{type:'TXT',name:ownershipRecord(tenantId,domain.hostname).name,content:ownershipRecord(tenantId,domain.hostname).value},
   ...tokens.map(value=>({type:'CNAME',name:value+'._domainkey.'+domain.hostname,content:value+'.dkim.amazonses.com'})),
   {type:'TXT',name:mailFrom,content:'v=spf1 include:amazonses.com ~all'},
   {type:'MX',name:mailFrom,content:'feedback-smtp.'+settings.region+'.amazonses.com',priority:10},
   {type:'TXT',name:'_dmarc.'+domain.hostname,content:'v=DMARC1; p=none;'}];
  const records:DnsRecord[]=[];
  for(const name of new Set(desired.map(item=>item.name))){const page=await this.request<DnsRecord[]>(token,'/zones/'+zone.id+'/dns_records?name='+encodeURIComponent(name)+'&per_page=100');if((page.result_info?.total_pages??1)>1)throw new ConflictException({code:'DNS_RECORD_LIMIT',message:'Hay demasiados registros DNS para revisar de forma segura.'});records.push(...page.result);}
  const changes:typeof desired=[];
  for(const item of desired){const existing=records.filter(record=>record.name.toLowerCase()===item.name.toLowerCase());
   if(existing.some(record=>record.type===item.type&&record.content.replace(/\.$/,'').replace(/^"|"$/g,'')===item.content))continue;
   if(item.type==='TXT'&&item.content.startsWith('v=spf1')&&existing.some(record=>record.type==='TXT'&&/^"?v=spf1/i.test(record.content)))throw new ConflictException({code:'SPF_CONFLICT',message:'El subdominio MAIL FROM ya tiene una política SPF distinta. Revísala antes de continuar.'});
   if(existing.some(record=>record.type==='CNAME'||item.type==='CNAME'||(record.type===item.type&&item.type!=='TXT')))throw new ConflictException({code:'DNS_CONFLICT',message:'Hay un registro DNS incompatible. Revisa la zona antes de continuar.'});
   if(item.name.startsWith('_dmarc.')&&existing.some(record=>record.type==='TXT'&&record.content.includes('v=DMARC1')))continue;
   changes.push(item);
  }
  if(changes.length){const posts=changes.map(item=>({type:item.type,name:item.name,content:item.content,ttl:1,...('priority' in item?{priority:item.priority}:{}),...(item.type==='CNAME'?{proxied:false}:{})}));await this.request(token,'/zones/'+zone.id+'/dns_records/batch','POST',{posts});}
  await this.vault.store(tenantId,'cloudflare',{token,zoneId:zone.id,zoneName:zone.name});
  return {configured:true,zone:zone.name,changes,message:changes.length?'Registros de SES instalados. Espera la propagación y verifica el dominio.':'Los registros de SES ya estaban configurados.'};
 }
}
