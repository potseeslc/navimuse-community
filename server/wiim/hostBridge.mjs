import {timingSafeEqual} from 'node:crypto';
import {PlaybackError} from '../../shared/wiim/contract.js';
import {createWiiMDevice,validateDevice} from './device.mjs';

const actions=new Set(['topology','observe','readVolume','delivery','load','prepareNext','clearNext','queuedMedia','play','pause','stop','seek','volume']);
export function createBridgeDevice(configuration,{origin,key,fetchImpl=fetch}){
 const device=validateDevice(configuration),base=new URL(origin);
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!key)throw new Error('Invalid WiiM host bridge configuration');
 const call=async(action,value)=>{
  const response=await fetchImpl(new URL('/command',base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({uuid:device.uuid,action,value})});
  const result=await response.json();if(!response.ok)throw new PlaybackError(result.error||'Speaker host unavailable',response.status);return result.value;
 };
 return {configuration:device,topology:async()=>({...await call('topology'),id:device.id}),observe:()=>call('observe'),readVolume:()=>call('readVolume'),delivery:value=>call('delivery',value),load:value=>call('load',value),prepareNext:value=>call('prepareNext',value),clearNext:()=>call('clearNext'),queuedMedia:()=>call('queuedMedia'),play:()=>call('play'),pause:()=>call('pause'),stop:()=>call('stop'),seek:value=>call('seek',value),volume:value=>call('volume',value)};
}
export function createHostBridgeHandler({key,devices,mediaBaseUrl,deviceFor=createWiiMDevice}){
 const expected=Buffer.from(`Bearer ${key}`),base=new URL(mediaBaseUrl);
 if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid bridge key');
 const media=(raw,kind)=>{let url;try{url=new URL(raw);}catch{throw new PlaybackError('Invalid media');}if(url.origin!==base.origin||url.username||url.password||url.search||url.hash||!new RegExp(`^/media/wiim/[A-Za-z0-9_-]{32}/${kind}$`).test(url.pathname))throw new PlaybackError('Invalid media');return url.href;};
 const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
 return async(req,res)=>{
  const provided=Buffer.from(req.headers.authorization||'');
  if(provided.length!==expected.length||!timingSafeEqual(provided,expected)){reply(res,401,{error:'Unauthorized'});return;}
  try{
   if(req.method!=='POST'||req.url!=='/command')throw new PlaybackError('Not found',404);
   let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>32768)throw new PlaybackError('Request too large',413);body+=chunk;}
   let input;try{input=JSON.parse(body);}catch{throw new PlaybackError('Invalid command');}
   const configuration=devices().find(d=>d.uuid===input?.uuid);
   if(!configuration||!actions.has(input.action))throw new PlaybackError('Unknown speaker or command',404);
   const d=deviceFor(configuration);let value=input.value;
   if(input.action==='load'||input.action==='prepareNext'){
    if(!value||!value.song||typeof value.song!=='object')throw new PlaybackError('Invalid media');
    const song={};for(const field of ['title','artist','album','contentType']){if(value.song[field]!==undefined&&(typeof value.song[field]!=='string'||value.song[field].length>1024))throw new PlaybackError('Invalid metadata');song[field]=value.song[field]||'';}
    if(value.song.isRadio!==undefined&&typeof value.song.isRadio!=='boolean')throw new PlaybackError('Invalid radio metadata');
    if(value.song.isRadio===true)song.isRadio=true;
    song.duration=Number(value.song.duration)||0;if(!Number.isFinite(song.duration)||song.duration<0||song.duration>86400)throw new PlaybackError('Invalid duration');
    value={song,uri:media(value.uri,'audio'),art:media(value.art,'art\\.jpg'),paused:value.paused===true,position:0};
   }
   if(input.action==='delivery')value={uri:media(value?.uri,'audio'),art:media(value?.art,'art\\.jpg')};
   if(input.action==='seek'&&(!Number.isFinite(value)||value<0||value>86400))throw new PlaybackError('Invalid position');
   if(input.action==='volume'&&(!Number.isInteger(value)||value<0||value>100))throw new PlaybackError('Invalid volume');
   reply(res,200,{value:await d[input.action](value)??null});
  }catch(error){if(error.code)console.error('WiiM host transport: '+String(error.code).replace(/[^A-Z0-9_]/g,''));if(!res.headersSent)reply(res,error instanceof PlaybackError?error.status:502,{error:error instanceof PlaybackError?error.message:'Speaker host request failed'});else res.destroy();}
 };
}
