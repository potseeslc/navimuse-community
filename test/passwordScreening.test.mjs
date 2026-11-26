import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPasswordScreener } from '../server/passwordScreening.mjs';
import { createPasswordService } from '../server/passwordCredentials.mjs';
const password='Synthetic screening passphrase';
const digest=createHash('sha1').update(password).digest('hex').toUpperCase();

test('screening sends only a five-character prefix and treats padding as non-breached', async () => {
  let count=0;
  const screen=createPasswordScreener({fetchImpl:async (url,options)=>{
    assert.equal(url,`https://api.pwnedpasswords.com/range/${digest.slice(0,5)}`);
    assert.equal(options.body,undefined);assert.equal(options.redirect,'error');
    assert.equal(options.headers['Add-Padding'],'true');assert.ok(options.signal);
    assert.equal(JSON.stringify(options).includes(password),false);
    return new Response(`${digest.slice(5)}:${count}\r\n${'A'.repeat(35)}:0\r\n`);
  }});
  assert.equal(await screen(password),'allowed');count=2;
  assert.equal(await screen(password),'compromised');
});

test('screening fails closed on outages, malformed data, oversized bodies, and cancellation', async () => {
  for (const response of [()=>new Response('',{status:503}),()=>new Response(''),()=>new Response('invalid response'),()=>new Response('A'.repeat(131073))]) {
    assert.equal(await createPasswordScreener({fetchImpl:async()=>response()})(password),'unavailable');
  }
  const controller=new AbortController();
  const screen=createPasswordScreener({fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('request failed')),{once:true}))});
  const pending=screen(password,{signal:controller.signal});controller.abort();
  assert.equal(await pending,'unavailable');
  let calls=0;const invalid=createPasswordScreener({fetchImpl:()=>{calls++;throw new Error('unexpected fetch');}});
  assert.equal(await invalid('short'),'invalid');assert.equal(await invalid('x'.repeat(1025)),'invalid');assert.equal(calls,0);
});

test('enrollment requires a successful screening decision while login verification remains independent', async () => {
  let outcome='compromised',calls=0;
  const service=await createPasswordService({screenPassword:async()=>{calls++;return outcome;}});
  await assert.rejects(service.enrollPassword(password),{code:'PASSWORD_COMPROMISED'});
  outcome='unavailable';await assert.rejects(service.enrollPassword(password),{code:'PASSWORD_SCREENING_UNAVAILABLE'});
  outcome='allowed';const record=await service.enrollPassword(password);
  outcome='unavailable';assert.equal(await service.verifyPassword(record,password),true);
  assert.equal(calls,3,'Login never calls the enrollment-only screening provider');
});

test('screening bounds outstanding requests and releases capacity after completion', async () => {
  const resolve=[];
  const screen=createPasswordScreener({fetchImpl:()=>new Promise(done=>resolve.push(done))});
  const first=screen(password),second=screen(password);
  assert.equal(await screen(password),'unavailable');assert.equal(resolve.length,2);
  resolve[0](new Response(`${'A'.repeat(35)}:0`));resolve[1](new Response(`${digest.slice(5)}:2`));
  assert.deepEqual(await Promise.all([first,second]),['allowed','compromised']);
  const next=screen(password);assert.equal(resolve.length,3);resolve[2](new Response(`${'A'.repeat(35)}:0`));
  assert.equal(await next,'allowed');
});

test('a cancelled screening cannot grant enrollment after a completed response', async () => {
  const controller=new AbortController();let calls=0;
  const screen=createPasswordScreener({fetchImpl:async()=>{calls++;controller.abort();return new Response(`${'A'.repeat(35)}:0`);}});
  assert.equal(await screen(password,{signal:controller.signal}),'unavailable');
  assert.equal(await screen(password,{signal:controller.signal}),'unavailable');
  assert.equal(calls,1,'An already cancelled attempt does not start another lookup');
});

test('the deadline cancels a stalled native fetch body and releases screening capacity', {timeout:10000}, async t => {
  const {createServer}=await import('node:http');const {once}=await import('node:events');
  let stalled=true;
  const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.write(`${'A'.repeat(35)}:0\r\n`);if(!stalled)res.end();});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const screen=createPasswordScreener({fetchImpl:(_url,options)=>fetch(`http://127.0.0.1:${server.address().port}`,options)});
  assert.equal(await screen(password),'unavailable','A response which never ends must hit the five-second deadline');
  stalled=false;assert.equal(await screen(password),'allowed','Capacity is usable after timeout cleanup');
});
