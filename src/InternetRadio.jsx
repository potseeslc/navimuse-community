import {Artwork} from './surfaceUi.jsx';
import {apiRequestUrl} from './services/apiClient.js';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radio, Play, Plus, X } from 'lucide-react';
import { navidromeRadios, createInternetRadio } from './services/navidromeService.js';
import { radioStationSong } from './discoveryPlayback.js';

export function InternetRadio({ onPlaySong, remoteOutputName, radioMetadata }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: false, stations: [], error: '' });
  const [starting,setStarting]=useState(false);
  const [playError,setPlayError]=useState('');
  const trigger = useRef(null);
  const panel = useRef(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const appRoot=document.getElementById('root'),wasInert=appRoot?.inert;
    if(appRoot)appRoot.inert=true;
    panel.current?.querySelector('button')?.focus();
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); }
      if (event.key !== 'Tab') return;
      const items = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
      const first=items[0],last=items.at(-1);
      if (event.shiftKey && document.activeElement===first) { event.preventDefault();last?.focus(); }
      else if (!event.shiftKey && document.activeElement===last) { event.preventDefault();first?.focus(); }
    };
    document.addEventListener('keydown',keyboard,true);
    return () => {if(appRoot)appRoot.inert=wasInert;document.body.style.overflow=previous;document.removeEventListener('keydown',keyboard,true);trigger.current?.focus();};
  },[open]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', streamUrl: '', homePageUrl: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: '' }));
    navidromeRadios({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ loading: false, stations: data.radios || [], error: '' });
    }).catch(error => { if (!controller.signal.aborted) setState(s => ({ ...s, loading: false, error: error.message })); });
    return () => controller.abort();
  }, [attempt]);
  const startStation=async station=>{
    if(starting)return;
    const song=radioStationSong(station);if(!song)return;
    setStarting(true);setPlayError('');
    try{await onPlaySong(song,{title:'Internet Radio',artist:station.name},[song]);setOpen(false);}
    catch(error){setPlayError(error.message||'Could not start this station. Try again.');}
    finally{setStarting(false);}
  };
  const add = async event => {
    event.preventDefault(); if (saving) return;
    setSaving(true);
    try { await createInternetRadio(form); setForm({ name: '', streamUrl: '', homePageUrl: '' }); setAttempt(n => n + 1); setAdding(false); }
    catch (error) { setState(s => ({ ...s, error: error.message })); }
    finally { setSaving(false); }
  };
  const artworkFor = station => {
    const liveArtwork = radioMetadata?.id === `radio:${station.id}` ? radioMetadata.artwork : '';
    const artwork = liveArtwork || station.artworkPath;
    return {coverArt:station.coverArt,artwork: artwork ? apiRequestUrl(artwork) : station.imageUrl || station.logoUrl || station.coverArtUrl ? apiRequestUrl(`/api/navidrome/radios/${encodeURIComponent(station.id)}/artwork`) : ''};
  };
  return <section className="internet-radio" aria-label="Internet Radio">
    <h2>Internet Radio</h2>
    <p>Live stations saved in Navidrome.</p>
    {state.loading && !state.stations.length && <p role="status">Loading stations…</p>}
    {state.error && !open && <p role="alert">Could not load stations. <button type="button" onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>}
    {remoteOutputName && !open && <p>Stations play on {remoteOutputName}.</p>}
    {playError && !open && <p role="alert">{playError}</p>}
    {starting && !open && <p role="status">Starting station…</p>}
    <div className="radio-home-shelf">{state.stations.slice(0,8).map(station=><button className="radio-home-card" key={station.id} type="button" disabled={starting} aria-label={`Play ${station.name}${remoteOutputName?` on ${remoteOutputName}`:''}`} onClick={()=>void startStation(station)}>
      <Artwork item={artworkFor(station)} className="radio-home-art" fallbackIcon={<Radio size={52}/>}/>
      <span className="home-art-caption">{station.name}<small>Live radio</small></span><span className="home-art-play" aria-hidden="true"><Play size={18} fill="currentColor"/></span>
    </button>)}</div>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Browse stations</button>
    {open && createPortal(<div className="radio-sheet-layer">
      <div ref={panel} className="radio-sheet" role="dialog" aria-modal="true" aria-label="Internet Radio stations">
      <header className="radio-sheet-header"><div><span className="radio-eyebrow">LIVE BROADCASTS</span><h2>Internet Radio</h2></div><button type="button" aria-label="Close radio stations" onClick={()=>setOpen(false)}><X /></button></header>
      <div className="radio-sheet-scroll">
      <div className="radio-sheet-tools"><label>Find a station<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Station name" /></label><button type="button" onClick={()=>setAdding(v=>!v)} aria-expanded={adding}><Plus size={18}/> Add station</button></div>
      {state.loading && <p role="status">Loading stations…</p>}
      {state.error && <p role="alert">{state.error} <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button></p>}
      {!state.loading && !state.error && !state.stations.length && <p>No stations yet. Add a direct stream link below.</p>}
      {adding && <form onSubmit={add}>
        <h3>Add a station</h3>
        <label>Station name<input required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Stream or playlist URL<input required type="url" value={form.streamUrl} onChange={e => setForm({ ...form, streamUrl: e.target.value })} placeholder="https://…" /></label>
        <label>Website (optional)<input type="url" value={form.homePageUrl} onChange={e => setForm({ ...form, homePageUrl: e.target.value })} /></label>
        <p>Your Navidrome account must have permission to manage stations.</p>
        <button disabled={saving} type="submit">{saving ? 'Adding…' : 'Add station'}</button>
      </form>}
      {remoteOutputName&&<p>Changing stations keeps playback on {remoteOutputName}.</p>}
      {playError&&<p role="alert">{playError}</p>}
      {starting&&<p role="status">Starting station…</p>}
      <ul className="radio-stations">{state.stations.filter(station=>(station.name||'').toLowerCase().includes(query.toLowerCase())).map(station => <li key={station.id}><button type="button" disabled={starting} aria-label={`Play ${station.name}${remoteOutputName?` on ${remoteOutputName}`:''}`} onClick={()=>void startStation(station)}><Artwork item={artworkFor(station)} className="radio-list-art" fallbackIcon={<Radio aria-hidden="true"/>}/><span className="radio-station-copy">{station.name}<small>Live station</small></span><Play size={20} aria-hidden="true"/><span className="sr-only">Play {station.name}</span></button></li>)}</ul>
      {query && !state.loading && !state.stations.some(station=>(station.name||'').toLowerCase().includes(query.toLowerCase())) && <p>No matching stations.</p>}

      </div></div>
    </div>,document.body)}
  </section>;
}
