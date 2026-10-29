import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Database } from './database';
import {RateLimiter} from './rate-limiter';
export interface TenantRequest { headers:{authorization?:string}; tenantId:string; userId:string; userRole?:'owner'|'editor'|'viewer'; method?:string; url?:string; }
@Injectable()
export class TenantGuard implements CanActivate {
 constructor(@Inject(JwtService) private readonly jwt:JwtService,@Inject(Database) private readonly db:Database,@Inject(RateLimiter) private readonly limiter:RateLimiter){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const request=context.switchToHttp().getRequest<TenantRequest>();
  const token=request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw new UnauthorizedException();
  let payload:{sub:string;tenantId:string;sid:string};
  try{payload=await this.jwt.verifyAsync(token,{algorithms:['HS256'],issuer:'zendix',audience:'zendix-console'});if(!payload.sub||!payload.tenantId||!payload.sid)throw new Error();}catch{throw new UnauthorizedException();}
  const session=await this.db.refreshSession.findFirst({where:{id:payload.sid,tenantId:payload.tenantId,userId:payload.sub,revokedAt:null,expiresAt:{gt:new Date()}},include:{user:true}});
  if(!session)throw new UnauthorizedException();
  request.tenantId=session.tenantId;request.userId=session.userId;request.userRole=session.user.role;
  if(session.user.role==='viewer'&&request.method&&!['GET','HEAD','OPTIONS'].includes(request.method))throw new ForbiddenException('Tu perfil solo permite consultar los datos. Pide acceso de edición para realizar cambios.');
  if(request.method==='POST'&&request.url?.startsWith('/integrations/'))await this.limiter.check('integrations:'+session.tenantId,10);
  if(request.method==='POST'&&request.url?.startsWith('/test-emails/'))await this.limiter.check('test-emails:'+session.tenantId,5);
  return true;
 }
}
@Injectable()
export class OwnerGuard implements CanActivate {
 canActivate(context:ExecutionContext):boolean{if(context.switchToHttp().getRequest<TenantRequest>().userRole!=='owner')throw new ForbiddenException('Solo el propietario puede gestionar las conexiones.');return true;}
}
