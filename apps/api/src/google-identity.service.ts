import {Injectable,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createPublicKey,verify,type JsonWebKey} from 'node:crypto';

interface GoogleProfile {sub:string;email:string;firstName:string;lastName:string;}
interface GoogleJsonWebKey extends JsonWebKey {kid?:string;alg?:string;use?:string;}
interface JsonWebKeySet {keys?:GoogleJsonWebKey[];}

@Injectable()
export class GoogleIdentityService {
 private keys:JsonWebKeySet|null=null;
 private keysExpireAt=0;
 get enabled():boolean{return process.env['GOOGLE_OAUTH_ENABLED']==='true'&&Boolean(this.clientId);}
 get clientId():string{return process.env['GOOGLE_CLIENT_ID']?.trim()??'';}

 async verifyIdToken(tokenValue:string):Promise<GoogleProfile>{
  if(!this.enabled)throw new ServiceUnavailableException({code:'GOOGLE_AUTH_NOT_CONFIGURED',message:'El acceso con Google no está configurado.'});
  const token=tokenValue.trim();
  if(!token||token.length>16384)throw new UnauthorizedException('No pudimos validar la credencial de Google.');
  const parts=token.split('.');if(parts.length!==3)throw new UnauthorizedException('No pudimos validar la credencial de Google.');
  let header:Record<string,unknown>,claims:Record<string,unknown>;
  try{header=this.decode(parts[0]??'');claims=this.decode(parts[1]??'');}catch{throw new UnauthorizedException('No pudimos validar la credencial de Google.');}
  const keyId=header['kid'];if(header['alg']!=='RS256'||typeof keyId!=='string'||!keyId)throw new UnauthorizedException('No pudimos validar la credencial de Google.');
  const jwk=await this.signingKey(keyId);
  let signatureValid=false;try{signatureValid=verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2]??'','base64url'));}catch{signatureValid=false;}
  const now=Math.floor(Date.now()/1000),audience=claims['aud'],audiences=Array.isArray(audience)?audience:typeof audience==='string'?[audience]:[];
  const issuer=claims['iss'],issuedAt=claims['iat'],expiresAt=claims['exp'],authorizedParty=claims['azp'];
  if(!signatureValid||!['accounts.google.com','https://accounts.google.com'].includes(String(issuer))||!audiences.includes(this.clientId)||(audiences.length>1&&authorizedParty!==this.clientId)||(authorizedParty!==undefined&&authorizedParty!==this.clientId)||typeof issuedAt!=='number'||issuedAt>now+300||now-issuedAt>3900||typeof expiresAt!=='number'||expiresAt<=now-30||expiresAt-issuedAt>86400)throw new UnauthorizedException('No pudimos validar la sesión de Google. Intenta nuevamente.');
  const sub=claims['sub'],email=claims['email'],emailVerified=claims['email_verified'];
  if(typeof sub!=='string'||!sub||sub.length>255||typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||emailVerified!==true)throw new UnauthorizedException('Google debe confirmar un correo válido y verificado.');
  const fullName=typeof claims['name']==='string'?claims['name'].trim():'';
  const partsName=fullName.split(/\s+/).filter(Boolean);
  const firstName=(typeof claims['given_name']==='string'?claims['given_name'].trim():partsName[0]||'Usuario').slice(0,100)||'Usuario';
  const lastName=(typeof claims['family_name']==='string'?claims['family_name'].trim():partsName.slice(1).join(' ')||'Google').slice(0,100)||'Google';
  return {sub,email:email.trim().toLowerCase(),firstName,lastName};
 }

 private decode(value:string):Record<string,unknown>{const parsed:unknown=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid token claim');return parsed as Record<string,unknown>;}
 private async signingKey(keyId:string):Promise<JsonWebKey>{
  if(!this.keys||this.keysExpireAt<=Date.now()||!this.keys.keys?.some(key=>key.kid===keyId))await this.fetchKeys();
  const key=this.keys?.keys?.find(item=>item.kid===keyId&&item.kty==='RSA'&&(!item.alg||item.alg==='RS256')&&(!item.use||item.use==='sig'));
  if(!key){await this.fetchKeys();const refreshed=this.keys?.keys?.find(item=>item.kid===keyId&&item.kty==='RSA'&&(!item.alg||item.alg==='RS256')&&(!item.use||item.use==='sig'));if(!refreshed)throw new UnauthorizedException('La credencial de Google ya no es válida.');return refreshed;}
  return key;
 }
 private async fetchKeys():Promise<void>{
  try{const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(8000),redirect:'error',headers:{accept:'application/json'}});if(!response.ok)throw new Error('Google key service unavailable');const body=await response.json() as JsonWebKeySet;if(!Array.isArray(body.keys)||!body.keys.length)throw new Error('Google returned no signing keys');const cache=response.headers.get('cache-control')?.match(/max-age=(\d+)/i);this.keys=body;this.keysExpireAt=Date.now()+Math.min(Math.max(Number(cache?.[1]??300),30),3600)*1000;}catch{throw new ServiceUnavailableException('No pudimos comprobar las credenciales de Google. Intenta de nuevo.');}
 }
}
