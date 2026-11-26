import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=v=>typeof v==='string'?v.slice(0,500):'';
const number=v=>Number.isFinite(v)&&v>=0?v:0;
const mbid=v=>String(v||'').match(/(?:^|\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1]?.toLowerCase();
const norm=v=>text(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function matchRecording(track,songs){
 const exact=songs.filter(s=>track.mbid&&mbid(s.musicBrainzId)===track.mbid);
 const candidates=exact.length?exact:songs.filter(s=>norm(s.title)===norm(track.title)&&norm(s.artist)===norm(track.artist)&&norm(s.album)===norm(track.album)&&track.duration>0&&s.duration>0&&Math.abs(s.duration-track.duration)<3);
 return candidates.length===1?{state:'matched',song:candidates[0]}:{state:candidates.length?'ambiguous':'unavailable'};
}
// Statistics lack album/duration identifiers. Only expose an unambiguous,
// exact title + artist match from a non-truncated search for playback.
export function matchListeningLibraryItem(item,field,candidates,limit=20) {
 const matches=candidates.filter(candidate=>norm(candidate.name||candidate.title)===norm(item.title)&&(field==='artist'||!item.artist||norm(candidate.artist)===norm(item.artist)));
 if(matches.length!==1)return null;
 const match=matches[0];
 return {coverArt:match.coverArt,albumId:field==='album'?match.id:undefined,
  song:field==='song'&&item.artist&&candidates.length<limit?match:undefined};
}

export function createListenBrainzIntegration({directory,client,now=Date.now}){
 const cache=new Map(),pending=new Map(),writes=new Map();
 const file=scope=>join(directory,createHash('sha256').update(scope).digest('hex')+'.json');
 async function connection(scope){try{return JSON.parse(await readFile(file(scope),'utf8'));}catch(e){if(e.code==='ENOENT')return {username:'',revision:0};throw e;}}
 async function save(scope,input){
  if(writes.has(scope))throw fail('Connection is being updated. Try again.',409);
  const job=(async()=>{
   if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Invalid connection request.');
   const previous=await connection(scope);
   if(input.revision!==previous.revision)throw fail('Connection changed. Reload and try again.',409);
   const username=typeof input.username==='string'?input.username.trim():null;
   if(username===null||['.','..'].includes(username)||username.length>100||/[\x00-\x1f\x7f]/.test(username))throw fail('Enter a valid ListenBrainz username.');
   if(username)await client.listens(username);
   const value={username,revision:previous.revision+1};await mkdir(directory,{recursive:true,mode:0o700});
   const path=file(scope),tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,path);
   for(const key of cache.keys())if(key.startsWith(scope+'|'))cache.delete(key);
   return value;
  })();writes.set(scope,job);try{return await job;}finally{writes.delete(scope);}
 }
 async function cached(scope,c,key,load){
  const id=[scope,c.revision,key].join('|');const hit=cache.get(id);if(hit&&now()-hit.at<(key==='recent'?30000:key==='mixes'||key.startsWith('playlist:')?3600000:900000))return hit.value;
  if(pending.has(id))return pending.get(id);
  if(pending.size>=12)throw fail('Listening data is busy. Try again shortly.',503);
  const job=(async()=>{const value=await load();if((await connection(scope)).revision!==c.revision)throw fail('Connection changed. Reload to continue.',409);
   if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(id,{at:now(),value});return value;})();
  pending.set(id,job);try{return await job;}finally{pending.delete(id);}
 }
 async function connected(scope){const c=await connection(scope);if(!c.username)throw fail('Connect your ListenBrainz profile first.',409);return c;}
 async function recommendations(scope,c){return cached(scope,c,'mixes',async()=>{
  const response=await client.recommendations(c.username);const seen=new Set();
  return (response.data?.playlists||[]).map(item=>item.playlist).filter(Boolean).sort((a,b)=>String(b.date).localeCompare(String(a.date))).flatMap(p=>{
   const meta=p.extension?.['https://musicbrainz.org/doc/jspf#playlist'];const kind=meta?.additional_metadata?.algorithm_metadata?.source_patch;
   const id=mbid(p.identifier);if(!id||!['weekly-exploration','weekly-jams','daily-jams'].includes(kind)||seen.has(kind))return [];
   seen.add(kind);return [{id,title:text(p.title),kind,date:text(p.date),expiresAt:text(meta?.additional_metadata?.expires_at),url:`https://listenbrainz.org/playlist/${id}`}];
  });
 });}
 return {connection,save,
  async section(scope,kind,range,lookupArtwork){const c=await connected(scope);
   if(kind==='mixes')return {items:await recommendations(scope,c)};
   if(kind==='recent')return cached(scope,c,kind,async()=>{const r=await client.listens(c.username);return withArtwork({state:r.state,items:(r.data?.payload?.listens||[]).slice(0,25).map(l=>({id:createHash('sha256').update(JSON.stringify([l.listened_at,l.recording_msid,l.track_metadata?.track_name,l.track_metadata?.artist_name,l.track_metadata?.release_name])).digest('hex'),title:text(l.track_metadata?.track_name),artist:text(l.track_metadata?.artist_name),at:number(l.listened_at)})).filter((item,index,items)=>items.findIndex(other=>other.id===item.id)===index)},kind,lookupArtwork);});
   if(!['artists','recordings','release-groups','listening-activity'].includes(kind)||!['this_week','this_month','this_year','all_time'].includes(range))throw fail('Invalid statistics request.');
   return cached(scope,c,kind+range,async()=>{const r=await client.stats(c.username,kind,range);const p=r.data?.payload||{};
    const source=p[kind.replaceAll('-','_')]||[];
    const start=new Date(now());start.setUTCHours(0,0,0,0);
    if(range==='this_month')start.setUTCDate(1);if(range==='this_year'){start.setUTCMonth(0,1);}if(range==='this_week')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
    return withArtwork({state:r.state,updatedAt:number(p.last_updated),items:source.filter(x=>kind!=='listening-activity'||range==='all_time'||x.from_ts>=start.getTime()/1000).map(x=>({title:text(kind==='artists'?x.artist_name:kind==='recordings'?x.track_name:kind==='release-groups'?x.release_group_name:x.time_range),artist:text(x.artist_name),count:number(x.listen_count),from:number(x.from_ts)}))},kind,lookupArtwork);
   });
  },
  async playlist(scope,id,search){const c=await connected(scope);const mixes=await recommendations(scope,c);if(!mixes.some(m=>m.id===id))throw fail('This playlist is not part of your current recommendations.',404);
   const tracks=await cached(scope,c,'playlist:'+id,async()=>{const r=await client.playlist(id);return (r.data?.playlist?.track||[]).slice(0,100).map(t=>({title:text(t.title),artist:text(t.creator),album:text(t.album),duration:number(t.duration)/1000,mbid:(t.identifier||[]).map(mbid).find(Boolean)}));});
   const items=new Array(tracks.length);let cursor=0;const deadline=now()+45000;
   await Promise.all(Array.from({length:Math.min(4,tracks.length)},async()=>{while(cursor<tracks.length){const index=cursor++,track=tracks[index];try{if(now()>deadline)throw Error('Deadline');items[index]={...track,...matchRecording(track,await search(track))};}catch{items[index]={...track,state:'error'};}}}));
   if((await connection(scope)).revision!==c.revision)throw fail('Connection changed. Reload to continue.',409);
   const used=new Set();return {items:items.map(item=>{if(item.song){if(used.has(item.song.id))return {...item,state:'duplicate',song:undefined};used.add(item.song.id);}return item;})};
  }
 };
}

async function withArtwork(value,kind,lookup) {
 if(!lookup||kind==='listening-activity')return value;
 let cursor=0;const items=value.items.slice(0,10);
 await Promise.all(Array.from({length:Math.min(2,items.length)},async()=>{while(cursor<items.length){const item=items[cursor++];try{const coverArt=await lookup(item,kind);if(typeof coverArt==='string')item.coverArt=coverArt;else if(coverArt){if(coverArt.coverArt)item.coverArt=coverArt.coverArt;if(kind==='release-groups'&&coverArt.albumId)item.albumId=coverArt.albumId;if((kind==='recordings'||kind==='recent')&&coverArt.song?.id)item.song=coverArt.song;}}catch{/* Artwork never blocks listening statistics. */}}}));
 return value;
}
