import {useEffect,useState} from 'react';
import {nativeAudioTransport} from './nativeAudio.js';
export function useNearbySpeakers(open,outputs=[]){
 const native=nativeAudioTransport();const automatic=Boolean(native?.nearbySpeakers);
 const [network,setNetwork]=useState(()=>native?.networkType||'unknown');
 const [epoch,setEpoch]=useState(0);
 const [result,setResult]=useState({key:'',ids:[],checking:false,error:false});
 useEffect(()=>{
  const update=({detail})=>{if(detail?.type==='network'){setNetwork(detail.networkType);setEpoch(n=>n+1);}};
  const foreground=()=>setEpoch(n=>n+1);
  window.addEventListener('focus',foreground);
  window.addEventListener('navimuse-native-audio',update);
  return()=>{window.removeEventListener('focus',foreground);window.removeEventListener('navimuse-native-audio',update);};
 },[]);
 const devices=outputs.filter(o=>o.address&&o.uuid).slice(0,32).map(({id,address,uuid})=>({id,address,uuid}));
 const key=JSON.stringify({devices,epoch});const localNetwork=['wifi','wired'].includes(network);
 useEffect(()=>{
  if(!open||!automatic||!localNetwork){setResult({key:'',ids:[],checking:false,error:false});return;}
  let current=true;setResult({key,ids:[],checking:true,error:false});
  native.request({action:'nearbySpeakers',devices:JSON.parse(key).devices}).then(value=>{if(current)setResult({key,ids:Array.isArray(value?.nearbyIds)?value.nearbyIds:[],checking:false,error:false});}).catch(()=>{if(current)setResult({key,ids:[],checking:false,error:true});});
  return()=>{current=false;};
 },[open,automatic,network,key]);
 return {recheck:()=>setEpoch(n=>n+1),automatic,network,epoch,localNetwork,ids:open&&localNetwork&&result.key===key?result.ids:[],checking:result.checking,error:result.error};
}
