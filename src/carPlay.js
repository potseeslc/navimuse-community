import {downloadGroups} from './downloadGroups.js';
const text=value=>String(value||'').slice(0,512);
// Only IDs from this account's current catalog may become playback commands.
export function carPlayCatalog({scope,enabled,blocked,queue,downloads,albums=[],playlists=[],mix=[],offline=false}) {
 const actions=new Map();
 const item=(id,title,detail,action)=>{actions.set(id,action);return {id,title:text(title),detail:text(detail)};};
 const sections=['Listen','Downloads','Playlists','Journeys'].map(title=>({title,items:[]}));
 if(!enabled||!scope||blocked){sections[0].items=[{id:'',title:blocked?'Playback is on another output':'Open NaviMuse on your iPhone',detail:blocked?'Choose This device while parked.':'Sign in while parked to load your music.'}];return {sections,actions};}
 const songs=queue?.items||[];
 if(songs.length)sections[0].items.push(item('resume','Resume listening',songs[queue.index]?.song?.title,{kind:'resume'}));
 if(!offline&&mix.length&&!queue?.instanceId)sections[0].items.push(item('mix','Your Personalized Mix',`${mix.length} songs`,{kind:'songs',songs:mix,label:'Your Personalized Mix'}));
 if(!queue?.instanceId)for(const album of albums.slice(0,20))sections[0].items.push(item(`album:${album.id}`,album.name||album.title,album.artist,{kind:'album',id:album.id}));
 for(const [index,entry] of songs.slice(Math.max(0,queue?.index||0),Math.max(0,queue?.index||0)+15).entries())sections[0].items.push(item(`queue:${entry.queueItemId||index}`,entry.song?.title,entry.song?.artist,{kind:'queue',queueItemId:entry.queueItemId}));
 const complete=downloads?.available&&downloads.scope===scope?(downloads.tracks||[]).filter(t=>t.state==='complete'):[];
 if(!queue?.instanceId){
  for(const group of [...downloadGroups(complete,'playlists'),...downloadGroups(complete,'albums')].slice(0,40))sections[1].items.push(item(`download:${sections[1].items.length}`,group.name,`${group.tracks.length} songs ready offline`,{kind:'downloads',songs:group.tracks.map(t=>t.song),label:group.name}));
  if(!offline)for(const playlist of playlists.slice(0,40))sections[2].items.push(item(`playlist:${playlist.id}`,playlist.name,`${playlist.songCount||0} songs`,{kind:'playlist',id:playlist.id}));
 }
 if(queue?.instanceId)for(const index of [1,2])sections[index].items=[{id:'',title:'Your Journey controls this queue',detail:'Change music on your iPhone while parked.'}];
 if(queue?.instanceId||songs.some(x=>x.radioSeed))sections[3].items.push(item('journey','Continue current Journey',queue.source?.label||'Continue your listening session',{kind:'resume'}));
 else sections[3].items=[{id:'',title:'Choose a Journey on your iPhone',detail:'Start a Journey while parked, then continue here.'}];
 for(const section of sections)section.items=section.items.slice(0,40);
 return {sections,actions};
}
export async function performCarPlaySelection(event,context,{fetchJson,playSongs,resume,selectQueue,isCancelled=()=>false,now=Date.now}={}) {
 const initial=context();const valid=()=>{const c=context();return !isCancelled()&&c.enabled&&!c.blocked&&c.scope===event.scope&&c.revision===event.revision&&now()<event.expiresAt;};
 if(!valid())return false;const action=initial.actions.get(event.id);if(!action)return false;
 let songs,label=action.label;
 if(action.kind==='resume'){resume();return true;}
 if(action.kind==='queue'){selectQueue(action.queueItemId);return true;}
 if(action.kind==='album'||action.kind==='playlist'){
  const path=action.kind==='album'?'albums':'playlists';const payload=await fetchJson(`/api/navidrome/${path}/${encodeURIComponent(action.id)}`,Math.max(1,event.expiresAt-now()));
  if(!valid())return false;
  const data=action.kind==='album'?payload.album:payload.playlist;songs=action.kind==='album'?data?.song:data?.entry;label=data?.name||'CarPlay';
 }else songs=action.songs;
 if(!valid()||!Array.isArray(songs)||!songs.length)return false;
 if(action.kind==='downloads'){
  const c=context();const ready=new Set(c.downloads?.available&&c.downloads.scope===c.scope?c.downloads.tracks.filter(t=>t.state==='complete').map(t=>t.song.id):[]);
  songs=songs.filter(s=>ready.has(s.id));if(!songs.length)return false;
 }
 playSongs(songs,label);return true;
}
