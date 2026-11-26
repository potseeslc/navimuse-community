import test from 'node:test';
import assert from 'node:assert/strict';
const w=new EventTarget();w.location={href:'https://navimuse.example.com/'};globalThis.window=w;
const {NativeAudioDeck,bindNativeAudioActions,publishNativeMetadata,nativeAudioTransport,nativeAudioDiagnosticSnapshot}=await import('../src/nativeAudio.js');
function transport(){const messages=[];return {version:1,messages,request(message){messages.push(message);return Promise.resolve(true);}};}
function event(detail){w.dispatchEvent(new CustomEvent('navimuse-native-audio',{detail}));}
test('browser is unchanged without an injected native transport',()=>{assert.equal(nativeAudioTransport(),null);});
test('radio native metadata uses the current broadcast title, station identity and authenticated art',()=>{
 const t=transport();w.__nmAudioTransport=t;
 try {
  const station={id:'radio:1',title:'Deep Space One',artist:'Internet Radio',album:'Internet Radio',radioTitle:'Artist - Song',artwork:'/api/navidrome/radios/1/artwork?v=one'};
  publishNativeMetadata(station);
  assert.deepEqual(t.messages.at(-1).metadata,{title:'Artist - Song',artist:'Deep Space One',album:'Internet Radio',live:true,artwork:'https://navimuse.example.com/api/navidrome/radios/1/artwork?v=one'});
  publishNativeMetadata({...station,radioTitle:''});assert.equal(t.messages.at(-1).metadata.title,'Deep Space One');
  publishNativeMetadata({id:'track',title:'Album song',artist:'Artist'});assert.equal(t.messages.at(-1).metadata.live,false);
  publishNativeMetadata(null);assert.deepEqual(t.messages.at(-1).metadata,{});
 }finally{delete w.__nmAudioTransport;}
});
test('native track states update only their matching deck generation',async()=>{
 const t=transport(),deck=new NativeAudioDeck(0,t);let playing=0;deck.addEventListener('playing',()=>playing++);
 deck.src='/api/navidrome/stream/one';deck.load();await deck.play();
 assert.equal(t.messages[0].url,'https://navimuse.example.com/api/navidrome/stream/one');
 event({deck:0,generation:1,type:'loadedmetadata',duration:100,time:0,paused:true});
 event({deck:0,generation:1,type:'playing',duration:100,time:20,paused:false});assert.equal(playing,1);assert.equal(deck.currentTime,20);assert.equal(deck.paused,false);assert.equal(deck.seekable.end(0),100);
 deck.src='/api/navidrome/stream/two';deck.load();event({deck:0,generation:1,type:'ended',time:100});assert.equal(deck.ended,false);assert.equal(deck.currentTime,0);
 event({deck:0,generation:2,type:'loadedmetadata',duration:200,time:0,paused:true});deck.currentTime=25;assert.equal(t.messages.at(-1).action,'seek');assert.equal(t.messages.at(-1).time,25);deck.dispose();
});
test('pause during authenticated load cancels the pending play request',async()=>{
 let resolve;const t=transport();t.request=message=>{t.messages.push(message);return message.action==='load'?new Promise(r=>resolve=r):Promise.resolve(true);};
 const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.load();const playing=deck.play();deck.pause();resolve(true);await assert.rejects(playing,{name:'AbortError'});assert.equal(t.messages.some(x=>x.action==='play'),false);deck.dispose();
});
test('a superseded load failure does not mark the current song failed',async()=>{
 let reject,first=true;const t=transport();t.request=message=>message.action==='load'&&first?(first=false,new Promise((_,r)=>reject=r)):Promise.resolve(true);
 const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.load();deck.src='/api/navidrome/stream/two';deck.load();reject(new Error('obsolete'));await new Promise(r=>setImmediate(r));assert.equal(deck.error,null);deck.dispose();
});
test('remote track actions enter the existing queue once and cleanup disables them',()=>{
 const t=transport();w.__nmAudioTransport=t;let next=0;const cleanup=bindNativeAudioActions({nexttrack:()=>next++});
 event({type:'command',action:'nexttrack'});assert.equal(next,1);cleanup();event({type:'command',action:'nexttrack'});assert.equal(next,1);assert.equal(t.messages.filter(m=>m.action==='commands').at(-1).next,false);
 publishNativeMetadata({title:'Title',artwork:'/api/navidrome/cover/id'});assert.equal(t.messages.at(-1).metadata.artwork,'https://navimuse.example.com/api/navidrome/cover/id');delete w.__nmAudioTransport;
});
test('native toggle uses AVPlayer state even when the JavaScript paused flag is stale',async()=>{
 const t=transport();t.toggle=true;let nativePaused=false;
 t.request=message=>{t.messages.push(message);if(message.action==='toggle'){nativePaused=!nativePaused;return Promise.resolve({paused:nativePaused});}return Promise.resolve(true);};
 const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.load();await deck.pendingLoad;
 assert.equal(deck.paused,true,'JavaScript has not received playing yet');
 await deck.toggle();assert.equal(nativePaused,true,'native playing becomes paused, not another play');
 await deck.toggle();assert.equal(nativePaused,false);assert.equal(deck.paused,false);
 deck.dispose();
});
test('native route presentation diagnostics distinguish a real presentation callback from a request',()=>{
 const before=nativeAudioDiagnosticSnapshot().routePickerPresentations;
 event({type:'routePicker',presenting:true});assert.equal(nativeAudioDiagnosticSnapshot().routePickerPresentations,before+1);assert.equal(nativeAudioDiagnosticSnapshot().routePickerPresenting,true);
 event({type:'diagnostic',metadataPresent:true});assert.equal(nativeAudioDiagnosticSnapshot().routePickerPresentations,before+1);
 event({type:'routePicker',presenting:false});assert.equal(nativeAudioDiagnosticSnapshot().routePickerPresenting,false);assert.equal(nativeAudioDiagnosticSnapshot().routePickerPresentations,before+1);
});
test('native recovery keeps the same track and time while waiting and clears a recovered error',async()=>{
 const t=transport(),deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/recover';deck.load();await deck.play();
 const generation=deck.generation;let failures=0;deck.addEventListener('error',()=>failures++);
 event({deck:0,generation,type:'waiting',time:73.5,paused:false});
 assert.equal(deck.paused,false);assert.equal(deck.currentTime,73.5);assert.equal(failures,0);
 event({deck:0,generation,type:'error',time:73.5,paused:true});assert.equal(failures,1);assert.ok(deck.error);
 event({deck:0,generation,type:'loadedmetadata',time:73.5,paused:true});assert.ok(deck.error,'foreground metadata alone does not prove recovery');
 event({deck:0,generation,type:'playing',time:73.5,paused:false});assert.equal(deck.error,null);assert.equal(deck.currentTime,73.5);
 assert.equal(t.messages.filter(m=>m.action==='load').length,1,'recovery does not change the JavaScript queue or load generation');deck.dispose();
});

