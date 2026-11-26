import {useEffect,useState} from 'react';
import {apiJson} from './services/apiClient.js';

export function listenRefreshInterval(url) {
 if(url.includes('/listening-history/'))return 30000;
 const action=new URL(url,'https://navimuse.invalid').pathname.split('/').at(-1);
 return action==='recent'?30000:action==='mixes'||action==='playlist'?3600000:900000;
}
export const listenIdentity=item=>item.id||JSON.stringify([item.at,item.title,item.artist]);

export function useListenBrainzData(url) {
 const [state,setState]=useState({loading:true}),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let alive=true,timer,busy=false,last=0,failures=0,previous=null;
  const interval=listenRefreshInterval(url);
  const visible=()=>document.visibilityState!=='hidden'&&navigator.onLine!==false;
  const schedule=()=>{clearTimeout(timer);if(alive&&visible())timer=setTimeout(load,interval*Math.min(8,2**failures));};
  async function load(){
   if(!alive||busy||!visible())return;
   busy=true;last=Date.now();
   try {
    const data=await apiJson(url,{signal:controller.signal});
    if(!alive)return;
    const seen=new Set((previous?.items||[]).map(listenIdentity));
    const added=previous?new Set((data.items||[]).filter(item=>!seen.has(listenIdentity(item))).map(listenIdentity)):new Set();
    previous=data;last=Date.now();failures=0;
    setState({data,checkedAt:last,added});
   }catch(error){if(alive){failures++;setState(old=>({...old,loading:false,error:error.message}));}}
   finally{busy=false;schedule();}
  }
  function resume(){clearTimeout(timer);if(visible()){if(Date.now()-last>=interval*Math.min(8,2**failures))void load();else schedule();}}
  setState({loading:true});void load();
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('offline',resume);
  return()=>{alive=false;clearTimeout(timer);controller.abort();document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',resume);};
 },[url,attempt]);
 return {...state,retry:()=>setAttempt(value=>value+1)};
}

export function activityBuckets(items,limit=48) {
 const width=Math.max(1,Math.ceil(items.length/limit));
 return Array.from({length:Math.ceil(items.length/width)},(_,index)=>{
  const group=items.slice(index*width,(index+1)*width),first=group[0],last=group.at(-1);
  const label=item=>item.title||(item.from?new Date(item.from*1000).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'}):'Period');
  return {title:group.length===1?label(first):`${label(first)} – ${label(last)}`,count:group.reduce((sum,item)=>sum+(Number(item.count)||0),0),from:first.from};
 });
}
