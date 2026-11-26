import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {plexDiscoveryPackets,startPlexDiscovery} from '../server/plex/discovery.mjs';
const xml='<MediaContainer><Player title="NaviMuse Living &amp; Kitchen" machineIdentifier="navimuse-living"/><Player title="NaviMuse Patio" machineIdentifier="navimuse-patio"/></MediaContainer>';
test('GDM publishes separate validated identities on the shared receiver port',()=>{
 const packets=plexDiscoveryPackets(xml,18099).map(x=>x.toString());assert.equal(packets.length,2);assert.match(packets[0],/Name: NaviMuse Living & Kitchen\r\n/);assert.match(packets[0],/Resource-Identifier: navimuse-living\r\n/);assert.match(packets[1],/Resource-Identifier: navimuse-patio\r\n/);
 assert.equal(plexDiscoveryPackets(xml,80).length,0);assert.equal(plexDiscoveryPackets('<Player title="Injected\nPort: 4" machineIdentifier="bad/id"/>',18099).length,0);
});
test('LAN discovery bounds requests, clears stale advertisements, and shuts down',async()=>{
 const socket=new EventEmitter();const sent=[];socket.bind=()=>{};socket.send=(b,p,a)=>sent.push({text:b.toString(),p,a});socket.close=()=>{};let ok=true;
 const discovery=startPlexDiscovery({port:18099,socket,fetchImpl:async url=>{assert.equal(url,'http://127.0.0.1:18099/resources');return new Response(ok?xml:'',{status:ok?200:503});}});
 await discovery.refresh();const message=Buffer.from('M-SEARCH * HTTP/1.0\r\n\r\n');const peer={address:'192.168.1.42',port:40000};
 socket.emit('message',message,{...peer,address:'8.8.8.8'});socket.emit('message',Buffer.from('garbage'),peer);assert.equal(sent.length,0);
 socket.emit('message',message,peer);assert.equal(sent.length,2);socket.emit('message',message,peer);assert.equal(sent.length,2);
 ok=false;await discovery.refresh();socket.emit('message',message,{...peer,address:'192.168.1.43'});assert.equal(sent.length,2);discovery.close();
});
