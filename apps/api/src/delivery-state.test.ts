import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smtpFailure} from './integrations/delivery-state';
test('SMTP rejection is distinguished from a lost acknowledgement without automatic retries',()=>{
 assert.equal(smtpFailure({responseCode:550}).status,'failed');
 assert.equal(smtpFailure({code:'EAUTH'}).code,'SMTP_AUTH_FAILED');
 assert.equal(smtpFailure({code:'ETIMEDOUT'}).status,'uncertain');
 assert.equal(smtpFailure(new Error('Socket closed')).status,'uncertain');
});
