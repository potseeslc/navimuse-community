import test from 'node:test';
import assert from 'node:assert/strict';
import {repeatMode,nextRepeatControls} from '../shared/repeatMode.js';
import {queueAdvancePlan,endedPlaybackAction,pauseAfterCurrentBoundary} from '../src/playerState.js';
import {buildPersistedQueueState,validatePersistedQueue} from '../src/queueStore.js';
import {remoteControls,advanceRemoteQueue} from '../shared/wiim/contract.js';
import {cacheAheadSongs} from '../src/streamCache.js';
import {applyAppearance} from '../src/appearance.js';
import {accentColors} from '../shared/appearance.js';
import {parseAccountPreferences,defaultAccountPreferences} from '../shared/accountPreferences.js';
const queue={items:Array.from({length:6},(_,i)=>({song:{id:String(i)}})),index:0};
test('repeat cycles off / queue / one, survives restoration, and wraps local and remote queues',()=>{
 let c={shuffle:false,repeat:false};
 for(const expected of ['all','one','off']){c={...c,...nextRepeatControls(c)};assert.equal(repeatMode(c),expected);assert.equal(repeatMode(validatePersistedQueue(buildPersistedQueueState(queue,[],[],c)).controls),expected);assert.equal(repeatMode(remoteControls(c)),expected);}
 assert.equal(repeatMode({repeat:true}),'one');
 const last={...queue,index:5};assert.equal(queueAdvancePlan(last,{}).nextIndex,-1);assert.equal(queueAdvancePlan(last,{repeatAll:true}).nextIndex,0);
 assert.equal(endedPlaybackAction({repeat:true}),'repeat');
 const state={queue:last,controls:{repeatAll:true},pool:[],history:[],generation:1,status:'playing'};
 assert.equal(advanceRemoteQueue(state,{natural:true}).queue.index,0);
 const paused=advanceRemoteQueue({...state,controls:{repeatAll:true,pauseAfterCurrent:true}},{natural:true});assert.equal(paused.status,'paused');assert.equal(paused.queue.index,0);assert.equal(paused.controls.pauseAfterCurrent,false);
 assert.equal(pauseAfterCurrentBoundary({repeatAll:true,pauseAfterCurrent:true},{naturalEnd:true}).controls.repeatAll,true);
});
test('safety cache includes current and bounded upcoming music without advancing queue',()=>{
 assert.deepEqual(cacheAheadSongs(queue,{},[],[],[],{includeCurrent:false,maxUpcoming:3}).map(s=>s.id),['1','2','3']);
 const before=structuredClone(queue);assert.deepEqual(cacheAheadSongs(queue).map(s=>s.id),['0','1','2','3','4','5']);assert.deepEqual(queue,before);
 assert.deepEqual(cacheAheadSongs({...queue,index:5}).map(s=>s.id),['5']);
 assert.deepEqual(cacheAheadSongs({...queue,index:5},{repeatAll:true}).map(s=>s.id),['5','0','1','2','3','4']);
 assert.deepEqual(cacheAheadSongs(queue,{},[],[],['2']).map(s=>s.id),['0','1','3','4','5']);
 const live={items:[{song:{id:'x'}},{song:{id:'radio:test',isRadio:true,streamUrl:'https://radio.example/'}}],index:0};assert.deepEqual(cacheAheadSongs(live).map(s=>s.id),['x']);
 const pool=[5,4,3],history=[2];assert.deepEqual(cacheAheadSongs(queue,{shuffle:true},pool,history).slice(0,4).map(s=>s.id),['0','5','4','3']);assert.deepEqual(pool,[5,4,3]);assert.deepEqual(history,[2]);
 const short={items:Array.from({length:50},(_,i)=>({song:{id:String(i),duration:30}})),index:0};
 assert.equal(cacheAheadSongs(short).length,11);
 const long={...short,items:short.items.map(item=>({song:{...item.song,duration:600}}))};assert.equal(cacheAheadSongs(long).length,4);
});
test('saved preferences migrate older clients and reject invalid library selections/themes',()=>{
 const old=defaultAccountPreferences();delete old.appearance;delete old.library.selectedFolders;const migrated=parseAccountPreferences(old);assert.equal(migrated.appearance.theme,'dark');assert.equal(migrated.library.selectedFolders,null);
 for(const selectedFolders of [[],['1','1'],['../secret'],[2]])assert.throws(()=>parseAccountPreferences({...migrated,library:{...migrated.library,selectedFolders}}));
 assert.throws(()=>parseAccountPreferences({...migrated,appearance:null}));
 assert.throws(()=>parseAccountPreferences({...migrated,appearance:{theme:'auto',accent:'red'}}));
});
const luminance=hex=>hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('all eight accents are legible in both themes and system appearance responds and cleans up',()=>{
 assert.equal(Object.keys(accentColors).length,8);
 for(const color of Object.values(accentColors)){assert.ok(contrast(color.dark,'#080b0f')>=4.5,color.name);assert.ok(contrast(color.light,'#f6f4f0')>=4.5,color.name);assert.ok(contrast(color.light,'#ffffff')>=4.5,color.name);}
 const root={dataset:{},style:{setProperty(k,v){this[k]=v;}}};let callback;
 const media={matches:true,addEventListener(_,fn){callback=fn;},removeEventListener(_,fn){assert.equal(fn,callback);callback=null;}};
 const dispose=applyAppearance({theme:'system',accent:'neutral'},root,media);assert.equal(root.dataset.theme,'dark');media.matches=false;callback();assert.equal(root.dataset.theme,'light');assert.equal(root.style['--nm-accent'],accentColors.neutral.light);dispose();assert.equal(callback,null);
});

test('multiple libraries become repeated Navidrome parameters without changing other query fields',async()=>{
 const {createNavidromeClient}=await import('../server/navidromeClient.mjs');let observed;
 const client=createNavidromeClient({url:'https://music.invalid',username:'fixture',password:'fixture'},{fetchImpl:async url=>{observed=new URL(url);return Response.json({});}});
 for(const method of ['getAlbumList2','search3','getArtists']){
  await client.request(`/rest/${method}.view`,{musicFolderId:'1,2',query:'Artist, Name'});
  assert.deepEqual(observed.searchParams.getAll('musicFolderId'),['1','2']);assert.equal(observed.searchParams.get('query'),'Artist, Name');
 }
 await assert.rejects(client.request('/rest/getArtists.view',{musicFolderId:'1,../2'}));
});
