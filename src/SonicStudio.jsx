import React, {useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowUp, Play, Plus, Search, Sparkles, X} from 'lucide-react';
import {audiomuseLyricsSearch, audiomuseMixPreview} from './services/audiomuseService.js';
import {navidromeSearch} from './services/navidromeService.js';
import {apiFetch} from './services/apiClient.js';
import {createPlaylist} from './playlists.js';
import {TrackQueueActions} from './TrackQueueActions.jsx';

const modes = [['sound','Sound'],['meaning','Meaning'],['blend','Alchemy']];
export function SonicStudio({libraryKey, onPlaySong, onAddToQueue, onPlayNext, queueActionDisabledReason}) {
  const [mode,setMode] = useState('sound');
  const [query,setQuery] = useState('');
  const [seedQuery,setSeedQuery] = useState('');
  const [seeds,setSeeds] = useState([]);
  const [matches,setMatches] = useState([]);
  const [searching,setSearching] = useState(false);
  const [searchError,setSearchError] = useState('');
  const [tracks,setTracks] = useState(null);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [name,setName] = useState('');
  const [saving,setSaving] = useState(false);
  const [saved,setSaved] = useState(false);
  const generation = useRef(null), search = useRef(null), saveLock = useRef(false), alive = useRef(true);
  const previewHeading = useRef(null);
  useEffect(() => {alive.current=true; return () => {alive.current=false;generation.current?.abort();search.current?.abort();};}, []);
  const cancel = () => {generation.current?.abort();generation.current=null;setBusy(false);};
  const changeMode = next => {cancel();setMode(next);setError('');};
  const findSeeds = async event => {
    event.preventDefault();
    search.current?.abort();
    const controller = new AbortController(); search.current=controller;
    setSearching(true); setSearchError(''); setMatches([]);
    try {
      const result = await navidromeSearch(seedQuery.trim(), libraryKey, {signal:controller.signal});
      if (controller.signal.aborted) return;
      const candidates = [...(result.artists || []).slice(0,5).map(item => ({id:item.id,type:'artist',label:item.name})),
        ...(result.songs || []).slice(0,10).map(item => ({id:item.id,type:'song',label:item.title,artist:item.artist}))];
      setMatches(candidates);
      if (!candidates.length) setSearchError('No songs or artists found. Try another name.');
    } catch (failure) {if (!controller.signal.aborted) setSearchError(failure.message);}
    finally {if (!controller.signal.aborted) setSearching(false);}
  };
  const generate = async event => {
    event.preventDefault();
    if (generation.current || saveLock.current) return;
    const controller = new AbortController(); generation.current=controller;
    // Bound even a stalled response body; cancellation also discards late responses.
    const timer = setTimeout(() => {if(generation.current===controller){cancel();setError('Creating this mix took too long. Try again.');}},45000);
    setBusy(true); setError('');
    try {
      const result = mode === 'meaning'
        ? await audiomuseLyricsSearch(query.trim(), {limit:24,signal:controller.signal})
        : await audiomuseMixPreview(mode === 'blend'
          ? {mode,items:seeds.map(({id,type,op}) => ({id,type,op})),limit:24}
          : {mode,query:query.trim(),limit:24}, {signal:controller.signal});
      if (controller.signal.aborted) return;
      const unique = [...new Map((result.tracks || []).filter(song => song.id && !song.streamUrl).map(song => [song.id,song])).values()];
      setTracks(unique); setSaved(false);
      setName((mode === 'blend' ? `Alchemy · ${seeds.filter(seed=>seed.op==='ADD').map(seed=>seed.label).join(' + ')}` : query.trim()).slice(0,200));
      setNotice(result.resolutionIncomplete ? 'Some songs could not be checked. You can retry or use the available tracks.' : result.partial && unique.length ? 'These are the available matches in your analyzed library.' : '');
      requestAnimationFrame(() => {if(alive.current) previewHeading.current?.focus();});
    } catch (failure) {if (!controller.signal.aborted) setError(failure.message);}
    finally {clearTimeout(timer);if(generation.current===controller){generation.current=null;setBusy(false);}}
  };
  const edit = next => {setTracks(next);setSaved(false);};
  const move = (index,offset) => {const next=[...tracks];next.splice(index+offset,0,next.splice(index,1)[0]);edit(next);};
  const save = async event => {
    event.preventDefault();
    if(saveLock.current || busy || saved || !tracks?.length || !name.trim()) return;
    saveLock.current=true;setSaving(true);setError('');
    try {
      const playlist = await createPlaylist(apiFetch,{name:name.trim(),songIds:tracks.map(song=>song.id)});
      if (!playlist?.id) throw new Error('The server did not confirm the saved playlist.');
      if(alive.current){setSaved(true);setNotice('Saved to your Navidrome playlists.');}
    } catch(failure) {if(alive.current)setError(`${failure.message} Check your playlists before trying to save again.`);}
    finally {saveLock.current=false;if(alive.current)setSaving(false);}
  };
  return <section className="sonic-studio" aria-label="Create a mix">
    <header><p className="eyebrow"><Sparkles size={16} aria-hidden="true"/> FROM YOUR LIBRARY</p><h2>Create a mix</h2><p>Your library. A different direction.</p></header>
    <div className="sonic-mode-switch" role="group" aria-label="Discovery mode">{modes.map(([key,label])=><button key={key} type="button" aria-pressed={mode===key} disabled={saving} onClick={()=>changeMode(key)}>{label}</button>)}</div>
    {mode === 'blend' ? <div className="sonic-alchemy">
      <p>Combine songs and artists. Use “Less like” to steer away from a sound.</p>
      <ul className="sonic-seeds">{seeds.map((seed,index)=><li key={`${seed.type}:${seed.id}`}><span><strong>{seed.label}</strong><small>{seed.artist || 'Artist'}</small></span><select aria-label={`Influence of ${seed.label}`} value={seed.op} disabled={busy || saving} onChange={event=>setSeeds(seeds.map((item,i)=>i===index?{...item,op:event.target.value}:item))}><option value="ADD">More like</option><option value="SUBTRACT">Less like</option></select><button type="button" aria-label={`Remove seed ${seed.label}`} disabled={busy || saving} onClick={()=>setSeeds(seeds.filter((_,i)=>i!==index))}><X size={17}/></button></li>)}</ul>
      <form onSubmit={findSeeds} className="sonic-query"><label htmlFor="sonic-seed">Add a song or artist</label><div><input id="sonic-seed" value={seedQuery} type="search" maxLength={200} onChange={event=>{search.current?.abort();setSearching(false);setMatches([]);setSeedQuery(event.target.value);}} placeholder="Search your library"/><button type="submit" disabled={searching || seedQuery.trim().length<2}><Search size={18}/><span>Search</span></button></div></form>
      {searching && <p role="status">Searching your library…</p>}{searchError && <p role="status">{searchError}</p>}
      {!!matches.length && <ul className="sonic-seed-results" aria-label="Songs and artists">{matches.map(item=><li key={`${item.type}:${item.id}`}><span><strong>{item.label}</strong><small>{item.artist || 'Artist'}</small></span><button type="button" aria-label={`Add ${item.label}`} disabled={busy || saving || seeds.length>=8 || seeds.some(seed=>seed.id===item.id && seed.type===item.type)} onClick={()=>setSeeds([...seeds,{...item,op:'ADD'}])}><Plus size={18}/></button></li>)}</ul>}
      <form onSubmit={generate}><button className="sonic-create" disabled={busy || saving || !seeds.some(seed=>seed.op==='ADD')}><Sparkles size={18}/> Create mix</button></form>
    </div> : <form className="sonic-query" onSubmit={generate}>
      <label htmlFor="sonic-description">{mode==='sound'?'Describe the sound':'What are the songs about?'}</label>
      <p>{mode==='sound'?'Try instruments, energy, texture, or a mood.':'Search lyrics by theme, scene, or feeling.'}</p>
      <textarea id="sonic-description" rows={2} minLength={3} maxLength={240} value={query} disabled={saving} onChange={event=>setQuery(event.target.value)} placeholder={mode==='sound'?'Warm jazz, brushed drums, a late-night piano':'Finding your way home after a long time away'}/>
      <button className="sonic-create" type="submit" disabled={busy || saving || query.trim().length<3}><Sparkles size={18}/> {mode==='sound'?'Find my sound':'Find songs'}</button>
    </form>}
    <p className="sonic-scope-note">Matches come from your AudioMuse-analyzed library. Preview first, then choose what to play or save.</p>
    {busy && <div className="sonic-progress" role="status">Finding your mix… <button type="button" onClick={cancel}>Cancel</button></div>}
    {error && <p role="alert" className="inline-warning">{error}</p>}
    {tracks && <section className="sonic-mix-preview" aria-label="Mix preview" aria-busy={busy}>
      <header><div><p className="eyebrow">YOUR MIX</p><h3 ref={previewHeading} tabIndex={-1}>{tracks.length} {tracks.length===1?'track':'tracks'} to explore</h3></div><button type="button" disabled={!tracks.length || busy || !onPlaySong} onClick={()=>onPlaySong(tracks[0],{title:name || 'Sonic mix',artist:'Sonic'},tracks)}><Play size={18}/> Play mix</button></header>
      {notice && <p role="status">{notice}</p>}
      {!tracks.length ? <p>No playable matches yet. Try a broader description or different seeds.</p> : <>
        <ol className="sonic-mix-tracks">{tracks.map((song,index)=><li key={song.id}><span className="sonic-track-number">{index+1}</span><button className="sonic-track-title" type="button" disabled={busy || !onPlaySong} onClick={()=>onPlaySong(song,{title:name || 'Sonic mix',artist:'Sonic'},tracks)}><strong>{song.title}</strong><small>{song.artist}</small></button><div className="sonic-track-tools"><TrackQueueActions song={song} onAddToQueue={onAddToQueue} onPlayNext={onPlayNext} disabledReason={queueActionDisabledReason}/><button type="button" aria-label={`Move ${song.title} up`} disabled={index===0 || saving || busy} onClick={()=>move(index,-1)}><ArrowUp size={16}/></button><button type="button" aria-label={`Move ${song.title} down`} disabled={index===tracks.length-1 || saving || busy} onClick={()=>move(index,1)}><ArrowDown size={16}/></button><button type="button" aria-label={`Remove ${song.title} from mix`} disabled={saving || busy} onClick={()=>edit(tracks.filter((_,i)=>i!==index))}><X size={16}/></button></div></li>)}</ol>
        <form className="sonic-save" onSubmit={save}><label htmlFor="sonic-mix-name">Save as a playlist</label><div><input id="sonic-mix-name" maxLength={200} value={name} disabled={saving || saved || busy} onChange={event=>setName(event.target.value)}/><button disabled={saving || saved || busy || !name.trim()}>{saving?'Saving…':saved?'Saved':'Save playlist'}</button></div></form>
      </>}
    </section>}
  </section>;
}
