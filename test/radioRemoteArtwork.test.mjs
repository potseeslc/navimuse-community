import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{runInNewContext}from'node:vm';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const effect=source.slice(source.indexOf('  const [radioNow,setRadioNow]'),source.indexOf('  remoteAuthorityRef.current=wiim;'));
const display=source.slice(source.indexOf('  const displayedSong='),source.indexOf('  const isPlaying=remoteSession?'));
test('radio metadata follows the remote station and ignores a late response after a station switch',async()=>{
 let finish,cleanup;const updates=[],paths=[];
 runInNewContext(effect,{offline:false,localNowPlaying:{id:'radio:old-local'},wiimState:{session:{id:'speaker',song:{id:'radio:remote'}}},AbortController,
 useState:()=>[null,x=>updates.push(x)],useEffect:fn=>{cleanup=fn();},window:{setInterval:()=>1,clearInterval(){}},
 protectedApiFetch:path=>{paths.push(path);return new Promise(r=>finish=r);}});
 assert.deepEqual(paths,['/api/navidrome/radios/remote/metadata']);cleanup();finish({ok:true,json:async()=>({artwork:'/api/navidrome/radios/remote/artwork?v=old'})});
 await new Promise(r=>setImmediate(r));assert.deepEqual(updates,[]);
});
test('remote artwork keeps Navidrome cover art and only applies matching live metadata',()=>{
 const context={remoteSession:{song:{id:'radio:current',coverArt:'ra-current'},delivery:{}},localNowPlaying:{id:'radio:local'},settingsState:{preferences:{library:{artworkSize:300}}},normalizeSong:s=>({id:s.id,artwork:'/cover/'+s.coverArt}),apiRequestUrl:p=>p};
 let result=runInNewContext(display+';nowPlaying',{...context,radioNow:{id:'radio:old',artwork:'/stale'}});assert.equal(result.artwork,'/cover/ra-current');
 result=runInNewContext(display+';nowPlaying',{...context,radioNow:{id:'radio:current',artwork:'/live',title:'Current broadcast',history:[]}});assert.equal(result.artwork,'/live');assert.equal(result.radioTitle,'Current broadcast');
});