test('received native details reset on new tracks and ignore superseded generations',async()=>{
 const t=transport(),deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.load();await deck.pendingLoad;
 const first=deck.generation;let changes=0;deck.addEventListener('streamdetails',()=>changes++);
 event({deck:0,generation:first,type:'streamdetails',delivery:{codec:'MP3',sampleRate:44100}});assert.equal(deck.delivery.codec,'MP3');assert.equal(changes,1);
 deck.src='/api/navidrome/stream/two';deck.load();assert.equal(deck.delivery,null);
 event({deck:0,generation:first,type:'streamdetails',delivery:{codec:'FLAC'}});assert.equal(deck.delivery,null);assert.equal(changes,1);
 event({deck:0,generation:deck.generation,type:'streamdetails',delivery:{}});assert.deepEqual(deck.delivery,{});assert.equal(changes,2);deck.dispose();
});

test('native preparation diagnostics retain only timing and route state',()=>{
 event({type:'diagnostic',startPhase:'started',startPosition:0,startCount:2,routeKind:'AirPlay',outputLatency:2,streamURL:'private',songId:'private'});
 const value=nativeAudioDiagnosticSnapshot();assert.equal(value.startPhase,'started');assert.equal(value.startPosition,0);assert.equal(value.routeKind,'AirPlay');assert.equal(value.outputLatency,2);assert.equal(value.startCount,2);assert.equal(value.streamURL,undefined);assert.equal(value.songId,undefined);
});

test('rejected native toggle invalidates stale readiness so explicit retry can reload',async()=>{
 const t=transport();t.toggle=true;t.request=message=>message.action==='toggle'?Promise.reject(Error('Playback unavailable')):Promise.resolve(true);
 const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.load();await deck.pendingLoad;
 deck.receive({type:'canplay',generation:deck.generation,paused:true});let errors=0;deck.addEventListener('error',()=>errors++);
 await assert.rejects(deck.toggle(),/Playback unavailable/);assert.equal(errors,1);assert.equal(deck.readyState,0);assert.ok(deck.error);
 deck.load();await deck.play();assert.equal(deck.error,null);deck.dispose();
});


