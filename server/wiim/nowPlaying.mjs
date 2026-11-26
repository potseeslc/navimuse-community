import {randomBytes,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {PlaybackError} from '../../shared/wiim/contract.js';
import {remoteNowPlayingPublication} from '../../shared/wiim/remoteNowPlaying.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const terminal=new Set(['released','external','error','ended']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const denied=()=>new PlaybackError('Remote player authorization expired; reopen NaviMuse',403);

// These grants authorize only the remote display adapter, not the general BFF.
export async function openNowPlayingService({directory,coordinator,authorize,now=Date.now}) {
 await mkdir(directory,{recursive:true,mode:0o700});const file=join(directory,'grants-v1.json');
 let records=[];try{const saved=JSON.parse(await readFile(file,'utf8'));if(saved.version!==1||!Array.isArray(saved.records)||saved.records.length>1000)throw Error('Invalid Now Playing grants');records=saved.records;}catch(e){if(e.code!=='ENOENT')throw e;}
 let tail=Promise.resolve();const serial=fn=>{const task=tail.then(fn);tail=task.catch(()=>{});return task;};
 const save=async()=>{await writeFile(file+'.tmp',JSON.stringify({version:1,records}),{mode:0o600});await rename(file+'.tmp',file);};
 const prune=()=>{records=records.filter(r=>r.expiresAt>now()||(r.pushToken&&r.expiresAt>now()-300000));};
 async function resolve(token){
  if(typeof token!=='string'||!/^np_[A-Za-z0-9_-]{43}$/.test(token))throw denied();
  const record=records.find(r=>r.hash===hash(token)&&!r.revoked&&r.expiresAt>now());if(!record)throw denied();
  await authorize(record.principal);
  const session=await coordinator.snapshot(record.principal);
  if(!session||session.id!==record.sessionID||terminal.has(session.status))throw denied();
  // Revocation may happen during upstream authorization/observation awaits.
  if(!records.includes(record)||record.expiresAt<=now())throw denied();
  return {record,session};
 }
 return {
  issue:(principal,input)=>serial(async()=>{
   if(!input||!uuid.test(input.installationID)||!uuid.test(input.sessionID))throw new PlaybackError('Invalid remote player registration',400);
   await authorize(principal);const session=await coordinator.snapshot(principal);
   if(!session||session.id!==input.sessionID||!['playing','paused','buffering'].includes(session.status))throw new PlaybackError('A confirmed speaker session is required',409);
   prune();const prior=records.find(r=>r.principal.id===principal.id&&r.installationID===input.installationID&&r.sessionID===session.id&&!r.revoked);
   records=records.filter(r=>!(r.principal.id===principal.id&&r.installationID===input.installationID));
   if(records.length>=1000||records.filter(r=>r.principal.id===principal.id).length>=8)throw new PlaybackError('Too many remote player registrations',429);
   const token='np_'+randomBytes(32).toString('base64url');const expiresAt=now()+90*24*60*60*1000;
   // Do not persist the upstream descriptive object or any service credentials.
   const identity=Object.fromEntries(['id','scope','mode','generation','binding','accountId','authorizationGeneration','bindingRevision','queueScope','oidcSubject','musicRevision'].filter(k=>principal[k]!==undefined).map(k=>[k,principal[k]]));
   records.push({hash:hash(token),principal:identity,installationID:input.installationID,sessionID:session.id,expiresAt,...(prior?.pushToken?{pushToken:prior.pushToken}:{})});await save();
   return {token,expiresAt,sessionID:session.id,publication:remoteNowPlayingPublication(session)};
  }),
  snapshot:token=>serial(async()=>remoteNowPlayingPublication((await resolve(token)).session)),
  command:(token,input)=>serial(async()=>{
   if(!input||!['play','pause','next','previous','seek'].includes(input.action)||
      typeof input.commandId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.commandId)||!Number.isSafeInteger(input.revision)||input.revision<0||
      (input.action==='seek'&&(!Number.isFinite(input.position)||input.position<0)))throw new PlaybackError('Invalid remote player command',400);
   const {record}=await resolve(token);
   const command={action:input.action,commandId:input.commandId,revision:input.revision};if(input.action==='seek')command.position=input.position;
   return remoteNowPlayingPublication(await coordinator.command(record.principal,record.sessionID,command));
  }),
  artwork:token=>serial(async()=>{const {record,session}=await resolve(token);if(!session.song?.coverArt)throw new PlaybackError('Artwork unavailable',404);return {principal:record.principal,songID:session.song.id,artworkID:session.song.coverArt,isRadio:Boolean(session.queue?.internetRadio)};}),
  registerPush:(token,input)=>serial(async()=>{const {record}=await resolve(token);if(!input||!/^([a-f0-9]{2}){16,256}$/i.test(input.pushToken))throw new PlaybackError('Invalid push registration',400);record.pushToken=input.pushToken.toLowerCase();delete record.lastPush;await save();return {ok:true};}),
  revoke:token=>serial(async()=>{if(typeof token!=='string')throw denied();const record=records.find(r=>r.hash===hash(token));if(record)record.revoked=true;await save();}),
  revokePrincipal:principal=>serial(async()=>{for(const record of records)if(record.principal.id===principal.id)record.revoked=true;await save();}),
  // Internal delivery jobs must authorize again before using a saved APNs token.
  deliveries:()=>serial(async()=>{prune();const result=[];for(const record of records){if(!record.pushToken)continue;try{if(record.revoked||record.expiresAt<=now())throw denied();await authorize(record.principal);const session=await coordinator.snapshot(record.principal);result.push({key:record.hash,pushToken:record.pushToken,sessionID:record.sessionID,publication:!session||session.id!==record.sessionID?{kind:'end'}:remoteNowPlayingPublication(session)});}catch(error){result.push({key:record.hash,pushToken:record.pushToken,sessionID:record.sessionID,publication:{kind:error.status===403?'end':'retain'}});}}return result;}),
  deliveryFor:(key,pushToken)=>serial(async()=>{
   const record=records.find(r=>r.hash===key&&r.pushToken===pushToken);if(!record)return null;
   let publication;try{if(record.revoked||record.expiresAt<=now())throw denied();await authorize(record.principal);const session=await coordinator.snapshot(record.principal);publication=!session||session.id!==record.sessionID?{kind:'end'}:remoteNowPlayingPublication(session);}catch(error){publication={kind:error.status===403?'end':'retain'};}
   return {key,pushToken,sessionID:record.sessionID,publication};
  }),
  removePush:key=>serial(async()=>{const record=records.find(r=>r.hash===key);if(record){delete record.pushToken;await save();}}),
  close:()=>tail,
 };
}

