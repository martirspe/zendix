import {PrismaClient} from '@prisma/client';
import {randomBytes,scrypt} from 'node:crypto';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>4096)throw new Error('Input is too large');}
const fields=input.includes('\0')?input.split('\0'):null;
const {workspace,email,password}=fields?{workspace:fields[0],email:fields[1],password:fields[2]}:JSON.parse(input);
if(typeof workspace!=='string'||workspace.length<2||workspace.length>100||typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=='string'||password.length<16||password.length>128)throw new Error('Provide workspace, email and a password of 16 to 128 characters through standard input');
const salt=randomBytes(16).toString('hex');
const hash=await new Promise((resolve,reject)=>scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key.toString('hex'))));
const db=new PrismaClient();
try{
 if(await db.user.findFirst({where:{email:email.toLowerCase(),tenant:{name:workspace}}}))throw new Error('This workspace owner already exists; no changes were made');
 const tenant=await db.tenant.create({data:{name:workspace,users:{create:{email:email.toLowerCase(),passwordHash:salt+':'+hash,role:'owner'}}}});
 console.log('Owner created. Sign in with the configured email and password.');
}finally{await db.$disconnect();}