test('late toggle rejection does not invalidate a replacement track',async()=>{
 const t=transport();t.toggle=true;let rejectToggle;
 t.request=message=>message.action==='toggle'?new Promise((resolve,reject)=>{rejectToggle=reject;}):Promise.resolve(true);
 const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.load();await deck.pendingLoad;
 const pending=deck.toggle();await Promise.resolve();
 deck.src='/api/navidrome/stream/two';deck.load();await deck.pendingLoad;deck.receive({type:'canplay',generation:deck.generation,paused:true});
 rejectToggle(Error('Playback unavailable'));await assert.rejects(pending,/Playback unavailable/);
 assert.equal(deck.error,null);assert.equal(deck.readyState,4);deck.dispose();
});

test('HLS preparation clears previous playback immediately and cannot load a disposed deck',async()=>{
 const {configureNativeHls}=await import('../src/nativeHls.js');const previousFetch=globalThis.fetch,previousStorage=w.localStorage;
 w.localStorage={getItem:()=> 'true'};configureNativeHls({scope:'scope',enabled:true});let finish;
 globalThis.fetch=()=>new Promise(r=>finish=r);
 const t=transport();t.hls=true;const deck=new NativeAudioDeck(0,t);
 try{
  deck.src='/api/navidrome/stream/one';deck.load();assert.equal(t.messages[0].action,'load');assert.equal(t.messages[0].url,'');
  await new Promise(r=>setImmediate(r));deck.dispose();finish(Response.json({state:'ready',url:'/api/navidrome/hls/sessions/'+'a'.repeat(48)+'/master.m3u8?accountScope=scope'}));
  await assert.rejects(deck.pendingLoad,{name:'AbortError'});assert.equal(t.messages.filter(x=>x.action==='load').length,1);assert.equal(deck.error,null);
 }finally{configureNativeHls({enabled:false,scope:null});globalThis.fetch=previousFetch;w.localStorage=previousStorage;}
});

test('saved native position is supplied before loading and consumed once',async()=>{const t=transport();const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.resumePosition=73.5;deck.load();await deck.pendingLoad;assert.equal(t.messages.find(m=>m.action==='load').restorePosition,73.5);deck.load();await deck.pendingLoad;assert.equal(t.messages.filter(m=>m.action==='load').at(-1).restorePosition,undefined);deck.dispose();});
test('album receipt changes the source and position without load, seek or another Play',async()=>{
 const t=transport();t.albumQueue=true;const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/first';deck.load();await deck.play();let receipt;deck.addEventListener('albumhandoff',e=>receipt=e.detail);
 await deck.prepareAlbum({token:'album',currentQueueItemId:'one',entries:[{queueItemId:'two',url:'https://navimuse.example.com/api/navidrome/stream/second'}]});
 const count=t.messages.length,generation=deck.generation;deck.receive({type:'albumhandoff',generation,url:'https://navimuse.example.com/api/navidrome/stream/second',time:1.25,token:'album',queueItemId:'two'});
 assert.equal(deck.currentTime,1.25);assert.match(deck.src,/second$/);assert.equal(receipt.queueItemId,'two');assert.equal(t.messages.length,count);
 deck.receive({type:'albumhandoff',generation:generation-1,url:'stale',time:0});assert.match(deck.src,/second$/);deck.dispose();
});

test('media services reset pauses, preserves position and cancels pending Play',async()=>{
 let resolve;const t=transport();t.request=m=>{t.messages.push(m);return m.action==='load'?new Promise(r=>resolve=r):Promise.resolve(true);};
 const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.load();
 const playing=deck.play();let errors=0;deck.addEventListener('error',()=>errors++);
 deck.receive({type:'mediareset',generation:deck.generation,time:123,paused:true});
 resolve(true);await assert.rejects(playing,{name:'AbortError'});
 assert.equal(deck.currentTime,123);assert.equal(deck.paused,true);assert.equal(deck.readyState,0);assert.equal(deck.error.mediaServicesReset,true);assert.equal(errors,1);
 assert.equal(t.messages.some(m=>m.action==='play'),false);deck.dispose();
});

test('late native load rejection cannot replace the media reset diagnosis',async()=>{
 let reject;const t=transport();t.request=m=>m.action==='load'?new Promise((_,r)=>reject=r):Promise.resolve(true);
 const deck=new NativeAudioDeck(0,t);deck.src='/api/navidrome/stream/one';deck.load();
 deck.receive({type:'mediareset',generation:deck.generation,time:123,paused:true});reject(new Error('Stale load'));
 await assert.rejects(deck.pendingLoad,{name:'AbortError'});assert.equal(deck.error.mediaServicesReset,true);deck.dispose();
});
