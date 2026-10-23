import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshSignatureInput} from './integrations/mailchannels-webhook.controller';
import {providerEventKey} from './integrations/provider-webhook.service';

test('MailChannels webhook signatures must be fresh and include a created parameter',()=>{
 const now=1_800_000_000_000;
 assert.equal(freshSignatureInput('sig_1=("content-digest");created=1800000000;alg="ed25519";keyid="key-1"',now),true);
 assert.equal(freshSignatureInput('sig_1=("content-digest");created=1799999699;alg="ed25519";keyid="key-1"',now),false);
 assert.equal(freshSignatureInput('sig_1=("content-digest");created=1800000031;alg="ed25519";keyid="key-1"',now),false);
 assert.equal(freshSignatureInput('sig_1=("content-digest");alg="ed25519";keyid="key-1"',now),false);
});

test('provider event idempotency keys bind the account and complete event payload',()=>{
 const event={email:'sender@example.com',customer_handle:'account-a',timestamp:1800000000,event:'hard-bounced',request_id:'request-a'};
 const first=providerEventKey('account-a',event);
 assert.equal(providerEventKey('account-a',event),first);
 assert.notEqual(providerEventKey('account-b',event),first);
 assert.notEqual(providerEventKey('account-a',{...event,event:'complained'}),first);
});
