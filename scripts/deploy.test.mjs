import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

function fixture(){
 const root=mkdtempSync(join(tmpdir(),'mailcraft-deploy-'));
 for(const folder of ['scripts','bin','deploy/secrets'])mkdirSync(join(root,folder),{recursive:true});
 for(const script of ['deploy.sh','init-production.sh','bootstrap-host.sh'])copyFileSync('scripts/'+script,join(root,'scripts',script));
 writeFileSync(join(root,'.env.production'),'APP_HOST=app.zendix.site\nACME_EMAIL=operator@example.invalid\nWEB_PORT=8092\n'+['jwt_secret','vault_key','database_password','redis_password'].map(name=>name.toUpperCase()+'_PATH=./deploy/secrets/'+name).join('\n')+'\nAUTH_EMAIL_API_KEY_PATH=./deploy/secrets/auth_email_api_key\n');
 for(const name of ['jwt_secret','vault_key','database_password','redis_password'])writeFileSync(join(root,'deploy/secrets',name),'synthetic-test-value');
 writeFileSync(join(root,'deploy/secrets/auth_email_api_key'),'');
 writeFileSync(join(root,'bin/docker'),'#!/bin/bash\nprintf "%s\\n" "$*" >> "$MOCK_LOG"\ncase "$*" in\n *" build "*) [[ "$MOCK_FAIL" != build ]] || exit 9 ;;\n *pg_dump*) [[ "$MOCK_FAIL" != backup ]] || exit 8; echo synthetic-database-dump ;;\n *"--entrypoint tar"*) echo synthetic-dkim-archive ;;\nesac\nexit 0\n',{mode:0o755});
 writeFileSync(join(root,'bin/curl'),'#!/bin/bash\nexit 0\n',{mode:0o755});
 const log=join(root,'commands.log');
 return {root,run:(args=[],fail='')=>spawnSync('bash',['scripts/deploy.sh',...args],{cwd:root,encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,MOCK_LOG:log,MOCK_FAIL:fail}}),commands:()=>readFileSync(log,'utf8'),cleanup:()=>rmSync(root,{recursive:true,force:true})};
}

test('deployment preflight and help do not start services or change secrets',()=>{
 const f=fixture();try{assert.equal(f.run(['--help']).status,0);assert.equal(f.run(['--check']).status,0);assert.ok(!f.commands().includes(' up '));assert.ok(!f.commands().includes(' build '));assert.equal(readFileSync(join(f.root,'deploy/secrets/vault_key'),'utf8'),'synthetic-test-value');assert.notEqual(f.run(['--unknown']).status,0);}finally{f.cleanup();}
});
test('deployment backs up data before migration and retains existing keys',()=>{
 const f=fixture();try{const result=f.run(['--skip-host']);assert.equal(result.status,0,result.stderr);const commands=f.commands();assert.ok(commands.indexOf('pg_dump')<commands.indexOf('run --rm -T --no-deps migrate\n'));assert.ok(commands.includes(' up -d --no-build --wait'));assert.equal(readdirSync(join(f.root,'backups')).length,1);assert.equal(readFileSync(join(f.root,'deploy/secrets/vault_key'),'utf8'),'synthetic-test-value');}finally{f.cleanup();}
});
test('failed builds and backups stop deployment before migration',()=>{
 for(const failure of ['build','backup']){const f=fixture();try{assert.notEqual(f.run(['--skip-host'],failure).status,0);assert.ok(!f.commands().includes('run --rm -T --no-deps migrate\n'));assert.ok(!f.commands().includes('up -d --no-build'));}finally{f.cleanup();}}
});
test('initialization retains complete secrets and refuses partial sets',()=>{
 const f=fixture();try{let result=spawnSync('bash',['scripts/init-production.sh'],{cwd:f.root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);rmSync(join(f.root,'deploy/secrets/jwt_secret'));result=spawnSync('bash',['scripts/init-production.sh'],{cwd:f.root,encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(readFileSync(join(f.root,'deploy/secrets/vault_key'),'utf8'),'synthetic-test-value');}finally{f.cleanup();}
});
