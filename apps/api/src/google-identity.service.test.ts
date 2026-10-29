import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {UnauthorizedException} from '@nestjs/common';
import {GoogleIdentityService} from './google-identity.service';

test('Google Identity tokens require a valid signature, audience, issuer and verified email',async()=>{
 const previousFetch=globalThis.fetch,previousEnabled=process.env['GOOGLE_OAUTH_ENABLED'],previousClientId=process.env['GOOGLE_CLIENT_ID'];
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),keyId='zendix-test-key',clientId='zendix-test-client';
 process.env['GOOGLE_OAUTH_ENABLED']='true';process.env['GOOGLE_CLIENT_ID']=clientId;
 globalThis.fetch=async()=>new Response(JSON.stringify({keys:[{...publicKey.export({format:'jwk'}),kid:keyId,alg:'RS256',use:'sig'}]}),{status:200,headers:{'content-type':'application/json','cache-control':'public, max-age=300'}});
 const service=new GoogleIdentityService(),now=Math.floor(Date.now()/1000);
 const token=(overrides:Record<string,unknown>={},corruptSignature=false)=>{const header=Buffer.from(JSON.stringify({alg:'RS256',kid:keyId,typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:clientId,sub:'google-subject',email:'owner@example.com',email_verified:true,given_name:'Owner',family_name:'Account',iat:now,exp:now+300,...overrides})).toString('base64url'),input=header+'.'+payload,signature=sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');return input+'.'+(corruptSignature?'AA'+signature.slice(2):signature);};
 try{
  const profile=await service.verifyIdToken(token());assert.deepEqual(profile,{sub:'google-subject',email:'owner@example.com',firstName:'Owner',lastName:'Account'});
  await assert.rejects(service.verifyIdToken(token({aud:'another-client'})),UnauthorizedException);
  await assert.rejects(service.verifyIdToken(token({email_verified:false})),UnauthorizedException);
  await assert.rejects(service.verifyIdToken(token({exp:now-60})),UnauthorizedException);
  await assert.rejects(service.verifyIdToken(token({},true)),UnauthorizedException);
 }finally{globalThis.fetch=previousFetch;if(previousEnabled===undefined)delete process.env['GOOGLE_OAUTH_ENABLED'];else process.env['GOOGLE_OAUTH_ENABLED']=previousEnabled;if(previousClientId===undefined)delete process.env['GOOGLE_CLIENT_ID'];else process.env['GOOGLE_CLIENT_ID']=previousClientId;}
});
