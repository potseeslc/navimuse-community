import React,{useState} from 'react';
import {Headphones,Play} from 'lucide-react';
import {Artwork} from './surfaceUi.jsx';
import {activityBuckets,listenIdentity,useListenBrainzData} from './listenBrainzData.js';
const number=value=>Number(value||0).toLocaleString();
const listens=value=>`${number(value)} ${value===1?'listen':'listens'}`;

function Status({state}) {
 if(state.loading)return <div className="lb-skeleton" role="status" aria-label="Loading listening data"><i/><i/><i/></div>;
 if(state.error)return <p className="lb-section-error" role="alert">{state.error} <button onClick={state.retry}>Retry</button></p>;
 if(state.data?.state==='pending')return <p className="lb-empty">Listening history is being prepared.</p>;
 if(!state.data?.items?.length)return <p className="lb-empty">No NaviMuse plays recorded yet. Your history grows as you listen; offline plays appear after syncing.</p>;
 return null;
}
function Freshness({state,recent=false}) {
 if(!state.data)return null;
 const at=state.checkedAt;
 return <p className="lb-freshness">{recent?'New plays sync automatically. ':''}{at>0?<>Updated <time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</time>.</>:null}</p>;
}
const ready=state=>Boolean(state.data&&state.data.state!=='pending'&&state.data.items?.length);

