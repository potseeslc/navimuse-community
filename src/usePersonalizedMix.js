import {useEffect,useRef,useState} from 'react';
import {createPlaylist} from './playlists.js';

export function usePersonalizedMix({apiFetch,scope,enabled,onSaved}) {
 const [state,setState]=useState({mix:null,busy:false,loading:false,saving:false,saved:false,message:''});
 const current=useRef(0),job=useRef(null),saveJob=useRef(null);
 useEffect(()=>{
  const generation=++current.current;const controller=new AbortController();
  setState({mix:null,busy:false,loading:enabled,saving:false,saved:false,message:''});
  if(enabled)void apiFetch('/api/navidrome/personalized-mix',{signal:controller.signal}).then(async response=>{
   const result=await response.json();if(!response.ok)throw Error(result.error||'Your mix is unavailable.');
   if(current.current===generation)setState(s=>({...s,mix:result.mix,loading:false}));
  }).catch(error=>{if(!controller.signal.aborted&&current.current===generation)setState(s=>({...s,loading:false,message:error.message}));});
  return ()=>{current.current++;controller.abort();job.current?.abort();job.current=null;saveJob.current=null;};
 },[scope,enabled,apiFetch]);
 async function refresh(){
  if(!enabled||job.current)return;
  const controller=new AbortController(),generation=current.current;job.current=controller;
  setState(s=>({...s,busy:true,message:''}));
  const timer=setTimeout(()=>controller.abort(),90000);
  try{
   const response=await apiFetch('/api/navidrome/personalized-mix',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'NaviMuse'},body:'{}',signal:controller.signal});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Your mix could not refresh.');
   if(generation===current.current)setState(s=>({...s,mix:result.mix||s.mix,saved:result.empty?s.saved:false,message:result.empty?'Listen to more music to shape your mix. Your listening history needs analyzed tracks.':''}));
  }catch(error){if(generation===current.current)setState(s=>({...s,message:controller.signal.aborted?'The refresh took too long. Your previous mix is still available.':error.message}));}
  finally{clearTimeout(timer);if(job.current===controller){job.current=null;setState(s=>({...s,busy:false}));}}
 }
 async function save(){
  if(!enabled||saveJob.current||!state.mix?.tracks.length||state.saved)return;
  const generation=current.current,marker={};saveJob.current=marker;setState(s=>({...s,saving:true,message:''}));
  try{
   const playlist=await createPlaylist(apiFetch,{name:'Your Personalized Mix',songIds:state.mix.tracks.map(song=>song.id)});
   if(!playlist?.id)throw Error('The playlist was not confirmed.');
   if(generation===current.current){setState(s=>({...s,saved:true,message:'Saved to your playlists.'}));onSaved?.();}
  }catch(error){if(generation===current.current)setState(s=>({...s,message:`${error.message} Check your playlists before trying again.`}));}
  finally{if(saveJob.current===marker){saveJob.current=null;setState(s=>({...s,saving:false}));}}
 }
 return {...state,refresh,save,enabled};
}
