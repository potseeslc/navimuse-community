import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createBridgeDevice,createHostBridgeHandler} from '../server/wiim/hostBridge.mjs';
const key='a'.repeat(64),device={id:'bedroom',uuid:'uuid:12345678-1234-1234-1234-123456789012',name:'Bedroom',address:'192.168.1.12',certificateSha256:Array(32).fill('AB').join(':')};
async function fixture(t){
 const calls=[];let current=device;
 const server=createServer(createHostBridgeHandler({key,mediaBaseUrl:'http://192.168.1.242:8099',devices:()=>[current],deviceFor:d=>({topology:async()=>({id:d.id,name:d.name,address:d.address}),load:async data=>calls.push(data),prepareNext:async data=>calls.push(data),clearNext:async()=>calls.push('clearNext'),queuedMedia:async()=>({uri:'current',nextUri:'next'}),delivery:async value=>{calls.push(value);return {sampleRate:44100,bitDepth:16};},readVolume:async()=>{calls.push('readVolume');return 37;},stop:async()=>calls.push('stop'),seek:async n=>calls.push(n)})}));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 return {calls,origin,client:createBridgeDevice(device,{origin,key}),move(){current={...device,address:'192.168.1.13'};},post:body=>fetch(origin+'/command',{method:'POST',headers:{authorization:`Bearer ${key}`},body:JSON.stringify(body)})};
}
test('host transport requires its private key and discovers the current speaker address by UUID',async t=>{
 const f=await fixture(t);assert.equal((await fetch(f.origin+'/command')).status,401);
 assert.equal((await f.client.topology()).address,'192.168.1.12');f.move();assert.equal((await f.client.topology()).address,'192.168.1.13');
 for(const action of ['arbitraryCommand','toString','constructor','__proto__'])assert.equal((await f.post({uuid:device.uuid,action})).status,404);
 assert.equal((await f.post({uuid:'unknown',action:'stop'})).status,404);assert.deepEqual(f.calls,[]);
});
test('host transport accepts only BFF media grants and bounded transport values',async t=>{
 const f=await fixture(t),prefix='http://192.168.1.242:8099/media/wiim/'+'b'.repeat(32);
 const value={song:{title:'Song',artist:'Artist',album:'Album',duration:100},uri:prefix+'/audio',art:prefix+'/art.jpg'};
 await f.client.load(value);assert.equal(f.calls.length,1);assert.equal(f.calls[0].uri,value.uri);
 for(const uri of ['http://192.168.1.10/private',value.uri+'?url=secret','http://user@192.168.1.242:8099/media/wiim/'+'b'.repeat(32)+'/audio'])await assert.rejects(f.client.load({...value,uri}),/Invalid media/);
 await assert.rejects(f.client.seek(-1),/Invalid position/);assert.equal(f.calls.length,1);
 await f.client.stop();assert.equal(f.calls.at(-1),'stop');
});

test('receiver metadata crosses the private bridge only for validated media grants',async t=>{
 const f=await fixture(t),prefix='http://192.168.1.242:8099/media/wiim/'+'b'.repeat(32);
 const value={uri:prefix+'/audio',art:prefix+'/art.jpg'};
 assert.deepEqual(await f.client.delivery(value),{sampleRate:44100,bitDepth:16});
 assert.deepEqual(f.calls,[value]);
 await assert.rejects(f.client.delivery({...value,uri:'http://untrusted.test/audio'}),/Invalid media/);
 await assert.rejects(f.client.delivery({...value,art:value.art+'?token=other'}),/Invalid media/);
 assert.equal(f.calls.length,1);
});

test('initial receiver volume crosses the authenticated bridge without a write',async t=>{
 const f=await fixture(t);assert.equal(await f.client.readVolume(),37);assert.deepEqual(f.calls,['readVolume']);
});


test('host bridge preserves a validated live-radio marker for receiver metadata',async t=>{
 const f=await fixture(t),prefix='http://192.168.1.242:8099/media/wiim/'+'b'.repeat(32);
 const value={song:{title:'Radio',duration:0,isRadio:true},uri:prefix+'/audio',art:prefix+'/art.jpg'};
 await f.client.load(value);assert.equal(f.calls[0].song.isRadio,true);
 await assert.rejects(f.client.load({...value,song:{...value.song,isRadio:'true'}}),/Invalid radio metadata/);
 assert.equal(f.calls.length,1);
});

test('prepared tracks cross the bridge with the same media authorization as current tracks',async t=>{
 const f=await fixture(t),prefix='http://192.168.1.242:8099/media/wiim/'+'c'.repeat(32);
 const value={song:{title:'Next',duration:100},uri:prefix+'/audio',art:prefix+'/art.jpg'};
 await f.client.prepareNext(value);assert.equal(f.calls[0].uri,value.uri);
 await assert.rejects(f.client.prepareNext({...value,uri:'http://example.com/arbitrary'}),/Invalid media/);
 await assert.rejects(f.client.prepareNext({...value,song:{title:'x'.repeat(1025)}}),/Invalid metadata/);
 assert.equal(f.calls.length,1);await f.client.clearNext();assert.equal(f.calls.at(-1),'clearNext');
 assert.deepEqual(await f.client.queuedMedia(),{uri:'current',nextUri:'next'});
});
