import {Inject,Injectable,UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {Database} from './database';

function digest(value:string):string{return createHash('sha256').update(value).digest('hex');}
function sameHash(value:string,expected:string):boolean {const a=Buffer.from(digest(value),'hex'),b=Buffer.from(expected,'hex');return a.length===b.length&&timingSafeEqual(a,b);}
export function refreshCookie(headers:{cookie?:string}):string|undefined {return headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith('mc_refresh='))?.slice('mc_refresh='.length);}

@Injectable()
export class SessionsService {
 constructor(@Inject(Database) private readonly db:Database,@Inject(JwtService) private readonly jwt:JwtService){}
 async create(userId:string,tenantId:string){
  const id=randomUUID(),secret=randomBytes(32).toString('base64url'),familyId=randomUUID();
  await this.db.refreshSession.create({data:{id,userId,tenantId,familyId,tokenHash:digest(secret),expiresAt:new Date(Date.now()+30*86400000)}});
  return this.response(id,secret,userId,tenantId);
 }
 async rotate(raw:string|undefined){
  const parsed=await this.identify(raw);
  if(parsed.revokedAt){
   if(Date.now()-parsed.revokedAt.getTime()<5000)throw new UnauthorizedException({code:'REFRESH_RACE',message:'Otra pestaña está renovando la sesión.'});
   await this.db.refreshSession.updateMany({where:{tenantId:parsed.tenantId,familyId:parsed.familyId,revokedAt:null},data:{revokedAt:new Date()}});throw new UnauthorizedException('La sesión ya se renovó. Inicia sesión de nuevo.');
  }
  if(parsed.expiresAt<=new Date())throw new UnauthorizedException('La sesión ha caducado.');
  const id=randomUUID(),secret=randomBytes(32).toString('base64url');
  await this.db.$transaction(async transaction=>{
   const rotated=await transaction.refreshSession.updateMany({where:{id:parsed.id,tenantId:parsed.tenantId,tokenHash:parsed.tokenHash,revokedAt:null,expiresAt:{gt:new Date()}},data:{revokedAt:new Date()}});
   if(!rotated.count)throw new UnauthorizedException({code:'REFRESH_RACE',message:'Otra pestaña está renovando la sesión.'});
   await transaction.refreshSession.create({data:{id,userId:parsed.userId,tenantId:parsed.tenantId,familyId:parsed.familyId,tokenHash:digest(secret),expiresAt:new Date(Date.now()+30*86400000)}});
  });
  return this.response(id,secret,parsed.userId,parsed.tenantId);
 }
 async logout(raw:string|undefined){
  if(!raw)return;
  try{const session=await this.identify(raw);await this.db.refreshSession.updateMany({where:{tenantId:session.tenantId,familyId:session.familyId,revokedAt:null},data:{revokedAt:new Date()}});}catch(error:unknown){if(!(error instanceof UnauthorizedException))throw error;}
 }
 private async identify(raw:string|undefined){
  if(!raw||raw.length>200)throw new UnauthorizedException();
  const [id,secret,...extra]=raw.split('.');if(!id||!secret||extra.length)throw new UnauthorizedException();
  const session=await this.db.refreshSession.findUnique({where:{id}});
  if(!session||!sameHash(secret,session.tokenHash))throw new UnauthorizedException();
  return session;
 }
 private async response(id:string,secret:string,userId:string,tenantId:string){const user=await this.db.user.findFirst({where:{id:userId,tenantId},select:{role:true}});if(!user)throw new UnauthorizedException();const tenant=await this.db.tenant.findUnique({where:{id:tenantId},select:{name:true}});return {cookie:id+'.'+secret,body:{accessToken:await this.jwt.signAsync({sub:userId,tenantId,sid:id},{expiresIn:'15m',issuer:'mailcraft',audience:'mailcraft-console',algorithm:'HS256'}),tenantId,userRole:user.role,workspaceName:tenant?.name??'Mi espacio',expiresIn:900}};}
}
