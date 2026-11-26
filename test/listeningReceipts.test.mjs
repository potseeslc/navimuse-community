import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createListeningReceipts} from '../server/listeningReceipts.mjs';
import {createNativeListeningReporter} from '../src/nativeListeningReports.js';
const event={id:'11111111-1111-4111-8111-111111111111',songId:'song',time:1000,scope:'a'};
test('receipt retries serialize, survive restart and remain account scoped',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nm-receipts-'));try{
 let count=0;const send=async e=>{assert.equal(e.time,1000);count++;};const submit=createListeningReceipts(dir);
 await Promise.all([submit('a',event,send),submit('a',event,send)]);assert.equal(count,1);
 await createListeningReceipts(dir)('a',event,send);assert.equal(count,1);
 await submit('b',event,send);assert.equal(count,2);
 await assert.rejects(submit('a',{...event,songId:'changed'},send),{status:409});
 const other={...event,id:'22222222-2222-4222-8222-222222222222'};
 await assert.rejects(submit('a',other,async()=>{throw Error('offline');}));await submit('a',other,send);assert.equal(count,3);
 await assert.rejects(submit('a',{...event,time:Date.now()+999999},send),{status:400});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('native outbox is acknowledged only after matching server receipt, retries after failure',async()=>{
 let pending=[event],fail=true,posts=0;const transport={request:async message=>{if(message.action==='listening.pending')return pending;if(message.action==='listening.ack')pending=pending.filter(e=>e.id!==message.id);}};
 const reporter=createNativeListeningReporter({transport,scope:'a',fetchFn:async()=>{posts++;return fail?{ok:false,status:503}:{ok:true,json:async()=>({ok:true,id:event.id})};}});
 await reporter.flush();assert.equal(pending.length,1);fail=false;await reporter.flush();assert.equal(pending.length,0);assert.equal(posts,2);
 reporter.stop();await reporter.flush();assert.equal(posts,2);
});
test('account mismatch never posts and stopped in-flight uploads never acknowledge',async()=>{
 let posts=0,acks=0,resolve;const transport={request:async m=>{if(m.action==='listening.pending')return [event];if(m.action==='listening.ack')acks++;}};
 await createNativeListeningReporter({transport,scope:'b',fetchFn:async()=>posts++}).flush();assert.equal(posts,0);
 const reporter=createNativeListeningReporter({transport,scope:'a',fetchFn:async()=>new Promise(r=>{resolve=r;})});
 const work=reporter.flush();await new Promise(r=>setImmediate(r));reporter.stop();resolve({ok:true,json:async()=>({ok:true,id:event.id})});await work;assert.equal(acks,0);
});
