import {apiFetch,jsonRequest} from './services/apiClient.js';
const key='navimuse-hls-pilot-v1';let context={scope:null,enabled:false},revision=0;
export function configureNativeHls(next){context={...next};revision++;}
export function hlsPilotEnabled(){try{return window.localStorage.getItem(key)==='true';}catch{return false;}}
export function saveHlsPilot(enabled){window.localStorage.setItem(key,String(Boolean(enabled)));}
export function canTryNativeHls(transport,url){
 if(!context.enabled||!context.scope||!transport?.hls||transport.routeKind==='AirPlay'||!hlsPilotEnabled())return false;
 try {const u=new URL(url,window.location.href);return u.origin===new URL(window.location.href).origin&&/^\/api\/navidrome\/stream\/[^/]+$/.test(u.pathname);}catch{return false;}
}
export async function resolveNativeHls(url,{fetchFn=apiFetch,timeoutMs=900}={}){
 const scope=context.scope,version=revision,u=new URL(url,window.location.href);
 const controller=new AbortController();let timer;
 const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);});
 const request=(async()=>{
  const response=await fetchFn(`/api/navidrome/hls/sessions?accountScope=${encodeURIComponent(scope)}`,jsonRequest('POST',{songId:decodeURIComponent(u.pathname.split('/').at(-1))},{signal:controller.signal}));
  if(response.status!==200)return null;const result=await response.json();
  if(result.state!=='ready'||typeof result.url!=='string'||version!==revision||!context.enabled||!hlsPilotEnabled())return null;
  const hls=new URL(result.url,u);
  if(hls.origin!==u.origin||!/^\/api\/navidrome\/hls\/sessions\/[a-f0-9]{48}\/master\.m3u8$/.test(hls.pathname)||hls.searchParams.getAll('accountScope').length!==1||hls.searchParams.get('accountScope')!==scope)return null;
  return hls.href;
 })().catch(()=>null);
 try{return await Promise.race([request,timeout]);}finally{clearTimeout(timer);controller.abort();}
}

// Fix the progressive startup choice for the pilot. HLS readiness is decided
// before loading, never by swapping codecs during a playing occurrence.
export function pilotProgressiveURL(url){
 const u=new URL(url,window.location.href);
 u.searchParams.set('format','mp3');u.searchParams.set('maxBitRate','192');return u.href;
}
