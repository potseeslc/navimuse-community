import test from 'node:test';
import assert from 'node:assert/strict';
import {remoteNowPlayingAttributes, remoteNowPlayingPublication} from '../shared/wiim/remoteNowPlaying.js';
const session = () => ({id:'12345678-1234-1234-1234-123456789abc',revision:4,status:'playing',updatedAt:1000,
  device:{id:'living-room',name:'Living Room',address:'private'},song:{id:'song',title:'Title',coverArt:'cover',streamUrl:'secret'},
  duration:120,position:14,queue:{index:0,items:[{},{}]},principal:{token:'secret'}});
test('publishes only presentation fields and controls supported by the queue',()=>{
 const value=remoteNowPlayingAttributes(session(),{observedAt:0});
 assert.equal(value.timestamp,'1970-01-01T00:00:00.000Z');
 assert.equal(value.canNext,true);assert.equal(value.canPrevious,true);assert.equal(value.canSeek,true);
 assert.equal(JSON.stringify(value).includes('secret'),false);assert.equal(JSON.stringify(value).includes('private'),false);
});
test('station changes keep speaker session identity and use radio artwork without seek',()=>{
 const s=session();s.queue.internetRadio=true;s.song={id:'radio:1',coverArt:'ra-cover-1'};
 const before=remoteNowPlayingAttributes(s);s.song={id:'radio:2',coverArt:'ra-cover-2'};s.revision++;
 const after=remoteNowPlayingAttributes(s);
 assert.equal(after.id,before.id);assert.equal(after.deviceID,before.deviceID);assert.equal(after.artworkID,'ra-cover-2');
 assert.equal(after.duration,null);assert.equal(after.elapsedTime,0);
 assert.equal(after.canNext,false);assert.equal(after.canPrevious,false);assert.equal(after.canSeek,false);
});
test('release, external takeover, error, end and local ownership remove presentation',()=>{
 for(const status of ['released','external','error','ended'])assert.equal(remoteNowPlayingAttributes({...session(),status}),null);
 assert.equal(remoteNowPlayingAttributes(null),null);
});
test('buffering remains visible without falsely presenting playing or enabling seek',()=>{
 const value=remoteNowPlayingAttributes({...session(),status:'buffering',position:Infinity});
 assert.equal(value.status,'buffering');assert.equal(value.elapsedTime,0);assert.equal(value.canSeek,false);
});
test('malformed active state fails instead of inventing a new identity',()=>{
 assert.throws(()=>remoteNowPlayingAttributes({...session(),id:'bad'}),TypeError);
 assert.throws(()=>remoteNowPlayingAttributes({...session(),revision:NaN}),TypeError);
});

test('temporary reconnect and station loading preserve the system session',()=>{
 for(const status of ['starting','reconnecting','unreachable'])assert.deepEqual(remoteNowPlayingPublication({...session(),status}),{kind:'retain'});
 assert.deepEqual(remoteNowPlayingPublication(null,{fetchFailed:true}),{kind:'retain'});
 assert.deepEqual(remoteNowPlayingPublication(null),{kind:'end'});
 assert.throws(()=>remoteNowPlayingPublication(undefined));
 assert.throws(()=>remoteNowPlayingPublication({...session(),status:'unknown'}));
});
test('timestamps retain the server observation and radio uses live content',()=>{
 const s=session();assert.equal(remoteNowPlayingPublication(s).attributes.timestamp,'1970-01-01T00:00:01.000Z');
 s.queue.internetRadio=true;assert.equal(remoteNowPlayingAttributes(s).mediaKind,'radio');
 assert.throws(()=>remoteNowPlayingAttributes({...s,updatedAt:undefined}));
 assert.throws(()=>remoteNowPlayingAttributes(s,{observedAt:1e100}));
});
