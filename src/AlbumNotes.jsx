import React,{useEffect,useState} from 'react';
import {apiJson} from './services/apiClient.js';
import {ArtistBiography} from './ArtistBiography.jsx';
export function AlbumNotes({id,name}) {
 const [notes,setNotes]=useState(null);
 useEffect(()=>{const abort=new AbortController();setNotes(null);apiJson(`/api/navidrome/albums/${encodeURIComponent(id)}/notes`,{signal:abort.signal}).then(data=>{if(!abort.signal.aborted)setNotes(data.notes);}).catch(()=>{});return()=>abort.abort();},[id]);
 return notes?.text?<ArtistBiography name={name} biography={notes} sourceLabel="Album information via your music server"/>:null;
}
