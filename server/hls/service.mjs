import {createHmac,randomBytes} from 'node:crypto';
import {mediaPath} from './worker.mjs';
export function rewritePlaylist(text,scope){
 const suffix=`?accountScope=${encodeURIComponent(scope)}`;
 const rewrite=value=>{
  // Worker playlists contain only fixed relative paths. Never forward URLs or traversal.
  if(!/^(?:[012]\/index\.m3u8|init_?[012]?\.mp4|seg\d+\.m4s)$/.test(value))throw Error('Invalid HLS reference');return value+suffix;
 };
 return text.split('\n').map(line=>line.startsWith('#')?line.replace(/URI="([^"]+)"/g,(_,uri)=>`URI="${rewrite(uri)}"`):line?rewrite(line):line).join('\n');
}
export function createHlsService({workerUrl,token,enabled=false,allowScopes=[],requestFor,songFor,fetchImpl=fetch,now=Date.now,sessionMs=2*3600000,maxSessions=256}={}){
 const sessions=new Map(),pending=new Map(),failures=new Map();
 const base=workerUrl?new URL(workerUrl):null;
 if(enabled&&(!Array.isArray(allowScopes)||allowScopes.some(s=>typeof s!=='string'||!s)||!base||!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||!token||token.length<32))throw Error('Invalid HLS configuration');
 const allowed=principal=>Boolean(enabled&&allowScopes.includes(principal.scope));
 const worker=(path,options={})=>fetchImpl(new URL(path,base),{...options,headers:{authorization:`Bearer ${token}`,...options.headers},redirect:'error'});
 function expire(){for(const [id,s] of sessions)if(s.expires<=now())sessions.delete(id);for(const [id,t] of failures)if(t<=now())failures.delete(id);}
 async function song(principal,id){const value=await songFor(principal,id);if(!value||!Number.isFinite(Number(value.duration))||Number(value.duration)<=0||Number(value.duration)>1800)throw Error('Unsupported track');return value;}
 return {
  enabledFor:allowed,
  async prepare(principal,id){
   if(!allowed(principal))return {state:'disabled'};
   if(typeof id!=='string'||!id||id.length>512||id.startsWith('radio:'))throw Error('Invalid track');
   expire();const metadata=await song(principal,id);
   const key=createHmac('sha256',token).update(JSON.stringify([principal.scope,principal.binding||'',id,metadata.size,metadata.duration,metadata.changed,metadata.suffix])).digest('hex');
   const status=await worker(`/jobs/${key}`,{signal:AbortSignal.timeout(800)});
   const jobState=status.ok?(await status.json()).state:null;
   if(!status.ok){await status.body?.cancel();if(status.status!==404)throw Error('Worker unavailable');}
   if(jobState==='preparing')return {state:'preparing'};
   if(jobState==='ready'){
    let entry=[...sessions.entries()].find(([,s])=>s.scope===principal.scope&&s.key===key&&s.expires>now()+60000);
    if(!entry){if(sessions.size>=maxSessions)return {state:'busy'};const sid=randomBytes(24).toString('hex'),s={scope:principal.scope,binding:principal.binding||'',key,id,expires:now()+sessionMs};sessions.set(sid,s);entry=[sid,s];}
    return {state:'ready',url:`/api/navidrome/hls/sessions/${entry[0]}/master.m3u8?accountScope=${encodeURIComponent(principal.scope)}`};
   }
   if(!pending.has(key)&&!failures.has(key)&&pending.size<4){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
    const work=(async()=>{
     let source;
     try{
      source=await requestFor(principal,'/rest/stream.view',{id,format:'raw',maxBitRate:0},{formatJson:false,signal:controller.signal});
      if(!source.ok||!source.body||!(/^(audio\/|application\/octet-stream)/i.test(source.headers.get('content-type')||'')))throw Error('Source unavailable');
      const result=await worker(`/jobs/${key}`,{method:'POST',headers:{'content-type':'application/octet-stream','x-hls-duration':String(metadata.duration)},body:source.body,duplex:'half',signal:controller.signal});
      if(!result.ok)throw Error('Worker unavailable');await result.body?.cancel();
     }catch{failures.set(key,now()+60000);}
     finally{controller.abort();clearTimeout(timer);await source?.body?.cancel().catch(()=>{});pending.delete(key);}
    })();pending.set(key,{work,controller});
   }
   return {state:'preparing'};
  },
  async media(principal,sid,file){
   expire();const s=sessions.get(sid);
   // Existing sessions can drain even after allowlist removal. Authentication is still checked.
   if(!s||s.scope!==principal.scope||s.binding!==(principal.binding||'')||!mediaPath.test(file))return null;
   await song(principal,s.id); // Recheck upstream access; cached media never bypasses library permissions.
   const response=await worker(`/jobs/${s.key}/${file}`,{signal:AbortSignal.timeout(5000)});
   if(!response.ok){await response.body?.cancel();return null;}
   const chunks=[];let length=0;const reader=response.body.getReader();
   try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4*1024**2)throw Error('Segment limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   const body=Buffer.concat(chunks,length);
   return {body:file.endsWith('.m3u8')?Buffer.from(rewritePlaylist(body.toString(),s.scope)):body,type:file.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'audio/mp4'};
  },
  async close(){for(const p of pending.values())p.controller.abort();await Promise.allSettled([...pending.values()].map(x=>x.work));sessions.clear();}
 };
}
