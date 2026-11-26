export function downloadGroups(tracks,kind='albums') {
 const groups=new Map();
 for(const track of tracks) {
  const song=track.song;
  const keys=kind==='playlists'?(song.downloadCollections||[]):[{id:song.albumId||`${song.album||'Singles'}:${song.artist||''}`,name:song.album||'Singles'}];
  for(const item of keys){if(!item?.id||!item.name)continue;if(!groups.has(item.id))groups.set(item.id,{...item,tracks:[]});groups.get(item.id).tracks.push(track);}
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(group=>({...group,tracks:kind==='albums'?[...group.tracks].sort((a,b)=>(a.song.discNumber||1)-(b.song.discNumber||1)||(a.song.track||0)-(b.song.track||0)):group.tracks.slice().sort((a,b)=>(a.song.downloadCollections?.find(c=>c.id===group.id)?.position||0)-(b.song.downloadCollections?.find(c=>c.id===group.id)?.position||0))}));
}
