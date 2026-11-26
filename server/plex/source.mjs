import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {PlaybackError} from '../../shared/wiim/contract.js';
export const plexHeaders=(receiver)=>({'X-Plex-Product':'NaviMuse','X-Plex-Version':'0.2.0','X-Plex-Platform':'NaviMuse Server','X-Plex-Device':'Speaker bridge','X-Plex-Device-Name':receiver.name.replace(/[^\x20-\x7e]/g,'-'),'X-Plex-Client-Identifier':receiver.id,'X-Plex-Provides':'player,pubsub-player','Accept':'application/json'});
export const localAddress=raw=>{const ip=String(raw||'').replace(/^::ffff:/,'');return ip==='::1'||isIP(ip)===4&&/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);};
const numeric=value=>/^\d{1,18}$/.test(String(value));
const fail=(message,status=400)=>{throw new PlaybackError(message,status);};
export function validatePlexConfig(input){
 if(!input||input.version!==1||!Array.isArray(input.receivers)||!input.receivers.length||input.receivers.length>16)fail('Invalid Plex receiver configuration');
 const server=new URL(input.server?.url);
 if(!['http:','https:'].includes(server.protocol)||!localAddress(server.hostname)||server.username||server.password||server.pathname!=='/'||server.search||server.hash||!/^\w{8,128}$/.test(input.server?.machineIdentifier))fail('Plex requires an approved local server address and identity');
 const endpoint=new URL(input.advertisedUrl);
 if(endpoint.protocol!=='http:'||!localAddress(endpoint.hostname)||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)fail('Plex receiver requires a local advertised URL');
 const port=Number(endpoint.port||80);if(port<1024||port>65535)fail('Invalid Plex receiver port');
 const ids=new Set(),devices=new Set();
 const receivers=input.receivers.map(r=>{
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(r?.id)||ids.has(r.id)||!/^[a-z0-9_-]{1,64}$/.test(r.deviceId)||devices.has(r.deviceId)||typeof r.name!=='string'||!r.name.trim()||r.name.length>120||/[\r\n]/.test(r.name)||typeof r.token!=='string'||r.token.length<10||r.token.length>1024||!numeric(r.accountId))fail('Invalid linked Plex receiver');
  ids.add(r.id);devices.add(r.deviceId);return {...r,accountId:String(r.accountId)};
 });
 if(input.autoDiscover!==undefined&&typeof input.autoDiscover!=='boolean')fail('Invalid Plex discovery setting');
 return {version:1,server:{url:server.origin,machineIdentifier:input.server.machineIdentifier},advertisedUrl:endpoint.origin,port,receivers,autoDiscover:input.autoDiscover===true};
}
export async function boundedJson(response,limit=2*1024*1024){
 if(!response.ok){await response.body?.cancel();fail('Plex request failed',response.status===401||response.status===403?403:502);}
 let size=0;const chunks=[];
 for await(const part of response.body||[]){size+=part.length;if(size>limit)fail('Plex response too large',502);chunks.push(part);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('Invalid Plex response',502);}
}
export function createPlexSource(input,{fetchImpl=fetch,now=Date.now,discoveryCredentials={},saveDiscoveryCredentials=async()=>{}}={}){
 const config=validatePlexConfig(input),cache=new Map(),authenticated=new Map();
 const ownerScope=createHash('sha256').update(`${config.receivers[0].id}:${config.receivers[0].accountId}:${config.server.machineIdentifier}:${config.receivers[0].token}`).digest('hex');
 // Restore linked automatic identities before any saved playback is authorized.
 // Availability is separate: offline speakers keep their identity and session.
 if(config.autoDiscover)for(const [id,saved] of Object.entries(discoveryCredentials)){
  if(config.receivers.length>=16)break;
  if(saved?.ownerScope!==ownerScope||!saved.receiver||config.receivers.some(r=>r.id===id))continue;
  try{const r=validatePlexConfig({...config,receivers:[{...saved.receiver,id,token:saved.token}]}).receivers[0];
   if(r.accountId===config.receivers[0].accountId)config.receivers.push({...r,available:false});
  }catch{/* Invalid saved descriptors never create an authorized identity. */}
 }
 async function rememberReceiver(receiver){
  if(!receiver.discoveryUuid||receiver.needsLink)return;
  const descriptor={id:receiver.id,deviceId:receiver.deviceId,name:receiver.name,accountId:receiver.accountId,discoveryUuid:receiver.discoveryUuid};
  if(JSON.stringify(discoveryCredentials[receiver.id]?.receiver)===JSON.stringify(descriptor))return;
  const updated={...discoveryCredentials,[receiver.id]:{ownerScope,token:receiver.token,receiver:descriptor}};
  await saveDiscoveryCredentials(updated);discoveryCredentials=updated;
 }
 function syncOutputs(outputs){
  if(!config.autoDiscover)return;
  const template=config.receivers[0];
  for(const receiver of config.receivers)receiver.available=false;
  for(const output of outputs.slice(0,16)){
   if(!output.available||typeof output.uuid!=='string'||!/^uuid:[a-f0-9-]{4,64}$/i.test(output.uuid)||! /^[a-z0-9_-]{1,64}$/.test(output.id))continue;
   const uuid=output.uuid.toLowerCase();
   let receiver=config.receivers.find(r=>r.deviceId===output.id||r.discoveryUuid===uuid);
   const name=('NaviMuse '+String(output.name||output.id).replace(/[\r\n]/g,' ').trim()).slice(0,120);
   if(!receiver){
    if(config.receivers.length>=16)continue;
    const id='navimuse-'+createHash('sha256').update(`${template.id}:${uuid}`).digest('hex').slice(0,32);
    const saved=discoveryCredentials[id];
    const token=saved?.ownerScope===ownerScope&&typeof saved.token==='string'&&saved.token.length>=10?saved.token:'';
    receiver={id,deviceId:output.id,name,accountId:template.accountId,token,needsLink:!token,discoveryUuid:uuid};config.receivers.push(receiver);
   }
   receiver.available=true;
   if(receiver.discoveryUuid){receiver.deviceId=output.id;receiver.name=name;}
  }
 }
 const advertisedReceivers=()=>config.receivers.filter(r=>r.available!==false&&!r.needsLink);
 const principalFor=receiver=>({kind:'plex',id:`plex:${receiver.id}`,scope:createHash('sha256').update(`${receiver.id}:${receiver.accountId}:${config.server.machineIdentifier}:${receiver.token}`).digest('hex')});
 const receiverFor=principal=>config.receivers.find(r=>{const p=principalFor(r);return !r.needsLink&&principal?.kind==='plex'&&p.id===principal.id&&p.scope===principal.scope;});
 const authorize=async p=>Boolean(receiverFor(p));
 async function request(receiver,path,{headers={},signal,method='GET',body,stream=false,timeoutMs=15000}={}){
  // The configured PMS is the only upstream. Controller-supplied addresses,
  // protocols and URLs are never fetched; redirects cannot leak its token.
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.includes('\\'))fail('Invalid Plex path');
  const url=new URL(path,config.server.url);if(url.origin!==config.server.url)fail('Invalid Plex origin');
  const timeout=new AbortController(),timer=stream?setTimeout(()=>timeout.abort(),15000):null;
  const deadline=stream?timeout.signal:AbortSignal.timeout(timeoutMs);
  try{return await fetchImpl(url,{method,body,redirect:'error',signal:signal?AbortSignal.any([signal,deadline]):deadline,headers:{...plexHeaders(receiver),'X-Plex-Token':receiver.token,...headers}});}
  finally{if(timer)clearTimeout(timer);} // Streaming body lifetime belongs to the downstream, not a 15-second song timer.
 }
 async function json(receiver,path){return boundedJson(await request(receiver,path));}
 function trackSong(track){
  if(track?.type!=='track'||!numeric(track.ratingKey)||!Number.isFinite(track.duration)||track.duration<0||track.duration>86400000)fail('Plex returned an unsupported audio track',422);
  const media=track.Media?.[0],part=media?.Part?.[0];
  if(!part||!/^\/library\/parts\/\d+\/\d+\/file\.[a-zA-Z0-9]{1,12}$/.test(part.key))fail('Plex track has no supported original audio file',422);
  const container=String(media.container||'').toLowerCase();const types={flac:'audio/flac',mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',opus:'audio/ogg',wav:'audio/wav',aiff:'audio/aiff'};
  if(!types[container])fail('Plex audio format is not supported by this receiver',422);
  return {id:String(track.ratingKey),title:String(track.title||'Unknown track').slice(0,1024),artist:String(track.grandparentTitle||track.originalTitle||'').slice(0,1024),album:String(track.parentTitle||'').slice(0,1024),albumId:String(track.parentRatingKey||''),coverArt:String(track.ratingKey),duration:track.duration/1000,track:Number(track.index)||0,discNumber:Number(track.parentIndex)||1,contentType:types[container],suffix:container};
 }
 async function metadata(receiver,id){
  if(!numeric(id))fail('Invalid Plex track');const key=`${receiver.id}:${id}`,cached=cache.get(key);if(cached&&cached.expires>now())return cached.track;
  const data=await json(receiver,`/library/metadata/${id}`),track=data.MediaContainer?.Metadata?.[0];if(String(track?.ratingKey)!==String(id))fail('Plex track unavailable',404);trackSong(track);
  if(cache.size>=2000)cache.delete(cache.keys().next().value);cache.set(key,{track,expires:now()+60000});return track;
 }
 async function songFor(principal,id){const receiver=receiverFor(principal);if(!receiver)fail('Plex receiver unlinked',403);return trackSong(await metadata(receiver,id));}
 async function mediaFor(principal,id,{artwork=false,headers={},signal}={}){
  const receiver=receiverFor(principal);if(!receiver)fail('Plex receiver unlinked',403);
  const track=await metadata(receiver,id);let path=track.Media[0].Part[0].key;
  if(artwork){path=track.thumb||track.parentThumb||track.grandparentThumb;if(!/^\/library\/metadata\/\d+\/(?:thumb|art)\/\d+$/.test(path||''))fail('Plex artwork unavailable',404);}
  const response=await request(receiver,path,{headers,signal,stream:true});
  // PMS file replies can be octet-stream. Preserve bytes and range metadata.
  if(!artwork&&response.ok&&(!response.headers.get('content-type')||response.headers.get('content-type').startsWith('application/octet-stream'))){const h=new Headers(response.headers);h.set('content-type',trackSong(track).contentType);return new Response(response.body,{status:response.status,headers:h});}
  return response;
 }
 async function queueFor(receiver,params,{currentItemId}={}){
  if(params.get('machineIdentifier')&&params.get('machineIdentifier')!==config.server.machineIdentifier)fail('Choose the configured Plex server',403);
  const raw=params.get('containerKey')||'',match=/^\/playQueues\/(\d{1,18})(?:\?[^#]*)?$/.exec(raw);
  if(!match)fail('Choose a Plex music play queue',422);
  const center=currentItemId?.match(/^plex-(\d+)-(\d+)$/);
  if(currentItemId&&(!center||center[1]!==match[1]))fail('Invalid Plex queue occurrence');
  const query=new URLSearchParams({own:'1',window:'1000',includeBefore:'1',includeAfter:'1'});if(center)query.set('center',center[2]);
  const data=await json(receiver,`/playQueues/${match[1]}?${query}`),q=data.MediaContainer;
  if(!q||String(q.playQueueID)!==match[1]||!Array.isArray(q.Metadata)||!q.Metadata.length||q.Metadata.length>1000)fail('Plex receiver requires a nonempty queue window of up to 1000 tracks',422);
  const items=q.Metadata.map(track=>{const song=trackSong(track);if(cache.size>=2000)cache.delete(cache.keys().next().value);cache.set(`${receiver.id}:${song.id}`,{track,expires:now()+60000});if(!numeric(track.playQueueItemID))fail('Invalid Plex queue occurrence',502);return {queueItemId:`plex-${q.playQueueID}-${track.playQueueItemID}`,song};});
  const explicit=params.get('playQueueItemID');
  if(explicit!==null&&!numeric(explicit))fail('Invalid Plex queue occurrence');
  const selected=currentItemId||`plex-${q.playQueueID}-${explicit??q.playQueueSelectedItemID}`;
  let index=items.findIndex(item=>item.queueItemId===selected);
  // Plexamp's queue-creation fallback sends Metadata[0].key even when PMS
  // selected a later album track. An occurrence selection outranks that key.
  const key=params.get('key');
  if(index<0&&!currentItemId&&explicit===null&&key)index=items.findIndex(item=>`/library/metadata/${item.song.id}`===key);
  if(index<0)fail('Selected Plex queue item is unavailable',409);
  const total=Number(q.playQueueTotalCount),selectedIndex=items.findIndex(item=>item.queueItemId===`plex-${q.playQueueID}-${q.playQueueSelectedItemID}`);
  const start=Number.isSafeInteger(q.playQueueSelectedItemOffset)&&selectedIndex>=0?Math.max(0,q.playQueueSelectedItemOffset-selectedIndex):0;
  const windowed=Number.isSafeInteger(total)&&total>items.length;
  return {items,index,source:{kind:'plex',version:1,playQueueId:String(q.playQueueID),playQueueVersion:String(q.playQueueVersion||1),windowed,hasMoreBefore:windowed&&start>0,hasMoreAfter:windowed&&start+items.length<total}};
 }
 async function validateController(receiver,token){
  if(receiver.needsLink||typeof token!=='string'||token.length<10||token.length>1024)return false;
  const a=Buffer.from(receiver.token),b=Buffer.from(token);if(a.length===b.length&&timingSafeEqual(a,b))return true;
  const key=createHash('sha256').update(token).digest('hex')+receiver.accountId;
  if((authenticated.get(key)||0)>now())return true;
  if(token.startsWith('transient-')){
   // Companion delegates a PMS token, not a plex.tv account token. Only accept
   // owner-level delegation on the pinned PMS owned by this linked account.
   // Library access alone is insufficient: shared users must not inherit the
   // receiver owner's media permissions or speaker control.
   const resources=await boundedJson(await fetchImpl('https://plex.tv/api/v2/resources',{redirect:'error',signal:AbortSignal.timeout(5000),headers:{...plexHeaders(receiver),'X-Plex-Token':receiver.token}}));
   if(!Array.isArray(resources)||!resources.some(r=>r.clientIdentifier===config.server.machineIdentifier&&r.owned===true))return false;
   const headers={'X-Plex-Token':token};
   const identity=await boundedJson(await request(receiver,'/',{headers}),65536);
   if(identity.MediaContainer?.machineIdentifier!==config.server.machineIdentifier)return false;
   // Plex documents this endpoint as admin/owner-transient only. The source
   // is fixed to this PMS; controller-supplied addresses are never used.
   const path='/security/resources?'+new URLSearchParams({source:`server://${config.server.machineIdentifier}`});
   // Fail closed if a PMS LAN auth exemption would accept arbitrary tokens.
   const negative=await request(receiver,path,{headers:{'X-Plex-Token':`transient-${randomUUID()}`}});
   await negative.body?.cancel();if(![401,403].includes(negative.status))return false;
   const proof=await boundedJson(await request(receiver,path,{headers}),65536);
   if(!proof.MediaContainer||!Number.isInteger(proof.MediaContainer.size))return false;
  }else{
   const data=await boundedJson(await fetchImpl('https://plex.tv/api/v2/user',{redirect:'error',signal:AbortSignal.timeout(5000),headers:{...plexHeaders(receiver),'X-Plex-Token':token}}),65536);
   if(String(data.id)!==receiver.accountId)return false;
  }
  if(authenticated.size>=128)authenticated.delete(authenticated.keys().next().value);authenticated.set(key,now()+60000);return true;
 }
 async function checkServer(){
  const data=await boundedJson(await request(config.receivers[0],'/',{timeoutMs:5000}),65536);
  if(data.MediaContainer?.machineIdentifier!==config.server.machineIdentifier)fail('Plex server identity unavailable',502);
 }
 async function beginControllerLink(){
  const receiver={id:'navimuse-controller-'+randomUUID(),name:'NaviMuse controller approval'};
  const data=await boundedJson(await fetchImpl('https://plex.tv/api/v2/pins',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{...plexHeaders(receiver),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({strong:'false'})}),65536);
  if(!numeric(data.id)||typeof data.code!=='string'||!data.code||data.code.length>128)fail('Invalid Plex pairing response',502);
  return {receiver,id:data.id,code:data.code};
 }
 async function finishControllerLink(link){
  const data=await boundedJson(await fetchImpl('https://plex.tv/api/v2/pins/'+link.id,{redirect:'error',signal:AbortSignal.timeout(5000),headers:plexHeaders(link.receiver)}),65536);
  if(!data.authToken)return null;
  const user=await boundedJson(await fetchImpl('https://plex.tv/api/v2/user',{redirect:'error',signal:AbortSignal.timeout(5000),headers:{...plexHeaders(link.receiver),'X-Plex-Token':data.authToken}}),65536);
  if(!numeric(user.id))fail('Invalid Plex owner proof',502);
  return String(user.id);
 }
 async function ensureReceiverLinked(receiver){
  if(!receiver.needsLink){await rememberReceiver(receiver);return;}
  const master=config.receivers[0];
  const cloud=async(path,headers,method='GET',body)=>fetchImpl('https://plex.tv/api/v2/'+path,{method,body,headers,redirect:'error',signal:AbortSignal.timeout(10000)});
  const headers={...plexHeaders(receiver),'Content-Type':'application/x-www-form-urlencoded'};
  const pin=await boundedJson(await cloud('pins',headers,'POST',new URLSearchParams({strong:'false'})),65536);
  if(!numeric(pin.id)||typeof pin.code!=='string'||!pin.code||pin.code.length>128)fail('Invalid Plex device link',502);
  const approved=await cloud('pins/link',{...plexHeaders(master),'X-Plex-Product':'Plex SSO','X-Plex-Token':master.token,'Content-Type':'application/x-www-form-urlencoded'},'PUT',new URLSearchParams({code:pin.code}));
  await approved.body?.cancel();if(!approved.ok)fail('Plex device link unavailable',502);
  const linked=await boundedJson(await cloud('pins/'+pin.id,headers),65536);
  if(typeof linked.authToken!=='string'||linked.authToken.length<10||linked.authToken.length>1024||linked.authToken===master.token)fail('Plex device token unavailable',502);
  const owner=await boundedJson(await cloud('user',{...plexHeaders(receiver),'X-Plex-Token':linked.authToken}),65536);
  if(String(owner.id)!==master.accountId)fail('Plex device owner mismatch',403);
  const updated={...discoveryCredentials,[receiver.id]:{ownerScope,token:linked.authToken}};
  await saveDiscoveryCredentials(updated);
  discoveryCredentials=updated;receiver.token=linked.authToken;receiver.needsLink=false;await rememberReceiver(receiver);
 }
 async function announce(receiver){
  const response=await fetchImpl(`https://plex.tv/devices/${encodeURIComponent(receiver.id)}`,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(10000),headers:{...plexHeaders(receiver),'X-Plex-Token':receiver.token,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({'Connection[][uri]':config.advertisedUrl})});
  await response.body?.cancel();if(!response.ok)fail('Plex receiver announcement failed',502);
 }
 // PMS uses its selected queue occurrence when a controller pulls playback home.
 // Serialize per receiver and ignore old snapshots so a delayed poll cannot undo Next.
 const timelineTails=new Map(),timelineStates=new Map();
 async function syncTimeline(receiver,session){
  if(!session||!receiverFor(principalFor(receiver)))return false;
  const previous=timelineTails.get(receiver.id)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   const q=session.queue,item=q?.items[q.index],queueId=q?.source?.playQueueId;
   const occurrence=item?.queueItemId?.match(/^plex-(\d+)-(\d+)$/);
   if(!numeric(queueId)||!occurrence||occurrence[1]!==queueId||!numeric(item.song.id))return false;
   const state=['playing','paused','buffering'].includes(session.status)?session.status:'stopped';
   const signature=`${session.id}:${queueId}:${occurrence[2]}:${state}`;
   const old=timelineStates.get(receiver.id);
   if(old?.sessionId===session.id&&old.revision>session.revision)return false;
   const time=Math.max(0,Math.round((session.position||0)*1000));
   if(old&&old.signature===signature&&now()-old.at<15000&&Math.abs(time-old.time)<5000)return true;
   const params=new URLSearchParams({ratingKey:item.song.id,key:`/library/metadata/${item.song.id}`,state,time:String(time),duration:String(Math.max(0,Math.round((session.duration||0)*1000))),playQueueID:queueId,playQueueItemID:occurrence[2]});
   const response=await request(receiver,'/:/timeline?'+params,{timeoutMs:5000});
   await response.body?.cancel();if(!response.ok)fail('Plex playback position update failed',502);
   timelineStates.set(receiver.id,{signature,sessionId:session.id,revision:session.revision,time,at:now()});return true;
  });
  timelineTails.set(receiver.id,task);
  try{return await task;}finally{if(timelineTails.get(receiver.id)===task)timelineTails.delete(receiver.id);}
 }
 async function report(principal,id,submission){if(!submission)return;const r=receiverFor(principal);if(!r)fail('Plex receiver unlinked',403);if(!numeric(id))fail('Invalid Plex track');const response=await request(r,`/:/scrobble?key=${id}&identifier=com.plexapp.plugins.library`);await response.body?.cancel();if(!response.ok)fail('Plex listening report failed',502);}
 return {config,syncOutputs,ensureReceiverLinked,advertisedReceivers,principalFor,receiverFor,authorize,songFor,mediaFor,queueFor,validateController,checkServer,beginControllerLink,finishControllerLink,announce,syncTimeline,report};
}
