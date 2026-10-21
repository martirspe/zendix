import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
if(process.env.DATABASE_PASSWORD_FILE){
 const password=readFileSync(process.env.DATABASE_PASSWORD_FILE,'utf8').trim();
 process.env.DATABASE_URL='postgresql://'+encodeURIComponent(process.env.DATABASE_USER??'mailcraft')+':'+encodeURIComponent(password)+'@'+(process.env.DATABASE_HOST??'postgres')+':5432/'+(process.env.DATABASE_NAME??'mailcraft');
}
const child=spawn(process.execPath,process.argv.slice(2),{env:process.env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
