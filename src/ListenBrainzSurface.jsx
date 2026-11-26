import {ListenBrainzDashboard} from './ListenBrainzDashboard.jsx';
import {useListenBrainzData as useData} from './listenBrainzData.js';
import {Play,RadioTower,Settings} from 'lucide-react';
import {Artwork} from './surfaceUi.jsx';
import React,{useEffect,useState} from 'react';
import {apiJson,jsonRequest} from './services/apiClient.js';
import './listenBrainz.css';
export function ListenBrainzSurface({scope,onBack,onPlay,onAdd,disabledReason='',onOpenAlbum}){
 const [connection,setConnection]=useState(null),[username,setUsername]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[range,setRange]=useState('this_month'),[view,setView]=useState('listening'),[manage,setManage]=useState(false),[retry,setRetry]=useState(0);
 const path=(action,params={})=>'/api/navidrome/listenbrainz/'+action+'?'+new URLSearchParams({accountScope:scope,...params});
 useEffect(()=>{let alive=true;setConnection(null);setError('');apiJson(path('connection')).then(c=>{if(alive){setConnection(c);setUsername(c.username);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[scope,retry]);
 async function save(value){setBusy(true);setError('');try{const c=await apiJson(path('connection'),jsonRequest('POST',{username:value,revision:connection.revision},{headers:{'x-requested-with':'NaviMuse'}}));setConnection(c);setUsername(c.username);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="screen-surface lb-surface" aria-label="Your listening">
  <header className="lb-heading"><div><h1>Your listening</h1><p>Your music, recorded by NaviMuse</p></div><div className="lb-profile-controls">{connection?.username&&<span className="lb-profile-badge"><i aria-hidden="true"/>{connection.username}<span>Mixes connected</span></span>}<button type="button" className="lb-manage-button" aria-label="Manage ListenBrainz mixes connection" aria-expanded={view==='discover'&&(manage||!connection?.username)} onClick={()=>{setView('discover');setManage(value=>!value);}}><Settings size={19}/></button></div></header>
  {view==='discover'&&error&&<p role="alert">{error} <button onClick={()=>setRetry(x=>x+1)}>Retry connection</button></p>}
  {view==='discover'&&!connection&&!error&&<p role="status">Loading your connection…</p>}
  {connection&&view==='discover'&&<details className="lb-connection" hidden={Boolean(connection.username)&&!manage} open><summary>{connection.username?`Connected profile · ${connection.username}`:'Connect your ListenBrainz profile'}</summary>
   <form onSubmit={e=>{e.preventDefault();void save(username);}}><label>ListenBrainz username<input value={username} maxLength={100} required onChange={e=>setUsername(e.target.value)} autoComplete="off"/></label><p>This public profile is saved only for your NaviMuse account. Existing scrobbling continues unchanged.</p><div className="lb-actions"><button disabled={busy||!username.trim()}>{busy?'Saving…':'Save connection'}</button>{connection.username&&<button type="button" disabled={busy} onClick={()=>save('')}>Disconnect</button>}</div></form>
  </details>}
  {<div key={scope}>
   <div className="lb-toolbar"><div role="group" aria-label="Listening view"><button aria-pressed={view==='listening'} onClick={()=>setView('listening')}>Overview</button><button aria-pressed={view==='discover'} onClick={()=>setView('discover')}>Your mixes</button></div></div>
   {view==='listening'?<ListenBrainzDashboard path={(action,params={})=>'/api/navidrome/listening-history/'+action+'?'+new URLSearchParams({accountScope:scope,...params})} range={range} onRangeChange={setRange} onOpenAlbum={onOpenAlbum} onPlay={onPlay?(songs,label)=>onPlay(songs,label,'ad-hoc'):undefined} disabledReason={disabledReason}/>:connection?.username?<Discovery url={path('mixes')} playlistUrl={id=>path('playlist',{id})} onPlay={onPlay} onAdd={onAdd} disabledReason={disabledReason}/>:<p className="lb-muted">Connect ListenBrainz to get discovery mixes. Your NaviMuse charts work without it.</p>}
   {view==='discover'&&connection?.username&&<p className="lb-attribution">Discovery mixes powered by <a href={`https://listenbrainz.org/user/${encodeURIComponent(connection.username)}/`} target="_blank" rel="noreferrer">ListenBrainz</a>.</p>}

  </div>}
 </section>;
}
function LoadState({state}){return state.loading?<p role="status">Loading…</p>:state.error?<p role="alert">{state.error} <button onClick={state.retry}>Retry</button></p>:null;}
function Discovery({url,playlistUrl,onPlay,onAdd,disabledReason}){const state=useData(url);return <><p className="lb-discovery-intro">Selected by ListenBrainz from your listening history. Play the tracks available in your music library.</p><LoadState state={state}/><div className="lb-grid">{state.data?.items.map(mix=><Playlist key={mix.id} url={playlistUrl(mix.id)} title={mix.title||'Your mix'} onPlay={onPlay} onAdd={onAdd} disabledReason={disabledReason}/>)}</div>{state.data&&!state.data.items.length&&<p>No mixes have been generated for this profile yet.</p>}</>;}
function Playlist({url,title,onPlay,onAdd,disabledReason}){const state=useData(url),[message,setMessage]=useState(''),[adding,setAdding]=useState(false);const songs=(state.data?.items||[]).filter(i=>i.state==='matched').map(i=>i.song);return <section className="lb-card lb-playlist"><div className="lb-mix-art">{songs.slice(0,4).map(song=><Artwork key={song.id} item={song} className="lb-mix-cover"/>)}</div><p className="lb-eyebrow">LISTENBRAINZ DISCOVERY</p><h2>{title.replace(/ for .*/,'')}</h2><LoadState state={state}/>{state.data&&<><p>{songs.length} of {state.data.items.length} tracks available in your library.</p>{disabledReason&&<p>{disabledReason}</p>}<div className="lb-actions"><button disabled={!songs.length||Boolean(disabledReason)||adding} onClick={()=>onPlay(songs,title)}>Play available</button>{onAdd&&<button disabled={!songs.length||Boolean(disabledReason)||adding} onClick={async()=>{setAdding(true);try{const result=await onAdd(songs);setMessage(result?'Available tracks added to queue.':'Tracks could not be added. Check the current queue.');}catch{setMessage('Tracks could not be added. Try again.');}finally{setAdding(false);}}}>{adding?'Adding…':'Add available to queue'}</button>}</div>{message&&<p role="status">{message}</p>}<details className="lb-mix-tracks"><summary>View available tracks</summary><ol>{state.data.items.filter(t=>t.state==='matched').map((t,i)=><li key={i}><Artwork item={t.song} className="lb-artwork"/><div><strong>{t.title}</strong><small>{t.artist} · {t.album}</small></div><span>{t.state==='matched'?'In your library':t.state==='ambiguous'?'Multiple versions':t.state==='error'?'Check failed — retry':t.state==='duplicate'?'Already included':'Not in your library'}</span></li>)}</ol></details><button onClick={state.retry}>Check library again</button></>}</section>;}

function AlbumArtwork({item,onOpenAlbum}) {
 return item.albumId&&onOpenAlbum?<button type="button" className="lb-artwork lb-album-button" aria-label={`Open ${item.title}`} onClick={()=>onOpenAlbum({id:item.albumId,title:item.title,artist:item.artist,coverArt:item.coverArt})}><Artwork item={item}/></button>:<Artwork item={item} className="lb-artwork"/>;
}
export function ListenBrainzHome(props) {
 if(props.variant==='summary')return <HomeListeningPreview url={'/api/navidrome/listening-history/release-groups?'+new URLSearchParams({accountScope:props.scope,range:'this_month'})} onOpen={props.onOpen} onOpenAlbum={props.onOpenAlbum}/>;
 return <ConnectedHomeMix {...props}/>;
}
function ConnectedHomeMix({scope,onOpen,onPlay,onOpenAlbum,disabledReason}) {
 const path=action=>'/api/navidrome/listenbrainz/'+action+'?'+new URLSearchParams({accountScope:scope,range:'this_month'});
 const connection=useData(path('connection'));
 if(!connection.data?.username)return null;
 return <HomeMix key={scope+':'+connection.data.revision} url={path('mixes')} playlistUrl={id=>path('playlist')+'&id='+encodeURIComponent(id)} onPlay={onPlay} disabledReason={disabledReason}/>;
}
function HomeListeningPreview({url,onOpen,onOpenAlbum}) {
 const state=useData(url),items=(state.data?.items||[]).slice(0,3);
 return <section className="lb-home-preview" aria-label="Your listening preview"><div><p className="lb-eyebrow">YOUR LISTENING</p><h2>Your month in music</h2><p>Your top albums, with more in Listening.</p><button type="button" className="lb-home-link" onClick={onOpen}>See listening history →</button></div><div className="lb-preview-albums">{items.map((item,i)=><AlbumArtwork key={i} item={item} onOpenAlbum={onOpenAlbum}/>)}</div><LoadState state={state}/></section>;
}
function HomeMix({url,playlistUrl,onPlay,disabledReason}) {
 const mixes=useData(url),mix=mixes.data?.items?.[0];
 return mix?<HomeMixCard url={playlistUrl(mix.id)} title={mix.title||'Your mix'} onPlay={onPlay} disabledReason={disabledReason}/>:null;
}

function HomeMixCard({url,title,onPlay,disabledReason}) {
 const state=useData(url),songs=(state.data?.items||[]).filter(item=>item.state==='matched'&&item.song?.id).map(item=>item.song);
 return <section className="personalized-mix personalized-mix-home lb-home-mix" aria-label="Your ListenBrainz discovery mix">
  <div className="personalized-mix-art" aria-hidden="true">{songs.length?Array.from({length:4},(_,i)=><Artwork key={i} item={songs[i%songs.length]}/>):<RadioTower size={44}/>}</div>
  <div className="personalized-mix-copy"><p className="eyebrow">LISTENBRAINZ DISCOVERY</p><h2 title={title}>Your discovery mix</h2><p>Fresh finds from your listening history.</p>
   <LoadState state={state}/>{state.data&&<small>{songs.length} {songs.length===1?'track':'tracks'} ready to play</small>}
   {disabledReason&&<p className="personalized-mix-message" role="status">{disabledReason}</p>}
   {state.data&&!songs.length&&<p className="personalized-mix-message">No tracks from this mix are in your library yet.</p>}
   <div className="personalized-mix-actions"><button type="button" className="personalized-mix-play" disabled={!songs.length||Boolean(disabledReason)||state.loading} onClick={()=>onPlay(songs,title)}><Play size={17} fill="currentColor"/>Play Mix</button></div>
  </div>
 </section>;
}
