import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSpfBudget} from './integrations/spf-budget';
test('SPF preflight counts nested references and refuses lookup overflow, cycles and dynamic references',async()=>{
 const records:Record<string,string[]>={'relay.mailchannels.net':['v=spf1 include:edge.example.com -all'],'edge.example.com':['v=spf1 ip4:192.0.2.0/24 -all']};
 assert.equal(await validateSpfBudget('v=spf1 include:relay.mailchannels.net -all',async name=>records[name]??[]),2);
 await assert.rejects(validateSpfBudget('v=spf1 '+Array.from({length:11},()=> 'a').join(' ')+' -all',async()=>[]));
 await assert.rejects(validateSpfBudget('v=spf1 include:loop.example.com -all',async()=>['v=spf1 include:loop.example.com -all']));
 await assert.rejects(validateSpfBudget('v=spf1 include:%{i}.example.com -all',async()=>[]));
});
