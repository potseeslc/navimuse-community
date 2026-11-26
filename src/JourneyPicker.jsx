import React,{useEffect,useId,useRef} from 'react';
import {ArrowRight,Compass,Disc3,Music2,Users,X} from 'lucide-react';

export function journeySeedOptions(song) {
 const artistId=String(song?.artistId||song?.albumArtistId||'').trim();
 const genres=[...new Set([...(Array.isArray(song?.genres)?song.genres.map(g=>typeof g==='string'?g:g?.name):[]),song?.genre].filter(g=>typeof g==='string'&&g.trim()).map(g=>g.trim()))].slice(0,12);
 return {artist:artistId?{id:artistId,name:song?.artist||song?.albumArtist||'This artist'}:null,genres};
}

export function JourneyPicker({seed,onClose,onChoose,autoExtend=true}) {
 const dialog=useRef(null),close=useRef(null),titleId=useId();
 const {artist,genres}=journeySeedOptions(seed);
 useEffect(()=>{
  if(!seed){dialog.current?.close();return;}
  const opener=document.activeElement?.tagName==='BUTTON'?document.activeElement:document.querySelector('[aria-label="Choose a Journey"]');
  dialog.current?.showModal();close.current?.focus();
  return()=>{dialog.current?.close();if(opener?.isConnected)opener.focus();};
 },[seed]);
 const choose=(kind,value)=>{onClose();onChoose(kind,value,seed);};
 return <dialog ref={dialog} className="journey-picker" aria-labelledby={titleId} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <header><div><p>Explore from here</p><h2 id={titleId}>Choose a Journey</h2></div><button ref={close} type="button" aria-label="Close Journey choices" onClick={onClose}><X size={22}/></button></header>
  <p className="journey-picker-seed">{seed?.title}<span>{seed?.artist}</span></p>
  <div className="journey-choices">
   <button type="button" onClick={()=>choose('track')} disabled={!seed?.id}><Music2 size={23}/><span><strong>Track Journey</strong><small>Discover music that sounds like this track.</small></span><ArrowRight size={18}/></button>
   <button type="button" onClick={()=>choose('artist',artist)} disabled={!artist}><Users size={23}/><span><strong>Artist Journey</strong><small>{artist?`${artist.name} and similar artists.`:'Artist details are unavailable for this track.'}</small></span><ArrowRight size={18}/></button>
   {genres.length?genres.map(genre=><button key={genre} type="button" onClick={()=>choose('genre',genre)}><Compass size={23}/><span><strong>{genre} Journey</strong><small>Start in this genre and follow similar sounds.</small></span><ArrowRight size={18}/></button>):<button type="button" disabled><Compass size={23}/><span><strong>Genre Journey</strong><small>No genre is available for this track.</small></span></button>}
   <button type="button" onClick={()=>choose('artist-dj',artist)} disabled={!artist}><Disc3 size={23}/><span><strong>Artist DJ</strong><small>{artist?`Only ${artist.name}. Ends when the list finishes.`:'Artist details are unavailable for this track.'}</small></span><ArrowRight size={18}/></button>
  </div>
  <p className="journey-picker-note">Starts a new queue. {autoExtend?'Journeys add more tracks as you listen.':'Automatic continuation is off in Settings.'}</p>
 </dialog>;
}
