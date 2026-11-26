import test from 'node:test';
import assert from 'node:assert/strict';
import {accountRecoveryClient as client} from '../src/services/accountRecoveryClient.js';
const id='00000000-0000-4000-8000-000000000001',code='r1.'+'A'.repeat(43);
test('recovery client sends body-only secrets, projects replies and masks unknown failures',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({code,expiresAt:Date.now()+60000,privateValue:'discard'});};
 const result=await client.issue(id);assert.deepEqual(Object.keys(result).sort(),['code','expiresAt']);assert.equal(calls[0].init.body,'{}');assert.equal(calls[0].init.cache,'no-store');assert.equal(calls[0].init.redirect,'error');
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({ok:true,next:'sign-in',privateValue:'discard'});};
 assert.deepEqual(await client.redeem({code,password:'  Exact replacement password  '}),{ok:true});assert(!String(calls[1].url).includes(code));assert.deepEqual(JSON.parse(calls[1].init.body),{code,password:'  Exact replacement password  '});
 globalThis.fetch=async()=>Response.json({code:'private-secret-code'},{status:503});
 await assert.rejects(client.issue(id),e=>e.code===''&&!e.message.includes('private'));
 globalThis.fetch=async()=>Response.json({code,expiresAt:Date.now()-1});await assert.rejects(client.issue(id),/Unconfirmed/);
 const abort=new AbortController();abort.abort();let sent=false;globalThis.fetch=async()=>{sent=true;return Response.json({});};await assert.rejects(client.issue(id,{signal:abort.signal}));assert.equal(sent,false);
});