export function ListenBrainzDashboard({path,range,onRangeChange,onOpenAlbum,onPlay,disabledReason}) {
 const recent=useListenBrainzData(path('recent'));
 const activity=useListenBrainzData(path('listening-activity',{range}));
 const artists=useListenBrainzData(path('artists',{range}));
 const albums=useListenBrainzData(path('release-groups',{range}));
 const tracks=useListenBrainzData(path('recordings',{range}));
 const topArtist=ready(artists)?artists.data.items[0]:null,topAlbum=ready(albums)?albums.data.items[0]:null;
 const total=ready(activity)?activity.data.items.reduce((sum,item)=>sum+(Number(item.count)||0),0):null;
 const summaryText=state=>state.loading?'Loading…':state.error?'Unavailable':state.data?.state==='pending'?'Calculating…':'No listens yet';
 return <div className="lb-dashboard">
  <RankedList title="Recently listened" state={recent} kind="recent" onPlay={onPlay} disabledReason={disabledReason}/>
  <header className="lb-statistics-heading"><div><p className="lb-eyebrow">LISTENING HISTORY</p><h2>Your charts</h2>{activity.data?.historySince&&<p>Recorded history begins {new Date(activity.data.historySince*1000).toLocaleDateString()}.</p>}<p>Calculated from your NaviMuse plays. Calendar periods use UTC.</p><Freshness state={activity}/></div>{onRangeChange&&<label><span className="lb-sr-only">Chart period</span><select value={range} onChange={event=>onRangeChange(event.target.value)}>{[['this_week','This week'],['this_month','This month'],['this_year','This year'],['all_time','All time']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}</header>
  <div className="lb-summary" aria-label="Listening summary">
   <section className="lb-summary-item"><span className="lb-summary-icon"><Headphones size={28}/></span><div><strong className="lb-total">{total===null?'—':number(total)}</strong><span>{total===1?'listen':'listens'}</span><small>{total===null?summaryText(activity):'Plays in this period'}</small></div></section>
   <section className="lb-summary-item"><Artwork item={topArtist||{}} className="lb-summary-cover lb-portrait"/><div><small>Top artist</small><strong>{topArtist?.title||summaryText(artists)}</strong>{topArtist&&<span>{listens(topArtist.count)}</span>}</div></section>
   <section className="lb-summary-item lb-summary-album"><Artwork item={topAlbum||{}} className="lb-summary-cover"/><div><small>Top album</small>{topAlbum?.albumId&&onOpenAlbum?<button className="lb-text-link" onClick={()=>onOpenAlbum({id:topAlbum.albumId,title:topAlbum.title,artist:topAlbum.artist,coverArt:topAlbum.coverArt})}>{topAlbum.title}</button>:<strong>{topAlbum?.title||summaryText(albums)}</strong>}{topAlbum&&<span>{listens(topAlbum.count)}</span>}</div></section>
  </div>
  <Activity state={activity}/>
  <AlbumRanking state={albums} onOpenAlbum={onOpenAlbum}/>
  <div className="lb-ranking-grid"><RankedList title="Top artists" state={artists} kind="artists"/><RankedList title="Top tracks" state={tracks} kind="tracks" onPlay={onPlay} disabledReason={disabledReason}/></div>
 </div>;
}
function Activity({state}) {
 const items=state.data?.items||[],bars=activityBuckets(items),[selected,setSelected]=useState(null),[showData,setShowData]=useState(false);
 const peak=Math.max(1,...bars.map(item=>item.count));
 const step=Math.max(1,10**Math.floor(Math.log10(peak))/2),ceiling=Math.ceil(peak/step)*step;
 const selectedBar=bars[selected];
 const shortLabel=bar=>bar?.from?new Date(bar.from*1000).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'}):bar?.title||'';
 return <section className="lb-panel lb-activity" aria-labelledby="lb-activity-title"><header><h2 id="lb-activity-title">Listening activity</h2>{ready(state)&&<button className="lb-text-link" aria-expanded={showData} onClick={()=>setShowData(!showData)}>{showData?'Hide data':'View data'}</button>}</header><Status state={state}/>{ready(state)&&<>
  <div className="lb-chart-readout" aria-live="polite">{selectedBar?`${selectedBar.title} · ${listens(selectedBar.count)}`:'Select a bar to see your listens'}</div>
  <div className="lb-activity-plot"><div className="lb-chart-axis" aria-hidden="true">{[ceiling,Math.round(ceiling/2),0].map((value,i)=><span key={i}>{number(value)}</span>)}</div><div className="lb-chart-bars" role="group" aria-label="Listening activity by period">{bars.map((bar,i)=><button key={i} className={selected===i?'is-selected':''} aria-label={`${bar.title}: ${listens(bar.count)}`} aria-pressed={selected===i} onFocus={()=>setSelected(i)} onMouseEnter={()=>setSelected(i)} onClick={()=>setSelected(i)} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const next=event.key==='ArrowRight'?event.currentTarget.nextElementSibling:event.currentTarget.previousElementSibling;next?.focus();}}}><span style={{height:`${bar.count/ceiling*100}%`}}/></button>)}</div></div>
  <div className="lb-chart-dates" aria-hidden="true">{[0,Math.floor((bars.length-1)/2),bars.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=><span key={i}>{shortLabel(bars[i])}</span>)}</div>
  {showData&&<div className="lb-data-table"><table><caption>Listening counts by reported period · UTC{state.data.updatedAt>0?` · Updated ${new Date(state.data.updatedAt*1000).toLocaleDateString()}`:''}</caption><thead><tr><th scope="col">Period</th><th scope="col">Listens</th></tr></thead><tbody>{items.map((item,i)=><tr key={i}><th scope="row">{item.title||shortLabel(item)}</th><td>{number(item.count)}</td></tr>)}</tbody></table></div>}
 </>}</section>;
}
function AlbumRanking({state,onOpenAlbum}) {
 const [expanded,setExpanded]=useState(false),items=state.data?.items||[];
 return <section className="lb-panel" aria-labelledby="lb-albums-title"><header><h2 id="lb-albums-title">Your top albums</h2>{items.length>4&&<button className="lb-text-link" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'See all'}</button>}</header><Freshness state={state}/><Status state={state}/>{ready(state)&&<ol className={`lb-album-ranking${expanded?' is-expanded':''}`}>{items.slice(0,expanded?items.length:4).map((item,i)=><li key={i}><div className="lb-ranked-cover">{item.albumId&&onOpenAlbum?<button className="lb-cover-button" aria-label={`Open ${item.title}`} onClick={()=>onOpenAlbum({id:item.albumId,title:item.title,artist:item.artist,coverArt:item.coverArt})}><Artwork item={item}/></button>:<Artwork item={item}/>}<span className="lb-rank">{i+1}</span></div><strong>{item.title}</strong><span>{item.artist}</span><small>{listens(item.count)}{!item.albumId?' · Not linked to library':''}</small></li>)}</ol>}</section>;
}
function RankedList({title,state,kind,onPlay,disabledReason}) {
 const [expanded,setExpanded]=useState(false),items=state.data?.items||[],max=Math.max(1,...items.map(item=>item.count||0));
 const date=timestamp=>timestamp?new Date(timestamp*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Time unavailable';
 return <section className={`lb-panel lb-ranked-${kind}`} aria-label={title}><header><h2>{title}</h2>{items.length>5&&<button className="lb-text-link" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'See all'}</button>}</header>{kind==='recent'&&<p className="lb-muted">Your latest NaviMuse plays, including offline listening once synced.</p>}<Freshness state={state} recent={kind==='recent'}/><Status state={state}/>{ready(state)&&<ol className="lb-ranked-list">{items.slice(0,expanded?items.length:5).map((item,i)=><li key={kind==='recent'?listenIdentity(item):i} className={kind==='recent'&&state.added?.has(listenIdentity(item))?'lb-new-listen':undefined}>{kind!=='recent'&&<span className="lb-list-rank">{i+1}</span>}<Artwork item={item} className={`lb-list-cover ${kind==='artists'?'lb-portrait':''}`}/><div className="lb-list-copy"><strong>{item.title}</strong>{kind!=='artists'&&<small>{item.artist}</small>}{kind==='recent'&&<time dateTime={item.at?new Date(item.at*1000).toISOString():undefined}>{date(item.at)}</time>}</div>{kind==='artists'?<><span className="lb-ranking-bar" aria-hidden="true"><i style={{width:`${item.count/max*100}%`}}/></span><span className="lb-list-count" aria-label={listens(item.count)}>{number(item.count)}</span></>:<>{kind==='tracks'&&<span className="lb-list-count">{listens(item.count)}</span>}{item.song?.id&&onPlay?<button className="lb-row-play" aria-label={`Play ${item.title}`} disabled={Boolean(disabledReason)} title={disabledReason||`Play ${item.title}`} onClick={()=>onPlay([item.song],title)}><Play size={15} fill="currentColor"/></button>:<span className="lb-unlinked" title="No unique match in your library">Not linked</span>}</>}</li>)}</ol>}{disabledReason&&kind!=='artists'&&<p className="lb-muted">{disabledReason}</p>}</section>;
}
