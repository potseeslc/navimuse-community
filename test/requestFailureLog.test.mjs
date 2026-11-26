import test from 'node:test';
import assert from 'node:assert/strict';
import {requestFailureLog} from '../server/requestFailureLog.mjs';
test('ordinary failure logs never read untrusted exception text or emit request content',()=>{
 const error={status:502,get message(){throw new Error('message must not be inspected');},get stack(){throw new Error('stack must not be inspected');},url:'https://user:secret@example.test/private-track',response:{password:'private'}};
 assert.equal(requestFailureLog(error),'NaviMuse request failed (HTTP 502).');
 assert.equal(requestFailureLog({status:'500\nAuthorization: secret',message:'private listening history'}),'NaviMuse request failed (HTTP 500).');
 assert.equal(requestFailureLog(null),'NaviMuse request failed (HTTP 500).');
});

test('failure categories identify album pagination without logging account or library details',()=>{
 assert.equal(requestFailureLog({status:504},'/api/navidrome/library/albums?accountScope=private&musicFolderId=personal'),'NaviMuse request failed (HTTP 504) [album-page].');
 assert.equal(requestFailureLog({status:502},'/api/navidrome/cover/private-song?token=secret'),'NaviMuse request failed (HTTP 502).');
});
