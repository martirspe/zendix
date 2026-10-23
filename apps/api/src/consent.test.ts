import test from 'node:test';
import assert from 'node:assert/strict';
import {hasRecordedConsent} from './consent';

test('campaign consent requires an explicit operator record',()=>{
 assert.equal(hasRecordedConsent({consent:{source:'operator_confirmation',recordedAt:'2026-10-23T12:00:00.000Z',userId:'user-1'}}),true);
 assert.equal(hasRecordedConsent({consent:{source:'csv_operator_confirmation',recordedAt:'2026-10-23T12:00:00.000Z',userId:'user-1'}}),true);
 assert.equal(hasRecordedConsent({consent:true}),false);
 assert.equal(hasRecordedConsent({consent:{source:'imported',recordedAt:'2026-10-23T12:00:00.000Z',userId:'user-1'}}),false);
 assert.equal(hasRecordedConsent({consent:{source:'operator_confirmation',recordedAt:'not-a-date',userId:'user-1'}}),false);
 assert.equal(hasRecordedConsent({consent:{source:'operator_confirmation',recordedAt:'2026-10-23T12:00:00.000Z'}}),false);
 assert.equal(hasRecordedConsent(null),false);
});
