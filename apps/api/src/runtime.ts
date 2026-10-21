import {readFileSync} from 'node:fs';

export function configureRuntime():void {
 const read=(name:string)=>readFileSync(process.env[name]??'','utf8').trim();
 if(process.env['DATABASE_PASSWORD_FILE'])process.env['DATABASE_URL']='postgresql://'+encodeURIComponent(process.env['DATABASE_USER']??'mailcraft')+':'+encodeURIComponent(read('DATABASE_PASSWORD_FILE'))+'@'+(process.env['DATABASE_HOST']??'postgres')+':5432/'+(process.env['DATABASE_NAME']??'mailcraft');
 if(process.env['REDIS_PASSWORD_FILE'])process.env['REDIS_URL']='redis://:'+encodeURIComponent(read('REDIS_PASSWORD_FILE'))+'@'+(process.env['REDIS_HOST']??'redis')+':6379';
}

export function jwtSecret():string {
 const file=process.env['JWT_SECRET_FILE'];
 return file?readFileSync(file,'utf8').trim():process.env['JWT_SECRET']??'';
}
export function registrationEnabled():boolean {return process.env['ALLOW_REGISTRATION']==='true'||(process.env['NODE_ENV']!=='production'&&process.env['ALLOW_REGISTRATION']!=='false');}
export function validateRuntime():void {
 const production=process.env['NODE_ENV']==='production';
 const key=jwtSecret();
 if(key.length<(production?48:32)||(production&&key.includes('development-only')))throw new Error('A strong JWT secret is required');
 if(production){
  process.env['APP_PUBLIC_URL']=publicApplicationOrigin();
  if(!process.env['MAILCRAFT_MASTER_KEY_FILE'])throw new Error('MAILCRAFT_MASTER_KEY_FILE is required in production');
  const master=readFileSync(process.env['MAILCRAFT_MASTER_KEY_FILE'],'utf8').trim();
  if(!/^[A-Za-z0-9+/]{43}=$/.test(master)||Buffer.from(master,'base64').length!==32)throw new Error('A valid persistent 256-bit vault key is required');
 }
}

export function publicApplicationOrigin():string {
 const origin=new URL(process.env['APP_PUBLIC_URL'] || 'http://localhost:4200');
 const local=['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
 if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&local&&process.env['NODE_ENV']!=='production')))throw new Error('APP_PUBLIC_URL must be an HTTPS origin or a local development HTTP origin');
 return origin.origin;
}