export function createNowPlayingHandler({service,principalFor,requestFor,radioMediaFor,readBody}) {
 const prefix='/api/playback/wiim/now-playing';
 const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix))return false;
  try{
   if(!service)throw new PlaybackError('Remote system player is not enabled',503);
   const path=url.pathname.slice(prefix.length);
   if(path==='/grant'&&req.method==='POST'){
    const principal=await principalFor(req,res,url);if(principal)send(res,201,await service.issue(principal,await readBody(req)));return true;
   }
   if(url.search)throw new PlaybackError('Unexpected remote player query',400);
   const match=/^Bearer (np_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'');if(!match)throw denied();const token=match[1];
   if(path==='/snapshot'&&req.method==='GET')send(res,200,await service.snapshot(token));
   else if(path==='/commands'&&req.method==='POST')send(res,200,await service.command(token,await readBody(req)));
   else if(path==='/push-token'&&req.method==='POST')send(res,200,await service.registerPush(token,await readBody(req)));
   else if(path==='/grant'&&req.method==='DELETE'){await service.revoke(token);send(res,200,{ok:true});}
   else if(path==='/artwork'&&req.method==='GET'){
    const art=await service.artwork(token),signal=AbortSignal.timeout(8000);
    const response=art.isRadio?await radioMediaFor(art.principal,art.songID,{artwork:true,signal}):await requestFor(art.principal,'/rest/getCoverArt.view',{id:art.artworkID,size:600},{formatJson:false,signal});
    const type=response.headers.get('content-type')||'';
    if(response.status!==200||!/^image\/(jpeg|png|webp)(;|$)/i.test(type)){await response.body?.cancel();throw new PlaybackError('Artwork unavailable',502);}
    const chunks=[];let length=0;for await(const chunk of response.body||[]){length+=chunk.length;if(length>2*1024*1024)throw new PlaybackError('Artwork too large',502);chunks.push(chunk);}
    // Reject an account/session change or track change during image fetch.
    const current=await service.artwork(token);if(current.artworkID!==art.artworkID||current.songID!==art.songID)throw new PlaybackError('Artwork changed',409);
    res.writeHead(200,{'content-type':type,'cache-control':'private, no-store','x-content-type-options':'nosniff'});res.end(Buffer.concat(chunks));
   }else throw new PlaybackError('Remote player route not found',404);
  }catch(error){if(!res.headersSent)send(res,error instanceof PlaybackError?error.status:502,{ok:false,error:error instanceof PlaybackError?error.message:'Remote player unavailable'});else res.destroy();}
  return true;
 };
}
