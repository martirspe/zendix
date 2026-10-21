import assert from 'node:assert/strict';
import {randomBytes,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {configureRuntime}=require('/workspace/apps/api/dist/apps/api/src/runtime.js');
configureRuntime();
const {PrismaClient}=require('/workspace/node_modules/@prisma/client');
const db=new PrismaClient();
let tenantId;
try{
 const base='http://127.0.0.1:3000',origin=process.env.APP_PUBLIC_URL;
 assert.equal(process.env.NODE_ENV,'production');
 assert.equal((await fetch(base+'/health')).status,200);
 assert.equal((await (await fetch(base+'/auth/config')).json()).registrationEnabled,false);
 const password=randomBytes(24).toString('hex'),salt=randomBytes(16).toString('hex');
 const tenant=await db.tenant.create({data:{name:'Production image verification',users:{create:{email:'production-smoke@example.invalid',passwordHash:salt+':'+scryptSync(password,salt,64).toString('hex'),role:'owner'}}}});tenantId=tenant.id;
 const blocked=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'https://wrong.example.invalid'},body:JSON.stringify({email:'production-smoke@example.invalid',password,workspaceId:tenantId})});assert.equal(blocked.status,403);
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email:'production-smoke@example.invalid',password,workspaceId:tenantId})});
 assert.equal(login.status,201);const session=await login.json();const cookie=login.headers.get('set-cookie');
 for(const property of ['HttpOnly','Secure','SameSite=Strict'])assert.ok(cookie.includes(property));
 assert.equal((await fetch(base+'/contacts',{headers:{authorization:'Bearer '+session.accessToken}})).status,200);
 const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{origin,cookie:cookie.split(';')[0]}});assert.equal(logout.status,201);
 assert.equal((await fetch(base+'/contacts',{headers:{authorization:'Bearer '+session.accessToken}})).status,401);
 console.log('PASS: production image readiness, private authenticated services, origin enforcement, secure cookies and token revocation. No public listener or external email was used.');
}finally{if(tenantId){await db.refreshSession.deleteMany({where:{tenantId}});await db.user.deleteMany({where:{tenantId}});await db.tenant.delete({where:{id:tenantId}});}await db.$disconnect();}
