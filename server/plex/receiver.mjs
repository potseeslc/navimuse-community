import {createControllerAccess} from './controllers.mjs';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {PlaybackError} from '../../shared/wiim/contract.js';
import {xmlEscape} from '../wiim/device.mjs';
import {localAddress} from './source.mjs';
const xmlAttrs=values=>Object.entries(values).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>`${k}="${xmlEscape(v)}"`).join(' ');
const stopped=new Set(['released','external','error','ended','unreachable']);
const number=(value,min,max)=>{const n=Number(value);if(value===null||value===''||!Number.isFinite(n)||n<min||n>max)throw new PlaybackError('Invalid playback parameter');return n;};
export function plexTimeline(receiver,session,server,commandID=0){
 const playing=session&&!stopped.has(session.status),q=session?.queue,item=q?.items[q.index];
 const info={type:'music',itemType:'music',state:playing?(session.status==='paused'?'paused':session.status==='playing'?'playing':'buffering'):'stopped',time:Math.round((session?.position||0)*1000),duration:Math.round((session?.duration||0)*1000),volume:Number.isInteger(session?.volume)?session.volume:undefined,controllable:'playPause,stop,seekTo,skipPrevious,skipNext,volume,shuffle,repeat',machineIdentifier:server.machineIdentifier,...(playing?{ratingKey:item?.song.id,key:`/library/metadata/${item?.song.id}`,containerKey:`/playQueues/${q?.source?.playQueueId}`,playQueueID:q?.source?.playQueueId,playQueueVersion:q?.source?.playQueueVersion,playQueueItemID:item?.queueItemId.split('-').at(-1),shuffle:session.controls.shuffle?1:0,repeat:session.controls.repeat?1:session.controls.repeatAll?2:0}:{}),address:new URL(server.url).hostname,port:new URL(server.url).port||80,protocol:new URL(server.url).protocol.slice(0,-1)};
 return `<MediaContainer commandID="${xmlEscape(commandID)}"><Timeline ${xmlAttrs(info)}/><Timeline type="video" state="stopped"/><Timeline type="photo" state="stopped"/></MediaContainer>`;
}
// A room receiver follows its existing WiiM group; it never creates or splits groups.
export function plexOutputDevice(outputs,deviceId){
 const target=outputs.find(d=>d.id===deviceId&&d.available);
 if(!target)throw new PlaybackError('Plex speaker unavailable',503);
 if(!target.follower)return target.id;
 const normalize=id=>String(id||'').replace(/^uuid:/i,'').replaceAll('-','').toLowerCase();
 const leaders=outputs.filter(d=>d.available&&!d.follower&&d.id!==target.id&&d.members?.some(m=>
  (target.uuid&&normalize(m.id)===normalize(target.uuid))||(target.address&&m.address===target.address)));
 if(leaders.length!==1)throw new PlaybackError('Plex speaker group leader unavailable or ambiguous',409);
 return leaders[0].id;
}
export function createPlexReceiver({source,coordinator,now=Date.now,audit=()=>{},controllerStore,health=()=>({})}){
 const access=createControllerAccess({source,store:controllerStore,now,audit});
 const tails=new Map(),linkedControllers=new Map(),counts=new Map(),pollStates=new Map();let closed=false,inflight=0;
 const serial=(id,fn)=>{const previous=tails.get(id)||Promise.resolve();const promise=previous.catch(()=>{}).then(fn);tails.set(id,promise);promise.finally(()=>{if(tails.get(id)===promise)tails.delete(id);}).catch(()=>{});return promise;};
 const windowAttempts=new Map();
 async function refreshSession(receiver,session,direction){
  const q=session?.queue;if(!q?.source?.windowed||stopped.has(session.status))return session;
  const needed=q.source.hasMoreAfter&&q.items.length-q.index<=10||direction==='previous'&&q.source.hasMoreBefore&&q.index<5;
  if(!needed)return session;
  const marker=`${session.id}:${q.items[q.index].queueItemId}:${direction||'ahead'}`,last=windowAttempts.get(receiver.id);
  if(last?.marker===marker&&now()-last.at<10000)return session;
  windowAttempts.set(receiver.id,{marker,at:now()});
  const principal=source.principalFor(receiver),queue=await source.queueFor(receiver,new URLSearchParams({containerKey:`/playQueues/${q.source.playQueueId}`}),{currentItemId:q.items[q.index].queueItemId});
  return coordinator.command(principal,session.id,{commandId:randomUUID(),revision:session.revision,action:'syncQueue',queue});
 }
 async function refreshWindow(receiver){return serial(receiver.id,async()=>refreshSession(receiver,await coordinator.snapshot(source.principalFor(receiver))));}
 const reply=(res,status,body,receiver)=>{res.writeHead(status,{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(receiver?{'X-Plex-Client-Identifier':receiver.id,'X-Plex-Protocol':'1.0'}:{})});res.end(body);};
 const fail=message=>{throw new PlaybackError(message);};
 async function handle(req,res){
  let receiver,stage='request',route='unknown',logPoll=false;const began=now();
  const diagnostic={tokenPresent:false,controllerPresent:false};
  res.once('finish',()=>{if(route!=='/player/timeline/poll'||res.statusCode>=400||logPoll)audit({route,stage,status:res.statusCode,elapsedMs:now()-began,...diagnostic});});
  try{
   if(closed||inflight>=32)throw new PlaybackError('Receiver busy',503);
   inflight++;res.once('close',()=>inflight--);
   if(!localAddress(req.socket.remoteAddress))throw new PlaybackError('Local network access required',403);
   const ip=req.socket.remoteAddress,minute=Math.floor(now()/60000),rate=counts.get(ip);
   if(!rate||rate.minute!==minute){if(counts.size>256)counts.clear();counts.set(ip,{minute,n:1});}else if(++rate.n>300)throw new PlaybackError('Too many requests',429);
   if(req.url.length>8192)throw new PlaybackError('Request too large',413);
   const pairUrl=new URL(req.url,'http://receiver');
   if(await access.handle(req,res,pairUrl))return;
   if(pairUrl.pathname==='/health'&&req.method==='GET'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({receiver:'ready',...coordinator.health?.(),...health()}));return;
   }
   const origin=req.headers.origin;
   if(origin&&origin!=='https://app.plex.tv')throw new PlaybackError('Origin not allowed',403);
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','X-Plex-Client-Identifier, X-Plex-Target-Client-Identifier, X-Plex-Token, X-Plex-Device-Name');}
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');reply(res,204,'');return;}
   if(req.method!=='GET')throw new PlaybackError('Method not allowed',405);
   const url=new URL(req.url,'http://receiver'),p=url.searchParams;
   if(/^\/(?:resources|player\/(?:timeline\/(?:poll|subscribe|unsubscribe)|playback\/(?:playMedia|refreshPlayQueue|play|pause|stop|seekTo|skipNext|skipPrevious|skipTo|setParameters)))$/.test(url.pathname))route=url.pathname;
   diagnostic.type=['music','audio','video','photo'].includes(p.get('type'))?p.get('type'):p.has('type')?'other':'absent';
   const target=req.headers['x-plex-target-client-identifier']||p.get('X-Plex-Target-Client-Identifier');
   const visible=source.advertisedReceivers();
   if(url.pathname==='/resources'){
    const players=target?visible.filter(r=>r.id===target):visible;
    if(target&&!players.length)throw new PlaybackError('Plex receiver unavailable',404);
    receiver=players.length===1?players[0]:undefined;
    const token=req.headers['x-plex-token']||p.get('X-Plex-Token'),controller=req.headers['x-plex-client-identifier']||p.get('X-Plex-Client-Identifier');
    if(receiver&&token&&typeof controller==='string'&&/^[\w.-]{1,200}$/.test(controller)){
     if(!await source.validateController(receiver,token))throw new PlaybackError('Plex account does not own this receiver',403);
     await access.grant(ip,controller,[receiver]);
    }
    reply(res,200,`<MediaContainer>${players.map(r=>`<Player ${xmlAttrs({title:r.name,machineIdentifier:r.id,product:'NaviMuse',version:'0.2.0',platform:'NaviMuse Server',platformVersion:'1',protocol:'plex',protocolVersion:'1',protocolCapabilities:'timeline,playback,playqueues',deviceClass:'stb'})}/>`).join('')}</MediaContainer>`,receiver);return;
   }
   receiver=source.config.receivers.find(r=>r.id===target)||(!target&&source.config.receivers.length===1?source.config.receivers[0]:undefined);
   if(!receiver)throw new PlaybackError('Unknown Plex receiver',404);
   const controller=req.headers['x-plex-client-identifier']||p.get('X-Plex-Client-Identifier');
   if(typeof controller!=='string'||!/^[\w.-]{1,200}$/.test(controller))fail('A Plex controller identity is required');
   // Plexamp's long-poll transport uses the command controller ID + "-wait".
   // Share its existing authorization only for wait=1 timeline reads, never commands.
   const bindingController=url.pathname==='/player/timeline/poll'&&p.get('wait')==='1'&&controller.endsWith('-wait')&&controller.length>5?controller.slice(0,-5):controller;
   const controllerKey=`${ip}:${receiver.id}:${bindingController}`;
   const token=req.headers['x-plex-token']||p.get('X-Plex-Token')||p.get('token');
   diagnostic.tokenPresent=Boolean(token);diagnostic.controllerPresent=Boolean(controller);stage='authentication';
   let authorized=(linkedControllers.get(controllerKey)||0)>now()||access.allowed(ip,bindingController,receiver);
   if(token){if(!await source.validateController(receiver,token))throw new PlaybackError('Plex account does not own this receiver',403);if(linkedControllers.size>=256)linkedControllers.delete(linkedControllers.keys().next().value);linkedControllers.set(controllerKey,now()+30*60000);if(!access.allowed(ip,bindingController,receiver))await access.grant(ip,bindingController,[receiver]);authorized=true;}
   if(!authorized)access.observe(ip,bindingController,receiver);
   diagnostic.controller=createHash('sha256').update(controllerKey).digest('hex').slice(0,12);
   // Plexamp probes timelines before sending playMedia with an account or delegated PMS token.
   // Unlinked probes get only a stopped receiver, never a user's playback state.
   if(!authorized&&url.pathname!=='/player/timeline/poll')throw new PlaybackError('Link this controller to the receiver with your Plex account',401);
   if(authorized)linkedControllers.set(controllerKey,now()+30*60000);
   const principal=source.principalFor(receiver),commandID=p.get('commandID')||'0';
   if(!/^\d{1,15}$/.test(commandID))fail('Invalid command ID');diagnostic.commandID=commandID;
   if(url.pathname==='/player/timeline/poll'){
    if(p.get('wait')==='1')await new Promise(resolve=>{const timer=setTimeout(resolve,1000);res.once('close',()=>{clearTimeout(timer);resolve();});});
    if(res.destroyed)return;
    // A playMedia may authenticate while this poll is waiting. Recheck after
    // the wait so an old idle probe cannot overwrite freshly started playback.
    authorized=(linkedControllers.get(controllerKey)||0)>now()||access.allowed(ip,bindingController,receiver);
    const session=authorized?await coordinator.snapshot(principal):null;
    if(session&&['playing','paused','buffering'].includes(session.status)){try{await source.syncTimeline(receiver,session);}catch{diagnostic.serverTimeline='unavailable';}}
    diagnostic.authorized=authorized;diagnostic.playbackState=session?.status||'idle';
    diagnostic.hasAudioDelivery=Boolean(session?.delivery?.codec);
    const signature=JSON.stringify([authorized,diagnostic.playbackState,diagnostic.hasAudioDelivery]);
    const last=pollStates.get(controllerKey);logPoll=!last||last.signature!==signature||now()-last.at>=30000;
    if(logPoll){if(pollStates.size>=256)pollStates.delete(pollStates.keys().next().value);pollStates.set(controllerKey,{signature,at:now()});}
    reply(res,200,plexTimeline(receiver,session,source.config.server,commandID),receiver);return;
   }
   if(p.has('type')&&p.get('type')!=='music')throw new PlaybackError('This receiver plays music only',422);
   if(!url.pathname.startsWith('/player/playback/'))throw new PlaybackError('Unsupported Plex command',404);
   // Scope retries to the controller. The coordinator persists completed IDs
   // so retransmissions cannot repeat a transport operation.
   const requestId=createHash('sha256').update(`${receiver.id}:${controller}:${p.has('commandID')?commandID:randomUUID()}`).digest('hex');
   const operation=url.pathname.slice('/player/playback/'.length);
   await serial(receiver.id,async()=>{
    let session=await coordinator.snapshot(principal);
    if(operation==='skipNext'||operation==='skipPrevious'){
     try{session=await refreshSession(receiver,session,operation==='skipPrevious'?'previous':'next');}
     catch(error){const q=session?.queue;if(!q||operation==='skipNext'&&q.index>=q.items.length-1||operation==='skipPrevious'&&q.index===0)throw error;diagnostic.queueRefresh='unavailable';}
    }
    const command=(action,extra={},suffix='')=>coordinator.command(principal,session.id,{commandId:requestId+suffix,revision:session.revision,action,...extra});
    stage='command';
    if(operation==='playMedia'){
     stage='queue';
     const queue=await source.queueFor(receiver,p),position=p.has('offset')?number(p.get('offset'),0,86400000)/1000:0,paused=p.get('paused')==='1'||p.get('paused')==='true';
     if(position>queue.items[queue.index].song.duration)fail('Playback offset exceeds track duration');
     stage='speaker';
     if(!session||stopped.has(session.status)&&session.status!=='unreachable'){
      const deviceId=plexOutputDevice(await coordinator.outputs(),receiver.deviceId);
      session=await coordinator.create(principal,{transferId:requestId,deviceId,queue,position,paused});
     }else session=await command('replace',{queue,position,paused});
    }else if(operation==='refreshPlayQueue'){
     stage='speaker';
     if(!session||stopped.has(session.status))throw new PlaybackError('No active Plex queue',409);
     if(p.get('playQueueID')!==session.queue.source?.playQueueId)throw new PlaybackError('Queue changed',409);
     const q=new URLSearchParams({containerKey:`/playQueues/${p.get('playQueueID')}`});
     const queue=await source.queueFor(receiver,q,{currentItemId:session.queue.items[session.queue.index].queueItemId});
     await command('syncQueue',{queue});
    }else {
     if(!session)throw new PlaybackError('No Plex playback session',409);
     const actions={play:'play',pause:'pause',stop:'release',skipNext:'next',skipPrevious:'previous'};
     if(actions[operation])await command(actions[operation]);
     else if(operation==='seekTo')await command('seek',{position:number(p.get('offset'),0,86400000)/1000});
     else if(operation==='skipTo'){
      const index=session.queue.items.findIndex(item=>p.get('playQueueItemID')?item.queueItemId===`plex-${session.queue.source?.playQueueId}-${p.get('playQueueItemID')}`:`/library/metadata/${item.song.id}`===p.get('key'));
      if(index<0)fail('Queue item unavailable');await command('select',{index});
     }else if(operation==='setParameters'){
      if(!['volume','shuffle','repeat'].some(k=>p.has(k)))fail('Unsupported playback parameter');
      const controls={};if(p.has('shuffle')){const shuffle=number(p.get('shuffle'),0,1);if(!Number.isInteger(shuffle))fail('Invalid shuffle mode');controls.shuffle=shuffle===1;}
      if(p.has('repeat')){const repeat=number(p.get('repeat'),0,2);if(!Number.isInteger(repeat))fail('Invalid repeat mode');controls.repeat=repeat===1;controls.repeatAll=repeat===2;}
      if(p.has('volume')){const volume=number(p.get('volume'),0,100);if(!Number.isInteger(volume))fail('Invalid volume');session=await command('volume',{volume},'v');}
      if(Object.keys(controls).length)await command('controls',{controls},'c');
     }else throw new PlaybackError('Unsupported Plex command',404);
    }
    try{await source.syncTimeline(receiver,await coordinator.snapshot(principal));}catch{diagnostic.serverTimeline='unavailable';}
   });
   reply(res,200,'<Response code="200" status="OK"/>',receiver);
  }catch(error){diagnostic.reason=error instanceof PlaybackError?error.message:'Upstream request failed';if(!res.headersSent&&!res.destroyed)reply(res,error instanceof PlaybackError?error.status:502,`<Response code="${error instanceof PlaybackError?error.status:502}" status="${xmlEscape(error instanceof PlaybackError?error.message:'Plex receiver request failed')}"/>`,receiver);else if(!res.destroyed)res.destroy();}
 }
 return {handle,refreshWindow,close:async()=>{closed=true;await access.close();await Promise.allSettled([...tails.values()]);}};
}
export function startPlexReceiver({source,coordinator,controllerStore,logger=console}){
 const state={plexServer:'pending',registration:'pending',lastRegistrationAt:null,playbackReporting:'pending'};
 const receiver=createPlexReceiver({source,coordinator,controllerStore,health:()=>({...state,availableReceivers:source.advertisedReceivers().length,controllerRecovery:controllerStore?.recovery}),audit:event=>logger.info('Plex Companion',JSON.stringify(event))});
 const server=createServer({requestTimeout:15000,headersTimeout:10000,maxHeaderSize:16384},receiver.handle);
 let announcing=false,closed=false;
 const announce=async()=>{if(announcing||closed)return;announcing=true;try{try{await source.checkServer();state.plexServer='ready';}catch{state.plexServer='unavailable';}state.registration='ready';if(source.config.autoDiscover)source.syncOutputs(await coordinator.outputs());for(const r of source.config.receivers.filter(r=>r.available!==false)){try{await source.ensureReceiverLinked(r);await source.announce(r);}catch{state.registration='degraded';logger.error('Plex speaker registration unavailable; will retry');}}state.lastRegistrationAt=Date.now();}catch{state.registration='unavailable';logger.error('Plex receiver announcement unavailable; will retry');}finally{announcing=false;}};
 // Keep PMS current even while the phone is asleep and not polling the receiver.
 let reporting=false;
 const reportPlayback=async()=>{if(reporting||closed)return;reporting=true;try{
  state.playbackReporting='ready';
  for(const r of source.advertisedReceivers()){
   if(closed)break;
   try{const session=await receiver.refreshWindow(r);if(session&&['playing','paused','buffering'].includes(session.status))await source.syncTimeline(r,session);}catch{state.playbackReporting='degraded';logger.error('Plex playback position update unavailable; will retry');}
  }
 }finally{reporting=false;}};
 const playbackTimer=setInterval(reportPlayback,5000);playbackTimer.unref();
 const timer=setInterval(announce,60000);timer.unref();
 server.on('error',()=>logger.error('Plex receiver listener unavailable'));
 server.listen(source.config.port,'0.0.0.0',()=>{logger.log('NaviMuse Plex speaker receiver ready');void announce();});
 return {close:async()=>{closed=true;clearInterval(timer);clearInterval(playbackTimer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await receiver.close();}};
}
