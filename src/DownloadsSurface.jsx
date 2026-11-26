import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,Download,Play,RefreshCw,Trash2,X,ListMusic,Check} from 'lucide-react';
import {downloadGroups} from './downloadGroups.js';
import {downloadProfile} from './offlineDownloads.js';
import {DownloadArtwork} from './DownloadArtwork.jsx';
import './downloadsWorkspace.css';
export function downloadBytes(bytes){const n=Math.max(0,Number(bytes)||0);return n>=1024**3?`${(n/1024**3).toFixed(1)} GB`:n>=1024**2?`${(n/1024**2).toFixed(1)} MB`:`${Math.ceil(n/1024)} KB`;}
export function DownloadCover({tracks=[],mosaic=false,scope,offline}) {
 const covers=[...new Map(tracks.map(t=>[t.song.coverArt||t.song.albumId||t.song.id,t.song])).values()].slice(0,4);
 const tiles=mosaic&&covers.length>1?Array.from({length:4},(_,i)=>covers[i%covers.length]):covers.slice(0,1);
 return <span className={`download-cover ${tiles.length>1?'is-mosaic':''}`} aria-hidden="true">{tiles.length?tiles.map((song,i)=><DownloadArtwork key={i} song={song} scope={scope} offline={offline}/>):<ListMusic size={48}/>}</span>;
}
export function DownloadsSurface({embedded=false,state,controller,onBack,onPlay,onSurfaceScroll,offline=false,onReconnect,playbackBlockedReason=''}) {
 const title=useRef(null),opener=useRef(null),detailTitle=useRef(null);
 const [query,setQuery]=useState(''),[limit,setLimit]=useState(100),[groupBy,setGroupBy]=useState('all'),[selection,setSelection]=useState(null);
 useEffect(()=>{if(!embedded)title.current?.focus();},[embedded]);
 useEffect(()=>{if(selection)detailTitle.current?.focus();},[selection]);
 const tracks=state.tracks||[],complete=tracks.filter(t=>t.state==='complete'),pending=tracks.filter(t=>['queued','downloading'].includes(t.state));
 const albums=downloadGroups(tracks),collections=downloadGroups(tracks,'playlists');
 const matches=text=>String(text).toLowerCase().includes(query.trim().toLowerCase());
 const selected=selection&&(selection.kind==='album'?albums:collections).find(g=>g.id===selection.id);
 const close=()=>{setSelection(null);window.requestAnimationFrame(()=>opener.current?.isConnected?opener.current.focus():title.current?.focus());};
 const play=items=>{const ready=items.filter(t=>t.state==='complete').map(t=>t.song);if(ready.length&&!playbackBlockedReason)onPlay(ready[0],ready);};
 const Heading=embedded?'h2':'h1';
 function cards(groups,kind){return <div className="download-art-grid">{groups.filter(g=>matches(`${g.name} ${g.tracks.map(t=>`${t.song.artist} ${t.song.title}`).join(' ')}`)).map(g=>{
  const ready=g.tracks.filter(t=>t.state==='complete').length;
  return <article className="download-art-card" key={g.id}><button className="download-card-open" onClick={e=>{opener.current=e.currentTarget;setSelection({id:g.id,kind});}} aria-label={`Open ${g.name}`}><DownloadCover scope={state.scope} offline={offline} tracks={g.tracks} mosaic={kind!=='album'}/><strong>{g.name}</strong><span>{kind==='album'?g.tracks[0]?.song.artist:g.id.startsWith('queue:')?'Saved queue':'Playlist'}</span></button><div className="download-card-footer"><small>{ready===g.tracks.length?<><Check size={13}/> {ready} songs offline</>:<>{ready} of {g.tracks.length} ready</>}</small><button className="download-card-play" aria-label={`Play ${g.name}`} disabled={!ready||!!playbackBlockedReason} onClick={()=>play(g.tracks)}><Play size={16} fill="currentColor"/></button></div></article>;
 })}</div>;}
 function rows(items){const ready=items.filter(t=>t.state==='complete').map(t=>t.song);return <ul className="downloads-list">{items.slice(0,limit).map(item=>{
 const song=item.song,done=item.state==='complete',running=['queued','downloading'].includes(item.state),progress=state.progress?.songID===song.id?state.progress:null;
 return <li key={song.id}><button className="download-track" disabled={!done||!!playbackBlockedReason} onClick={()=>onPlay(song,ready)}><DownloadCover scope={state.scope} offline={offline} tracks={[item]}/><span><strong>{song.title||song.id}</strong><small>{song.artist||'Unknown artist'}</small><small>{done?'Ready offline':progress?`Downloading · ${downloadBytes(progress.receivedBytes)}`:item.message||(running?'Waiting to download':'Download interrupted')}</small></span></button><div className="download-row-actions">{running?<button aria-label={`Cancel download of ${song.title||song.id}`} disabled={state.busy} onClick={()=>controller.cancel(song.id)}><X size={18}/></button>:!done&&!offline&&<button aria-label={`Retry download of ${song.title||song.id}`} disabled={state.busy} onClick={()=>controller.download([song],downloadProfile())}><RefreshCw size={18}/></button>}<button aria-label={`Remove download of ${song.title||song.id}`} disabled={state.busy} onClick={()=>controller.remove(song.id)}><Trash2 size={18}/></button></div>{progress&&<progress max={progress.expectedBytes>0?progress.expectedBytes:undefined} value={progress.expectedBytes>0?progress.receivedBytes:undefined} aria-label={`Downloading ${song.title||song.id}`}/>}</li>;
 })}{items.length>limit&&<li><button onClick={()=>setLimit(n=>n+100)}>Show more songs</button></li>}</ul>;}
 return <section className={embedded?'downloads-surface downloads-embedded':'screen-surface downloads-surface'} aria-labelledby="downloads-title" onScroll={onSurfaceScroll}>
 {onBack&&<button className="downloads-back" onClick={onBack}><ArrowLeft size={18}/>Library</button>}
 <header className="downloads-heading"><div><p className="eyebrow">YOUR MUSIC, WITH YOU</p><Heading id="downloads-title" ref={title} tabIndex={-1}>Downloads</Heading><p>{complete.length} songs offline · {downloadBytes(state.usedBytes)}{pending.length?` · ${pending.length} downloading`:''}</p></div>{complete.length>0&&<button className="download-play-all" disabled={!!playbackBlockedReason} onClick={()=>play(tracks)}><Play size={18} fill="currentColor"/>Play downloads</button>}</header>
 {offline&&<div className="downloads-notice"><p>You’re listening offline.</p><button onClick={onReconnect}>Connect to NaviMuse</button></div>}
 {state.loading&&<p role="status">Reading downloaded music…</p>}{state.busy&&<p role="status">Updating downloads…</p>}
 {state.error&&<p className="downloads-error" role="alert">{state.error}</p>}{playbackBlockedReason&&<p className="downloads-notice" role="status">{playbackBlockedReason}</p>}
 {!state.loading&&!state.available&&<div className="downloads-notice"><p>{offline?'Offline access has expired. Reconnect to use your downloaded music.':'Download music to enable offline listening.'}</p>{!offline&&<button disabled={state.busy} onClick={()=>controller.authorize()}>Check offline access</button>}</div>}
 {state.waitingForNetwork&&<p role="status">Downloads are waiting for {state.allowsCellular?'a connection':'Wi-Fi'}.</p>}
 {selection?<><button className="downloads-back" onClick={close}><ArrowLeft size={18}/>All downloads</button>{selected?<><header className="download-collection-hero"><DownloadCover scope={state.scope} offline={offline} tracks={selected.tracks} mosaic={selection.kind!=='album'}/><div><p className="eyebrow">{selection.kind==='album'?'ALBUM':selected.id.startsWith('queue:')?'SAVED QUEUE':'PLAYLIST'}</p><h2 ref={detailTitle} tabIndex={-1}>{selected.name}</h2><p>{selected.tracks.filter(t=>t.state==='complete').length} of {selected.tracks.length} songs ready offline</p><button className="download-play-all" disabled={!selected.tracks.some(t=>t.state==='complete')||!!playbackBlockedReason} onClick={()=>play(selected.tracks)}><Play size={18} fill="currentColor"/>Play {selection.kind==='album'?'album':'playlist'}</button></div></header>{rows(selected.tracks)}</>:<p>This collection has no downloaded songs left.</p>}</>:<>
 {!!tracks.length&&<><div className="download-browse-tools"><div className="download-group-tabs" role="group" aria-label="Organize downloads">{['all','albums','playlists','songs'].map(kind=><button key={kind} aria-pressed={groupBy===kind} onClick={()=>{setGroupBy(kind);setLimit(100);}}>{kind==='playlists'?'Playlists & queues':kind[0].toUpperCase()+kind.slice(1)}</button>)}</div><label className="downloads-search"><span>Search downloads</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(100);}} placeholder="Albums, playlists, artists…"/></label></div>
 {['all','playlists'].includes(groupBy)&&<section className="download-shelf"><h3>Playlists & queues</h3>{collections.length?cards(collections,'playlist'):<p className="download-muted">Download a playlist or your queue to keep a collection here.</p>}</section>}
 {['all','albums'].includes(groupBy)&&<section className="download-shelf"><h3>Albums</h3>{cards(albums,'album')}</section>}
 {groupBy==='songs'&&rows(tracks.filter(t=>matches(`${t.song.title} ${t.song.artist} ${t.song.album}`)))}
 {query&&!tracks.some(t=>matches(`${t.song.title} ${t.song.artist} ${t.song.album} ${(t.song.downloadCollections||[]).map(c=>c.name).join(' ')}`))&&<p>No downloads match your search.</p>}
 </>}
 {!tracks.length&&!state.loading&&<div className="downloads-empty"><DownloadCover/><h2>A collection for everywhere.</h2><p>Download an album, playlist, or queue. Your covers and music will have a place here.</p></div>}
 </>}
 </section>;
}
