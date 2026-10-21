import assert from 'node:assert/strict';
import test from 'node:test';
import { publicApplicationOrigin } from './runtime';

test('public application origins support provisional domains and local development without accepting unsafe URLs',()=>{
 const previousOrigin=process.env['APP_PUBLIC_URL'],previousMode=process.env['NODE_ENV'];
 try {
  process.env['NODE_ENV']='development';
  for(const origin of ['https://app.zendix.site','http://localhost:4200']){process.env['APP_PUBLIC_URL']=origin;assert.equal(publicApplicationOrigin(),origin);}
  for(const origin of ['http://zendix.site','https://user:password@zendix.site','https://app.zendix.site/path','https://app.zendix.site?token=value','https://app.zendix.site/#fragment']){process.env['APP_PUBLIC_URL']=origin;assert.throws(()=>publicApplicationOrigin());}
  process.env['NODE_ENV']='production';process.env['APP_PUBLIC_URL']='http://localhost:4200';assert.throws(()=>publicApplicationOrigin());
  process.env['APP_PUBLIC_URL']='https://app.zendix.site/';assert.equal(publicApplicationOrigin(),'https://app.zendix.site');
 }finally{if(previousOrigin===undefined)delete process.env['APP_PUBLIC_URL'];else process.env['APP_PUBLIC_URL']=previousOrigin;if(previousMode===undefined)delete process.env['NODE_ENV'];else process.env['NODE_ENV']=previousMode;}
});
