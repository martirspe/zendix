import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignSnapshot,signCampaignConfirmation,verifyCampaignConfirmation} from './campaign-send-token';

test('campaign confirmation is bound to tenant, campaign, audience, message, variant and schedule',()=>{
 const key=Buffer.alloc(32,7),now=Date.now();
 const variant={subjectVariant:'Another subject',variantPercent:40},scheduledAt=new Date(now+900000).toISOString();
 const snapshot=campaignSnapshot('tenant-a','campaign-a','News','Preview',{blocks:[]},['list-a'],['contact-a'],scheduledAt,variant);
 const token=signCampaignConfirmation(snapshot,'tenant-a','campaign-a',key,now);
 assert.equal(verifyCampaignConfirmation(token,snapshot,'tenant-a','campaign-a',key,now+1000),true);
 assert.equal(verifyCampaignConfirmation(token,snapshot,'tenant-b','campaign-a',key,now+1000),false);
 assert.notEqual(campaignSnapshot('tenant-a','campaign-a','News','Preview',{blocks:[]},['list-a'],['contact-a'],new Date(now+1200000).toISOString(),variant),snapshot);
 assert.notEqual(campaignSnapshot('tenant-a','campaign-a','News','Preview',{blocks:[]},['list-a'],['contact-a'],scheduledAt,{subjectVariant:'Changed',variantPercent:40}),snapshot);
 assert.equal(verifyCampaignConfirmation(token,campaignSnapshot('tenant-a','campaign-a','Changed','Preview',{blocks:[]},['list-a'],['contact-a']),'tenant-a','campaign-a',key,now+1000),false);
 assert.equal(verifyCampaignConfirmation(token,snapshot,'tenant-a','campaign-a',key,now+601000),false);
});
