import React from 'react';
import {Play,RefreshCcw,Save,Sparkles} from 'lucide-react';
import {Artwork} from './surfaceUi.jsx';
import {LoadingDots} from './LoadingDots.jsx';

export function PersonalizedMix({model,onPlaySong,compact=false}) {
 if(!model?.enabled)return null;
 const tracks=model.mix?.tracks||[];
 return <section className={`personalized-mix${compact?' personalized-mix-home':''}`} aria-label="Your Personalized Mix">
  <div className="personalized-mix-art" aria-hidden="true">{tracks.length?Array.from({length:4},(_,i)=><Artwork key={i} item={tracks[i%tracks.length]} />):<Sparkles size={44}/>}</div>
  <div className="personalized-mix-copy"><p className="eyebrow">{compact?'NAVIMUSE':'MADE FOR YOU'}</p><h2>Your Personalized Mix</h2><p>Shaped by what you’ve been listening to.</p>
   {!!tracks.length&&<small>{tracks.length} tracks · Refreshed {new Date(model.mix.generatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small>}
   <div className="personalized-mix-actions">
    {tracks.length?<button type="button" className="personalized-mix-play" onClick={()=>onPlaySong?.(tracks[0],{title:'Your Personalized Mix',artist:'Your library'},tracks)}><Play size={17} fill="currentColor"/>Play Mix</button>:<button type="button" className="personalized-mix-play" onClick={model.refresh} disabled={model.busy||model.loading}><Sparkles size={17}/>Generate Mix</button>}
    {(!compact||tracks.length>0)&&<button type="button" aria-label="Refresh personalized mix" onClick={model.refresh} disabled={model.busy||model.saving||model.loading}><RefreshCcw size={17}/>{!compact&&'Refresh'}</button>}
    {!compact&&<button type="button" onClick={model.save} disabled={!tracks.length||model.saving||model.saved||model.busy}><Save size={17}/>{model.saved?'Saved':model.saving?'Saving…':'Save Playlist'}</button>}
   </div>
   {(model.loading||model.busy)&&<LoadingDots label={model.busy?'Refreshing your personalized mix':'Loading your personalized mix'}/>}
   {model.message&&<p className="personalized-mix-message" role="status">{model.message}</p>}
  </div>
 </section>;
}
