import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PrismaClient} from '@prisma/client';
const require=createRequire(import.meta.url);
const {SecretVault}=require('../apps/api/dist/apps/api/src/integrations/secret-vault.js');
if(process.env.NODE_ENV==='production'||!/\/mailcraft_restore_(source|target)_[a-f0-9]{8}$/.test(process.env.DATABASE_URL??''))throw new Error('Use an isolated restore test database');
const db=new PrismaClient(),vault=new SecretVault(db),tenantId='00000000-0000-4000-8000-000000000123';
try{
 if(process.argv[2]==='seed'){await db.tenant.create({data:{id:tenantId,name:'Restore verification'}});await vault.store(tenantId,'restore-test',{token:'synthetic-restore-token'});}
 else{assert.equal(await db.tenant.count(),1);assert.deepEqual(await vault.load(tenantId,'restore-test'),{token:'synthetic-restore-token'});console.log('PASS: PostgreSQL dump/restore retains schema, data and decryptable tenant credentials with the matching vault key.');}
}finally{await db.$disconnect();}
