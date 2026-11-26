import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountSessionClient} from '../src/services/accountSessionService.js';
import {createAccountAccessController} from '../src/services/accountAccessController.js';
import {createAccountSessionNotices} from '../src/services/accountSessionNotices.js';

const out={version:'navimuse-account/v1',mode:'local',state:'signed-out',methods:{password:true,passkey:false,oidc:false},account:null,session:null,queueScope:null};
const inside={...out,state:'authenticated',account:{id:'10000000-0000-4000-8000-000000000001',username:'owner',displayName:'Owner',roles:['owner','listener']},session:{authenticatedAt:100,expiresAt:200,deviceId:null},queueScope:'queue-scope-v2:'+'a'.repeat(64)};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function channels() {
  const active=new Set(),sent=[];
  return {active,sent,factory(name) {
    const channel={name,onmessage:null,close(){active.delete(channel);},postMessage(data){
      sent.push(data);
      for(const peer of active)if(peer!==channel && peer.name===name)queueMicrotask(()=>{if(active.has(peer))peer.onmessage?.({data});});
    }};
    active.add(channel);return channel;
  }};
}

test('successful cross-tab logout reconciles server state without renewal; failed logout sends no notice',async()=>{
  const bus=channels();let current=inside,failLogout=false,tail=Promise.resolve();const requests=[];
  const locks={request(_name,_options,run){const next=tail.then(run);tail=next.catch(()=>{});return next;}};
  const fetchImpl=async url=>{
    const path=url.split('/').at(-1);requests.push(path);
    if(path==='logout') {if(failLogout)return Response.json({code:'ACCOUNT_UNAVAILABLE'},{status:503});current=out;return Response.json({ok:true});}
    assert.equal(path,'session','a logout notice must not renew remembered sessions');
    return Response.json(current);
  };
  const clients=[0,1].map(()=>createAccountSessionClient({baseUrl:'https://fixture.test/api/auth/v1',fetchImpl,locks,channelFactory:bus.factory}));
  const controllers=clients.map(createAccountAccessController);
  try {
    for(const c of controllers){c.activate();await c.check();}
    failLogout=true;assert.equal(await controllers[0].logout(),false);await tick();
    assert.equal(bus.sent.length,0);assert.deepEqual(controllers[1].getSnapshot().session,inside);
    failLogout=false;assert.equal(await controllers[0].logout(),true);await tick();
    assert.deepEqual(controllers[1].getSnapshot().session,out);
    assert.deepEqual(bus.sent,[{version:1,type:'session-changed'}]);
    assert.equal(requests.includes('refresh'),false);
  } finally {controllers.forEach(c=>c.dispose());}
  assert.equal(bus.active.size,0);
});

test('a session notice uses server identity, retains state on transport failure and ignores stale results',async()=>{
  let notify,fail=false,release;const other={...inside,account:{...inside.account,id:'20000000-0000-4000-8000-000000000002'}};
  let read=async()=>inside;
  const c=createAccountAccessController({subscribeSessionChanges:fn=>{notify=fn;return()=>{notify=null;};},readSession:()=>{if(fail)throw new Error('offline');return read();},login:async()=>other});
  c.activate();await c.check();
  fail=true;notify();await tick();assert.deepEqual(c.getSnapshot().session,inside);
  fail=false;read=()=>new Promise(resolve=>{release=resolve;});notify();
  await c.login({});release(out);await tick();assert.deepEqual(c.getSnapshot().session,other);
  c.dispose();assert.equal(notify,null);
  read=async()=>out;c.activate();notify();await tick();assert.deepEqual(c.getSnapshot().session,out);c.dispose();
});

test('notices isolate BFF configurations, reject extra identity fields, and tolerate unavailable channels',async()=>{
  const bus=channels();let calls=0;
  const a=createAccountSessionNotices('one',bus.factory),b=createAccountSessionNotices('two',bus.factory);
  const stop=a.subscribe(()=>calls++);b.publish();await tick();assert.equal(calls,0);
  const injected=bus.factory('one');injected.postMessage({version:1,type:'session-changed',account:inside.account});await tick();assert.equal(calls,0);
  injected.postMessage({version:1,type:'session-changed'});await tick();assert.equal(calls,1);
  injected.close();stop();assert.equal(bus.active.size,0);
  const unavailable=createAccountSessionNotices('one',()=>{throw new Error('unavailable');});
  const off=unavailable.subscribe(()=>{});assert.doesNotThrow(()=>unavailable.publish());off();
});

test('only a validated successful login broadcasts a credential-free notice',async()=>{
  const bus=channels();let reply=Response.json({code:'INVALID_CREDENTIALS'},{status:401});
  const client=createAccountSessionClient({baseUrl:'https://fixture.test/api/auth/v1',channelFactory:bus.factory,
    locks:{request:(_name,_options,run)=>run()},fetchImpl:async()=>reply});
  const fields={username:'owner',password:'disposable password',remember:true};
  await assert.rejects(client.login(fields));assert.equal(bus.sent.length,0);
  reply=Response.json({...inside,password:'unexpected'});
  await assert.rejects(client.login(fields));assert.equal(bus.sent.length,0);
  reply=Response.json(inside);await client.login(fields);
  assert.deepEqual(bus.sent,[{version:1,type:'session-changed'}]);assert.equal(bus.active.size,0);
});
