import {transitionDecisionFor,TRANSITION_MODE} from '../../src/playbackTransitions.js';
import {sleepTimerDeadline} from '../../src/sleepTimer.js';
import {ordinaryAutoplayEnabled,removeUpcomingAutoplay} from '../../shared/ordinaryAutoplay.js';
import {reconcileGeneratedBoundary} from '../../src/queueMutations.js';
import {playbackQueue} from '../../shared/wiim/journey.js';
import {mediaCodec} from './delivery.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {openRecoverableJson} from '../recoverableJson.mjs';
import {join} from 'node:path';
import {ordinaryQueue,remoteControls,advanceRemoteQueue,completedObservation,PlaybackError,mutateRemoteQueue} from '../../shared/wiim/contract.js';
import {queueEditIndexState} from '../../src/playerState.js';

function validSessions(v){
 if(v?.version!==1||!Array.isArray(v.sessions)||v.sessions.length>1000)return false;
 const principals=new Set();
 return v.sessions.every(s=>{
  if(!s||typeof s.id!=='string'||typeof s.principal?.id!=='string'||typeof s.principal.scope!=='string'||principals.has(s.principal.id))return false;
  principals.add(s.principal.id);
  return typeof s.device?.id==='string'&&Array.isArray(s.device.membership)&&s.device.membership.every(x=>typeof x==='string')&&
   Array.isArray(s.queue?.items)&&s.queue.items.length>0&&Number.isInteger(s.queue.index)&&s.queue.index>=0&&s.queue.index<s.queue.items.length&&
   s.queue.items.every(i=>typeof i.queueItemId==='string'&&typeof i.song?.id==='string')&&
   Array.isArray(s.grants)&&Array.isArray(s.commands)&&Array.isArray(s.pool)&&Array.isArray(s.history)&&s.controls&&typeof s.controls==='object'&&
   Number.isFinite(s.position)&&Number.isInteger(s.revision)&&Number.isInteger(s.generation)&&
   ['starting','playing','paused','buffering','reconnecting','released','external','error','unreachable','ended'].includes(s.status);
 });
}
export async function openRemoteCoordinator({directory,baseUrl,devices,discoverDevices,authorize,songFor,similarFor,report=async()=>{},now=Date.now,enabled=false,gaplessEnabled=false,pollInterval=2000}){
 const base=new URL(baseUrl);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('Invalid WiiM advertised base URL');
 const store=await openRecoverableJson(join(directory,'sessions-v1.json'),{initial:{version:1,sessions:[]},validate:validSessions});
 const saved=store.value;
 if(new Set(devices.map(d=>d.configuration.id)).size!==devices.length)throw new Error('Duplicate WiiM device ID');
 const membership=(topology)=>[topology.uuid,...topology.members.map(m=>m.id)].map(id=>id.replace(/^uuid:/i,'').replaceAll('-','').toLowerCase()).concat([topology.address,...topology.members.map(m=>m.address)].filter(Boolean).map(address=>'address:'+address)).sort();
 const sessions=new Map(saved.sessions.map(s=>[s.principal.id,s]));const adapters=new Map(devices.map(d=>[d.configuration.id,d]));let tail=Promise.resolve(),closed=false,pendingTick=null;
 const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 let discoveryState=discoverDevices?'pending':'static';
 async function refreshDevices(){if(!discoverDevices)return;let discovered;try{discovered=await discoverDevices();discoveryState='ready';}catch{discoveryState='unavailable';return;}for(const d of discovered){const saved=adapters.get(d.configuration.id);if(saved&&saved.configuration.uuid!==d.configuration.uuid)continue;adapters.set(d.configuration.id,d);}}
 async function persist(){await store.save({version:1,sessions:[...sessions.values()]});}
 const volumeReads=new Map();
 function refreshVolume(s) {
  const d=adapters.get(s.device.id);
  if(!d?.readVolume||volumeReads.has(s.id)||s.volumeAttempt&&now()-s.volumeAttempt<5000)return;
  const revision=s.volumeRevision||0;
  const current=()=>!closed&&sessions.get(s.principal.id)===s&&(s.volumeRevision||0)===revision&&['playing','paused','buffering'].includes(s.status);
  s.volumeAttempt=now();
  const pending=Promise.resolve().then(()=>d.readVolume()).then(volume=>{
   if(!current())return;
   s.volume=Number.isInteger(volume)&&volume>=0&&volume<=100?volume:null;s.volumeAt=now();
  }).catch(()=>{if(current())s.volume=null;})
   .finally(()=>{if(volumeReads.get(s.id)===pending)volumeReads.delete(s.id);});
  volumeReads.set(s.id,pending);
 }
 const detailReads=new Map();
 function refreshDelivery(s) {
  const d=adapters.get(s.device.id);
  if(!d?.delivery || detailReads.has(s.id) || s.deliveryAttempt&&now()-s.deliveryAttempt<5000)return;
  const uri=s.uri,generation=s.generation;
  const artGrant=s.grants.find(g=>g.kind==='art'&&g.generation===generation);
  if(!artGrant)return;
  const art=new URL(`/media/wiim/${artGrant.token}/art.jpg`,base).href;
  s.deliveryAttempt=now();
  // Metadata is optional. Never queue transport or disconnect behind this read.
  const pending=Promise.resolve().then(()=>d.delivery({uri,art})).then(details=>{
   if(closed||adapters.get(s.device.id)!==d||s.uri!==uri||s.generation!==generation||!s.grants.includes(artGrant))return;
   s.receiverDelivery=details;s.deliveryAt=now();
  }).catch(()=>{if(adapters.get(s.device.id)===d&&s.uri===uri&&s.generation===generation)s.receiverDelivery=null;})
    .finally(()=>{if(detailReads.get(s.id)===pending)detailReads.delete(s.id);});
  detailReads.set(s.id,pending);
 }
 // Analysis runs outside the transport lock. Only validated results commit under it.
 const refills=new Map();
 function cancelRefill(s){refills.get(s.id)?.controller.abort();refills.delete(s.id);s.refillAttempt=0;s.journeyNotice='';}
 function refreshJourney(s){
  const journey=s.queue.journey;
  const ordinary=ordinaryAutoplayEnabled(s.queue,s.controls);
  if(!similarFor||(!ordinary&&(!journey?.autoExtend||journey.seed.sessionKind!=='journey'))||!['playing','paused','buffering'].includes(s.status)||refills.has(s.id)||s.refillAttempt&&now()-s.refillAttempt<60000)return;
  const upcoming=s.controls.shuffle?(s.pool.length?s.pool.map(index=>s.queue.items[index]).filter(Boolean):s.queue.items.filter((_,index)=>index!==s.queue.index)):s.queue.items.slice(s.queue.index+1);
  if(upcoming.length>=3&&upcoming.reduce((sum,item)=>sum+(Number(item.song.duration)||0),0)>=300)return;
  const controller=new AbortController(),job={controller,journey};refills.set(s.id,job);s.refillAttempt=now();
  const current=()=>!closed&&!controller.signal.aborted&&sessions.get(s.principal.id)===s&&s.queue.journey===journey&&(!ordinary||ordinaryAutoplayEnabled(s.queue,s.controls))&&['playing','paused','buffering'].includes(s.status);
  const excluded=new Set([...(s.journeyHistory||[]),...s.queue.items.map(item=>item.song.id)]);
  const seeds=[...new Set([journey?.seed.seedSongId || s.queue.items.at(-1)?.song.id,s.queue.items[s.queue.index]?.song.id,...s.queue.items.slice(0,s.queue.index).map(item=>item.song.id).reverse()])].filter(Boolean).slice(0,4);
  job.promise=(async()=>{
   let tracks=[];
   for(const seed of seeds){
    if(!current())return;
    await auth(s);
    const result=await similarFor(s.principal,seed,{excludeIds:[...excluded].slice(-1000),signal:controller.signal});
    if(!Array.isArray(result))throw Error('Similarity unavailable');
    tracks=result.filter(song=>song?.id&&!excluded.has(song.id)).slice(0,12);
    if(tracks.length)break;
   }
   if(!tracks.length)throw Error('No additional matches');
   await serial(async()=>{
    if(!current())return;await auth(s);if(!current())return;
    const known=new Set([...(s.journeyHistory||[]),...s.queue.items.map(item=>item.song.id)]);
    const additions=[];
    for(const candidate of tracks){
     if(known.has(candidate.id))continue;
     const item=ordinaryQueue({items:[{queueItemId:randomUUID(),song:candidate}],index:0}).items[0];
     item.song=publicSong(candidate);known.add(candidate.id);
     additions.push({...item,provenance:'generated',...(ordinary?{autoplay:true}:{radioSessionId:journey.sessionId,radioSeed:journey.seed})});
    }
    if(!additions.length)return;
    // Keep bounded queue history; retain 50 previous occurrences and 1000 excluded IDs.
    const before=s.queue;
    const oldPlayed=new Set((s.journeyPlayed||[]).slice(0,-50));
    const retained=before.items.filter((item,index)=>index===before.index||!oldPlayed.has(item.queueItemId));
    const items=[...retained,...additions];if(items.length>1000)throw Error('Journey queue is full');
    s.journeyHistory=[...known].slice(-1000);
    s.queue=reconcileGeneratedBoundary({...before,items,index:items.findIndex(item=>item.queueItemId===before.items[before.index].queueItemId)});
    const remap=queueEditIndexState(before,s.queue,s.pool,s.history);s.pool=remap.pool;s.history=remap.history;
    s.journeyNotice='';s.revision++;s.updatedAt=now();await persist();
   });
  })().catch(()=>serial(async()=>{if(current()){s.journeyNotice=ordinary?'Similar music is unavailable. Your queued tracks will keep playing.':'Journey discovery is unavailable. Queued tracks will keep playing; NaviMuse will retry.';await persist();}})).finally(()=>{if(refills.get(s.id)===job)refills.delete(s.id);});
  job.promise.catch(()=>{});
 }
 const deliveryFor=s=>['playing','paused','buffering'].includes(s.status)?{
  ...(s.mediaCodec?{codec:s.mediaCodec}:{}),
  ...(now()-(s.deliveryAt||0)<15000?s.receiverDelivery||{}:{})
 }:null;
 const publicState=s=>s?structuredClone({id:s.id,revision:s.revision,generation:s.generation,device:s.device,status:s.status,sleepTimerDeadline:['released','external','error','ended'].includes(s.status)?0:s.sleepTimerDeadline||0,queue:s.queue,controls:s.controls,position:s.position,duration:s.duration,song:s.song,transition:s.preparedNext?'next-track-prepared':s.gaplessUnavailable?'standard':null,delivery:deliveryFor(s),notice:s.notice||'',journeyNotice:s.journeyNotice||'',volume:['playing','paused','buffering'].includes(s.status)&&now()-(s.volumeAt||0)<15000?s.volume??null:null,historyCount:s.history?.length||0,poolCount:s.pool?.length||0,updatedAt:s.updatedAt}):null;
 async function auth(s){if(!await authorize(s.principal))throw new PlaybackError('Remote playback authorization expired',403);}
 // A reservation is a renderer transport slot, not another queue. Occurrence
 // IDs and generation bind it to the existing queue authority across restarts.
 const ownsUri=(s,uri)=>uri===s.uri||Boolean(s.preparedNext&&uri===s.preparedNext.uri);
 function albumNext(s){
  if(!gaplessEnabled||s.gaplessUnavailable||s.controls.shuffle||s.controls.repeat||s.controls.pauseAfterCurrent||s.controls.continueThroughQueue===false||s.sleepTimerDeadline||s.queue.internetRadio)return null;
  const outgoing=s.queue.items[s.queue.index],incoming=s.queue.items[s.queue.index+1];
  if(!incoming)return null;
  const decision=transitionDecisionFor({outgoingItem:outgoing,incomingItem:incoming,capabilities:{authoredGapless:true,smartBlend:false,fixedCrossfade:false}});
  return decision.mode===TRANSITION_MODE.GAPLESS?incoming:null;
 }
 async function adoptPrepared(s,o){
  const p=s.preparedNext;if(!p||o?.uri!==p.uri)return false;
  const current=s.queue.items[s.queue.index],incoming=s.queue.items[s.queue.index+1];
  if(p.generation!==s.generation||p.outgoingId!==current?.queueItemId||p.incomingId!==incoming?.queueItemId)return false;
  // Observation proves the renderer already advanced. Never send load or Play.
  const advanced=advanceRemoteQueue(s,{natural:true});
  if(advanced.status==='ended'||advanced.queue.items[advanced.queue.index]?.queueItemId!==p.incomingId)return false;
  Object.assign(s,advanced);s.revision++;s.preparedNext=null;s.song=p.song;s.duration=Number(p.song.duration)||0;
  s.grants=s.grants.filter(g=>p.tokens.includes(g.token));for(const grant of s.grants)grant.generation=s.generation;
  s.uri=p.uri;s.position=o.position;s.observation=o;s.pausedLoaded=false;
  s.status=o.state==='PAUSED_PLAYBACK'?'paused':o.state==='PLAYING'?'playing':'buffering';
  s.mediaCodec=p.mediaCodec||null;s.receiverDelivery=null;s.deliveryAt=0;s.deliveryAttempt=0;
  s.listened=0;s.reported=false;s.reportRetryAt=0;s.listeningEvent={id:randomUUID(),songId:s.song.id,time:now()};
  s.transitionAt=now();s.updatedAt=now();s.notice='';await persist();
  await report(s.principal,s.song.id,false).catch(()=>{});return true;
 }
 async function clearPrepared(s){
  const p=s.preparedNext;if(!p)return;
  const d=adapters.get(s.device.id);if(!d?.clearNext)throw new PlaybackError('Prepared speaker track could not be cleared',502);
  // Clear may race the hardware boundary. Reconcile after the acknowledgement
  // before invalidating media grants; commands must not restart an adopted item.
  await d.clearNext();const o=await d.observe();
  if(await adoptPrepared(s,o))return;
  if(o.uri!==s.uri){s.status='external';s.grants=[];s.preparedNext=null;s.revision++;s.notice='This speaker is now controlled elsewhere.';await persist();throw new PlaybackError(s.notice,409);}
  s.grants=s.grants.filter(g=>!p.tokens.includes(g.token));s.preparedNext=null;await persist();
 }
 async function prepareAlbumNext(s,o){
  if(s.preparedNext||s.status!=='playing'||o.position<1||now()-(s.transitionAt||0)<1000||s.duration-o.position<5)return;
  const incoming=albumNext(s),d=adapters.get(s.device.id);if(!incoming||!d?.prepareNext||!d?.clearNext)return;
  let song;try{await auth(s);song=await songFor(s.principal,incoming.song.id);}catch{return;}if(!song||song.id!==incoming.song.id)return;
  const hydrated=publicSong(song);
  if(transitionDecisionFor({currentTrack:s.song,nextTrack:hydrated,capabilities:{authoredGapless:true}}).mode!==TRANSITION_MODE.GAPLESS)return;
  const grants=['audio','art'].map(kind=>({token:randomBytes(24).toString('base64url'),kind,generation:s.generation,songId:song.id,coverArt:song.coverArt,isRadio:false,expires:now()+24*3600000}));
  const url=g=>new URL(`/media/wiim/${g.token}/${g.kind==='audio'?'audio':'art.jpg'}`,base).href;
  s.preparedNext={generation:s.generation,outgoingId:s.queue.items[s.queue.index].queueItemId,incomingId:incoming.queueItemId,song:hydrated,uri:url(grants[0]),tokens:grants.map(g=>g.token)};
  s.grants.push(...grants);await persist();
  try{await d.prepareNext({song:hydrated,uri:url(grants[0]),art:url(grants[1])});}
  catch{
   // A SOAP failure may follow an accepted write. Retain the reservation until
   // clear is acknowledged or its URI is observed, so it is never reloaded.
   s.gaplessUnavailable=true;
   try{await clearPrepared(s);}catch{/* Keep ownership of an uncertain next slot. */}
   await persist();
  }
 }
 async function stopOwned(s){const d=adapters.get(s.device.id);if(!d)return false;try{const o=await d.observe();if(!ownsUri(s,o.uri))return true;if(s.preparedNext)await clearPrepared(s);await d.stop();const next=await d.observe();return next.uri!==s.uri||next.state==='STOPPED';}catch{return false;}}
 async function release(s){s.sleepTimerDeadline=0;cancelRefill(s);s.grants=[];s.status=await stopOwned(s)?'released':'unreachable';s.grants=[];if(s.status==='released')s.preparedNext=null;s.pauseAtBoundary=false;s.revision++;s.notice=s.status==='unreachable'?'Speaker could not be stopped. Do not start another output until it is stopped.':'';await persist();return publicState(s);}
 async function hydrate(principal,queue){for(let offset=0;offset<queue.items.length;offset+=8)await Promise.all(queue.items.slice(offset,offset+8).map(async item=>{const song=await songFor(principal,item.song.id);if(!song||song.id!==item.song.id)throw new PlaybackError('Track unavailable',404);item.song=publicSong(song);}));}
 const publicSong=song=>Object.fromEntries(['id','title','artist','artistId','album','albumId','coverArt','duration','track','discNumber','year','genre','contentType','suffix','bitRate','bitDepth','samplingRate','channelCount','size','starred','userRating','isRadio'].filter(key=>song[key]!==undefined).map(key=>[key,song[key]]));
 async function fetchSong(s){await auth(s);const song=await songFor(s.principal,s.queue.items[s.queue.index].song.id);if(!song||song.id!==s.queue.items[s.queue.index].song.id)throw new PlaybackError('Track is unavailable',404);return publicSong(song);}
 async function start(s,{paused=false,position=0}={}){
  const d=adapters.get(s.device.id);if(!d)throw new PlaybackError('Speaker is no longer configured',409);
  await clearPrepared(s);s.transitionAt=now();
  s.song=await fetchSong(s);s.duration=Number(s.song.duration)||0;position=Math.min(position,Math.max(0,s.duration-1));s.position=position;s.status='starting';s.mediaCodec=null;s.receiverDelivery=null;s.deliveryAt=0;s.deliveryAttempt=0;s.observation=null;s.listened=0;s.reported=false;s.reportRetryAt=0;s.listeningEvent={id:randomUUID(),songId:s.song.id,time:now()};
  const expiry=now()+Math.max(24*3600000,(s.duration+3600)*1000);s.grants=['audio','art'].map(kind=>({token:randomBytes(24).toString('base64url'),kind,generation:s.generation,songId:s.song.id,coverArt:s.song.coverArt,isRadio:s.song.isRadio===true,expires:expiry}));
  const url=g=>new URL(`/media/wiim/${g.token}/${g.kind==='audio'?'audio':'art.jpg'}`,base).href;
  s.uri=url(s.grants[0]);await persist();
  try{
   await d.load({song:s.song,uri:s.uri,art:url(s.grants[1]),paused,position:0});
   let o;
   const observeUntil=Date.now()+8000;
   for(let i=0;i<8&&Date.now()<observeUntil;i++){
    // A transient read failure after an accepted load is not a failed start.
    // Observe again without replaying SetAVTransportURI or Play.
    try{o=await d.observe();}catch{o=null;}
    if(o?.uri===s.uri&&(paused||o.state==='PLAYING'))break;
    if(i<7)await new Promise(r=>setTimeout(r,500));
   }
   if(o?.uri!==s.uri||!paused&&o.state!=='PLAYING')throw new Error('Start not observed');
   if(position>0){await d.seek(position);o=await d.observe();}
   s.pausedLoaded=paused;s.status=paused?'paused':'playing';s.position=o.position;s.observation=o;s.updatedAt=now();s.notice='';if(s.queue.journey||ordinaryAutoplayEnabled(s.queue,s.controls)){const id=s.queue.items[s.queue.index].queueItemId;s.journeyPlayed=[...(s.journeyPlayed||[]).filter(value=>value!==id),id].slice(-1000);}refreshJourney(s);refreshVolume(s);refreshDelivery(s);await persist();if(!s.song.isRadio)await report(s.principal,s.song.id,false).catch(()=>{});
  }catch{const stopped=await stopOwned(s);s.grants=[];s.status=stopped?'error':'unreachable';s.notice='WiiM playback could not be confirmed. Local playback remains paused.';await persist();throw new PlaybackError(s.notice,502);}
 }
 async function next(s,options){const generation=s.generation;await clearPrepared(s);if(generation!==s.generation)return;const advanced=advanceRemoteQueue(s,options);Object.assign(s,advanced);s.revision++;if(s.status==='ended'){if(!await stopOwned(s)){s.status='unreachable';s.notice='Speaker stop could not be confirmed.';}s.grants=[];await persist();return;}try{await start(s,{paused:s.pauseAtBoundary===true});delete s.pauseAtBoundary;}catch(error){s.grants=[];s.status=await stopOwned(s)?'error':'unreachable';s.notice='The next track could not start. Local playback remains paused.';await persist();throw error;}}
 // WiiM Home owns grouping. Reattach only to an approved leader still serving
 // this exact grant, without replaying the track or stopping the regrouped output.
 async function reconcileGroup(s,d,topology,o){
  const changed=topology.follower||JSON.stringify(membership(topology))!==JSON.stringify(s.device.membership);
  if(!changed&&!s.groupPendingAt)return {d,o};
  let candidate={d,topology,o};
  if(topology.follower){
   candidate=null;
   const identity=membership({...s.device,members:[]});
   for(const next of adapters.values()){
    if(next===d)continue;
    try{
     const group=await next.topology();
     if(group.follower||!membership(group).some(id=>identity.includes(id)))continue;
     const observed=await next.observe();
     if(ownsUri(s,observed.uri)){candidate={d:next,topology:group,o:observed};break;}
    }catch{/* A missing receiver cannot establish ownership. */}
   }
  }
  const ids=candidate?membership(candidate.topology):[];
  const conflict=[...sessions.values()].some(other=>other!==s&&!['released','ended','external','error'].includes(other.status)&&other.device.membership.some(id=>ids.includes(id)));
  if(candidate&&!conflict&&ownsUri(s,candidate.o?.uri)&&(candidate.o.state==='PLAYING'||candidate.o.state==='PAUSED_PLAYBACK'||candidate.o.state==='STOPPED'&&s.pausedLoaded)){
   s.device={...candidate.topology,membership:ids};s.topologyAt=now();
   s.observation=null;s.notice='';delete s.groupPendingAt;s.revision++;
   s.volumeRevision=(s.volumeRevision||0)+1;s.volume=null;s.volumeAt=0;s.volumeAttempt=0;
   s.receiverDelivery=null;s.deliveryAt=0;s.deliveryAttempt=0;
   await persist();return {d:candidate.d,o:candidate.o};
  }
  s.groupPendingAt??=now();s.observation=null;s.updatedAt=now();
  if(conflict||now()-s.groupPendingAt>=20000){
   cancelRefill(s);s.grants=[];s.status='external';delete s.groupPendingAt;
   s.notice=conflict?'This WiiM group already has another remote session. Choose the output again.':'WiiM group playback could not be verified. Choose the output again.';
  }else{
   s.status='reconnecting';s.notice='WiiM group is changing. Checking playback…';
  }
  s.revision++;await persist();return null;
 }
 async function poll(s){
  if(['released','external','error','unreachable','ended'].includes(s.status))return;
  try{await auth(s);}catch{await release(s);return;}
  const d=adapters.get(s.device.id);if(!d){s.status='reconnecting';s.revision++;s.notice='Waiting for speaker discovery. Local playback stays paused.';await persist();return;}
  try{
   let topology;
   if(s.groupPendingAt||!s.topologyAt||now()-s.topologyAt>=10000)topology=await d.topology();
   let o;
   try{o=await d.observe();}catch(error){
    if(!topology||!s.groupPendingAt&&!topology.follower&&JSON.stringify(membership(topology))===JSON.stringify(s.device.membership))throw error;
   }
   if(topology||o?.uri!==s.uri||o?.state==='STOPPED'){
    topology??=await d.topology();const reconciled=await reconcileGroup(s,d,topology,o);if(!reconciled)return;o=reconciled.o;s.topologyAt=now();
   }
   await adoptPrepared(s,o);
   const old=s.observation;
   if(o.uri!==s.uri){cancelRefill(s);s.status='external';s.notice='This speaker is now controlled elsewhere.';s.grants=[];s.revision++;await persist();return;}
   if(s.sleepTimerDeadline && now()>=s.sleepTimerDeadline){
    await adapters.get(s.device.id).pause();s.sleepTimerDeadline=0;s.status='paused';s.position=o.position;s.observation=null;
    s.notice='Sleep timer finished. Play to continue.';s.revision++;s.updatedAt=now();await persist();return;
   }
   if(completedObservation(old,o,{uri:s.uri,duration:s.duration,now:now()})){await next(s,{natural:true});return;}
   if(o.state==='STOPPED'&&!s.pausedLoaded){s.status='external';s.notice='The speaker stopped before NaviMuse could confirm the track finished. Automatic advancement is paused.';s.grants=[];s.revision++;await persist();return;}
   if(old?.state==='PLAYING'&&o.state==='PLAYING'){const delta=o.position-old.position;if(delta>0&&delta<=6)s.listened=(s.listened||0)+delta;}
   if(!s.reported&&now()>=(s.reportRetryAt||0)&&s.listened>=Math.min(240,s.duration/2)&&s.duration>0){if(!s.listeningEvent){s.listeningEvent={id:randomUUID(),songId:s.song.id,time:now()};await persist();}try{await report(s.principal,s.song.id,true,s.listeningEvent,s.song);s.reported=true;}catch{s.reportRetryAt=now()+30000;}await persist();}
   const status=o.state==='PLAYING'?'playing':o.state==='PAUSED_PLAYBACK'||o.state==='STOPPED'&&s.pausedLoaded?'paused':'buffering';if(status!==s.status)s.revision++;
   s.status=status;refreshJourney(s);refreshVolume(s);refreshDelivery(s);s.position=o.position;s.observation=o;s.updatedAt=now();await persist();
   await prepareAlbumNext(s,o);
  }catch{if(['error','unreachable'].includes(s.status))return;s.status='reconnecting';s.notice='Speaker connection lost. Local playback stays paused.';s.observation=null;await persist();}
 }
 const api={
  health:()=>({sessionRecovery:store.recovery,discovery:discoveryState}),
  async outputs(){if(!enabled)return [];await refreshDevices();return Promise.all([...adapters.values()].map(async d=>{try{return {...await d.topology(),available:true};}catch{return {id:d.configuration.id,name:d.configuration.name||d.configuration.id,available:false};}}));},
  snapshot:principal=>serial(async()=>{const s=sessions.get(principal.id);if(s&&s.principal.scope!==principal.scope)return null;if(s)await auth(s.status==='released'?{principal}:s);return publicState(s);}),
  create:(principal,input)=>serial(async()=>{
   if(!enabled)throw new PlaybackError('WiiM Direct is disabled',503);if(typeof input.transferId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(input.transferId))throw new PlaybackError('A transfer ID is required');const existing=sessions.get(principal.id);if(existing?.transferId===input.transferId&&existing.principal.scope===principal.scope){await auth(existing);return publicState(existing);}if(existing&&!['released','ended','external','error'].includes(existing.status))throw new PlaybackError('Release the current remote session first',409);
   await refreshDevices();const d=adapters.get(input.deviceId);if(!d)throw new PlaybackError('Choose a discovered speaker');
   const topology=await d.topology();if(topology.follower)throw new PlaybackError('Select the group leader',409);
   const memberIds=membership(topology);
   for(const other of sessions.values())if(!['released','ended','external','error'].includes(other.status)&&other.device.membership.some(id=>memberIds.includes(id)))throw new PlaybackError('This speaker group already has a remote session',409);
   const queue=playbackQueue(input.queue);const s={id:randomUUID(),transferId:input.transferId,principal,revision:1,generation:1,queue,controls:remoteControls(input.controls),pool:[],history:[],device:{...topology,membership:memberIds},status:'starting',grants:[],commands:[],position:0,updatedAt:now()};
   await auth(s);await hydrate(principal,s.queue);await fetchSong(s);sessions.set(principal.id,s);await start(s,{position:Math.max(0,Math.min(Number(input.position)||0,86400)),paused:input.paused===true});s.commands.push({id:input.transferId,status:'complete'});await persist();return publicState(s);
  }),
  command:(principal,id,cmd)=>serial(async()=>{
   const s=sessions.get(principal.id);if(!s||s.id!==id||s.principal.scope!==principal.scope)throw new PlaybackError('Remote session not found',404);
   if(typeof cmd.commandId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(cmd.commandId))throw new PlaybackError('A command ID is required');
   await auth(s);const duplicate=s.commands.find(c=>c.id===cmd.commandId);if(duplicate){if(duplicate.status!=='complete')throw new PlaybackError('The previous command outcome is uncertain; refresh playback before retrying',409);return publicState(s);}if(cmd.revision!==s.revision)throw new PlaybackError('Playback changed; refresh and try again',409);await auth(s);
   let d=adapters.get(s.device.id);if(cmd.action==='release'){const result=await release(s);s.commands=[...s.commands.slice(-127),{id:cmd.commandId,status:'complete'}];await persist();return result;}
   if(cmd.action==='disconnect'){
    if(s.status!=='unreachable'||cmd.acknowledgeUnconfirmedStop!==true)throw new PlaybackError('Try stopping the speaker first, then confirm disconnecting it',409);
    // Explicitly abandon ownership; this is not a claim that the hardware stopped.
    cancelRefill(s);s.grants=[];s.status='released';s.pauseAtBoundary=false;s.observation=null;s.revision++;s.updatedAt=now();
    s.notice='Disconnected without confirming speaker playback stopped.';
    s.commands=[...s.commands.slice(-127),{id:cmd.commandId,status:'complete'}];await persist();return publicState(s);
   }
   if(!enabled||['external','released','unreachable','error','reconnecting'].includes(s.status))throw new PlaybackError('Reconnect or release this output before controlling it',409);
   // Reconcile group and stream ownership before every transport mutation.
   const [topology,initialObservation]=await Promise.all([d.topology(),d.observe()]);
   const reconciled=await reconcileGroup(s,d,topology,initialObservation);if(!reconciled)throw new PlaybackError(s.notice,409);
   d=reconciled.d;const observed=reconciled.o;
   if(await adoptPrepared(s,observed))throw new PlaybackError('Track advanced; refresh and try again',409);
   if(observed.uri!==s.uri){s.status='external';s.grants=[];s.revision++;await persist();throw new PlaybackError('Speaker is controlled elsewhere',409);}
   if(!['pause','play','seek','next','previous','volume','controls','queue','replace','syncQueue','select','sleepTimer'].includes(cmd.action))throw new PlaybackError('Unknown playback command');
   if(s.queue.internetRadio&&['seek','next','previous','queue'].includes(cmd.action))throw new PlaybackError('Live radio does not support seeking or track queue controls.');
   if(cmd.action==='seek'&&(!Number.isFinite(cmd.position)||cmd.position<0||cmd.position>s.duration))throw new PlaybackError('Invalid seek position');
   if(cmd.action==='volume'&&(!Number.isInteger(cmd.volume)||cmd.volume<0||cmd.volume>100))throw new PlaybackError('Volume must be 0–100');
   if(cmd.action==='sleepTimer' && cmd.minutes!==0){try{sleepTimerDeadline(cmd.minutes,now());}catch{throw new PlaybackError('Choose a sleep timer duration.');}}
   let replacement;
   if(cmd.action==='replace'||cmd.action==='syncQueue'){
    replacement=playbackQueue(cmd.queue);await hydrate(s.principal,replacement);
    if(cmd.action==='syncQueue'){
     const current=s.queue.items[s.queue.index],incoming=replacement.items[replacement.index];
     if(s.principal.kind!=='plex'||s.queue.source?.playQueueId!==replacement.source?.playQueueId||current.queueItemId!==incoming.queueItemId||current.song.id!==incoming.song.id)throw new PlaybackError('Queue refresh must retain the playing occurrence',409);
    }
    if(cmd.action==='replace'&&cmd.position!==undefined&&(!Number.isFinite(cmd.position)||cmd.position<0||cmd.position>replacement.items[replacement.index].song.duration))throw new PlaybackError('Invalid resume position');
   }
   if(cmd.action==='select'&&(!Number.isInteger(cmd.index)||cmd.index<0||cmd.index>=s.queue.items.length))throw new PlaybackError('Invalid queue selection');
   let editedQueue;
   if(cmd.action==='queue'){
    let item=cmd.item;if(item){item=ordinaryQueue({items:[item],index:0}).items[0];if(s.queue.items.some(i=>i.queueItemId===item.queueItemId))throw new PlaybackError('Duplicate occurrence');}
    if(item){const song=await songFor(s.principal,item.song.id);if(!song||song.id!==item.song.id)throw new PlaybackError('Track unavailable',404);item.song=publicSong(song);}editedQueue=mutateRemoteQueue(s.queue,{...cmd.mutation,item});
    playbackQueue(editedQueue);
   }
   const record={id:cmd.commandId,status:'pending'};
   s.commands=[...s.commands.slice(-127),record];s.revision++;await persist();
   try {
   if(['next','previous','seek','controls','queue','replace','syncQueue','select','sleepTimer'].includes(cmd.action)){const generation=s.generation;await clearPrepared(s);if(generation!==s.generation){record.status='complete';await persist();throw new PlaybackError('Track advanced; refresh before changing playback',409);}}
   if(cmd.action==='sleepTimer'){s.sleepTimerDeadline=cmd.minutes===0?0:sleepTimerDeadline(cmd.minutes,now());}
   else if(cmd.action==='pause'){await d.pause();s.status='paused';}
   else if(cmd.action==='play'){if(s.status==='ended')await start(s);else {await d.play();s.pausedLoaded=false;s.status='playing';}}
   else if(cmd.action==='seek'){const time=Number(cmd.position);if(!Number.isFinite(time)||time<0||time>s.duration)throw new PlaybackError('Invalid seek position');await d.seek(time);s.position=time;s.observation=null;}
   else if(cmd.action==='previous'&&(observed.position>3||s.queue.index===0)){await d.seek(0);s.position=0;s.observation=null;}
   else if(cmd.action==='next'||cmd.action==='previous'){await next(s,{direction:cmd.action});}
   else if(cmd.action==='volume'){s.volumeRevision=(s.volumeRevision||0)+1;await d.volume(cmd.volume);s.volume=cmd.volume;s.volumeAt=now();s.volumeAttempt=0;}
   else if(cmd.action==='controls'){s.controls=remoteControls({...s.controls,...cmd.controls});if(!s.queue.journey&&!ordinaryAutoplayEnabled(s.queue,s.controls))cancelRefill(s);else refreshJourney(s);if(!s.queue.journey&&!ordinaryAutoplayEnabled(s.queue,s.controls)){const before=s.queue;s.queue=reconcileGeneratedBoundary(removeUpcomingAutoplay(before,s.controls,s.pool));const remap=queueEditIndexState(before,s.queue,s.pool,s.history);s.pool=remap.pool;s.history=remap.history;}}
   else if(cmd.action==='syncQueue'){const before=s.queue;s.queue=replacement;const remap=queueEditIndexState(before,s.queue,s.pool,s.history);s.pool=remap.pool;s.history=remap.history;}
   else if(cmd.action==='replace'||cmd.action==='select'){if(replacement)cancelRefill(s);s.queue=replacement||{...s.queue,index:cmd.index};s.generation++;s.pool=[];s.history=[];await start(s,{position:cmd.action==='replace'?cmd.position||0:0,paused:cmd.action==='replace'&&cmd.paused===true});}
   else if(cmd.action==='queue'){const before=s.queue;s.queue=editedQueue;const remap=queueEditIndexState(before,s.queue,s.pool,s.history);s.pool=remap.pool;s.history=remap.history;}
   record.status='complete';
   } catch(error) {if(error instanceof PlaybackError&&error.status===409)throw error;if(s.status!=='unreachable')s.status='reconnecting';s.observation=null;s.notice='Command result is uncertain. Playback will be checked before another command.';await persist();throw new PlaybackError(s.notice,502);}
   s.updatedAt=now();await persist();return publicState(s);
  }),
  receivedMedia:(token,contentType)=>{
   for(const s of sessions.values())if(s.grants.some(g=>g.kind==='audio'&&g.token===token&&g.generation===s.generation&&g.expires>now())){if(s.preparedNext?.tokens.includes(token))s.preparedNext.mediaCodec=mediaCodec(contentType);else s.mediaCodec=mediaCodec(contentType);return;}
  },
  grant:async(token,kind)=>{for(const s of sessions.values()){const g=s.grants.find(g=>g.token===token&&g.kind===kind&&g.generation===s.generation&&g.expires>now());if(g&&enabled){await auth(s);if(!s.grants.includes(g)||g.generation!==s.generation||g.expires<=now())break;return {principal:s.principal,songId:g.songId,coverArt:g.coverArt??(g.songId===s.song?.id?s.song?.coverArt:undefined),isRadio:g.isRadio===true||(g.songId===s.song?.id&&s.song?.isRadio===true)};}}throw new PlaybackError('Media grant expired',403);},
  logout:principal=>serial(async()=>{const s=sessions.get(principal.id);if(s)await release(s);}),
  tick:()=>{
   if(closed)return Promise.resolve();
   // Never accumulate periodic observations behind a slow/unreachable device.
   // Commands remain serialized with at most one outstanding background poll.
   if(pendingTick)return pendingTick;
   pendingTick=serial(async()=>{await refreshDevices();for(const s of sessions.values())await poll(s);}).finally(()=>{pendingTick=null;});
   return pendingTick;
  },
  close:async()=>{closed=true;for(const s of sessions.values())cancelRefill(s);clearInterval(timer);await tail;},
 };
 // A restart observes the saved URI rather than replaying a stored start command.
 for(const s of sessions.values()){s.volume=null;s.volumeAt=0;s.volumeAttempt=0;s.mediaCodec=null;s.receiverDelivery=null;s.deliveryAt=0;s.deliveryAttempt=0;s.observation=null;if(!enabled)await release(s);else if(!['released','ended','external','error','unreachable'].includes(s.status))s.status='reconnecting';}
 const timer=setInterval(()=>{if(!closed)void api.tick().catch(()=>{});},pollInterval);timer.unref();return api;
}
