import {createSonicRadioController} from './sonicRadioController.js';
import {remoteQueue} from './wiimPlayback.js';

// Build candidates without touching either playback owner. Only the existing
// remote coordinator can accept the resulting queue and start the speaker.
export function createRemoteJourneyStarter({getOutput,discovery,onNotice=()=>{},timeoutMs=20000}) {
 let pending=null;
 function cancel(){pending?.cancel();pending=null;}
 async function start(kind,value,label,autoExtend=true){
  cancel();
  const output=getOutput(),session=output.state.session;
  if(!session||output.state.busy||!['playing','paused','buffering','ended'].includes(session.status)){
   onNotice('Reconnect the speaker before starting a Journey.');return false;
  }
  let queue,abort,timer,opener;
  const cancelled=new Promise(resolve=>{abort=()=>resolve(false);});
  const feeder=createSonicRadioController({...discovery,shouldAutoExtend:false,
   artistOpenerHistory:discovery.artistOpenerHistory ? {choose:(...args)=>discovery.artistOpenerHistory.choose(...args),remember:(...args)=>{opener=args;}} : undefined,
   replaceQueue:(items,index)=>{queue={items,index};},playTrack(){},getQueueSnapshot:()=>queue||{items:[],index:-1}});
  const job={cancel(){feeder.destroy();clearTimeout(timer);abort();}};pending=job;
  const methods={track:'startTrackJourney',artist:'startArtistJourney',genre:'startGenreJourney','artist-dj':'startArtistDj'};
  try{
   if(!methods[kind])throw Error('Choose a Journey type.');
   onNotice('Finding music for your speaker…');
   const finished=await Promise.race([Promise.resolve(feeder[methods[kind]](value,label)).then(()=>true),cancelled,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Finding music took too long. Try again when the connection improves.')),timeoutMs);})]);
   if(!finished||pending!==job)return false;
   if(!queue?.items?.length)throw Error(feeder.getNotice()||'No Journey tracks were found.');
   const current=getOutput();
   if(current!==output||current.state.busy||current.state.session?.id!==session.id||current.state.session?.generation!==session.generation)throw Error('Playback changed while finding music. Start the Journey again.');
   const normalized=remoteQueue(queue,{autoExtend});
   const ok=await current.command('replace',{queue:normalized});
   if(ok && opener)discovery.artistOpenerHistory.remember(...opener);
   if(pending===job)onNotice(ok?'':current.state.error||'The speaker could not start this Journey.');
   return ok;
  }catch(error){if(pending===job)onNotice(error.message);return false;}
  finally{job.cancel();if(pending===job)pending=null;}
 }
 return {start,cancel};
}
