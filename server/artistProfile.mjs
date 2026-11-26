// Optional popularity comes from the configured Navidrome metadata provider.
// A provider outage must not prevent browsing the artist's local albums.
export async function artistProfile(fetchNavidrome,id) {
 const {artist}=await fetchNavidrome('/rest/getArtist.view',{id});
 if(!artist){const error=new Error('Artist not found');error.status=404;error.publicMessage=error.message;throw error;}
 let biography=null;
 const biographyRequest=(async()=>{try {
  const {artistInfo2:info}=await fetchNavidrome('/rest/getArtistInfo2.view',{id,count:'0',includeNotPresent:'false'},{signal:AbortSignal.timeout(2500)});
  const text=typeof info?.biography==='string'?info.biography.slice(0,40000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,value=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[value]).replace(/\s+/g,' ').trim():'';
  if(text){let sourceUrl=null;try{const url=new URL(info.lastFmUrl);if(url.protocol==='https:'&&['www.last.fm','last.fm'].includes(url.hostname)&&!url.username&&!url.password)sourceUrl=url.href;}catch{}
   biography={text,sourceUrl};
  }
 }catch{}})();
 let popular=[],popularAvailable=false;
 if(artist.name)try {
  const response=await fetchNavidrome('/rest/getTopSongs.view',{artist:artist.name,count:'20'},{signal:AbortSignal.timeout(2500)});
  const songs=response.topSongs?.song;popular=(Array.isArray(songs)?songs:songs?[songs]:[]).filter(s=>s?.id && (s.artistId?s.artistId===id:String(s.artist||'').toLocaleLowerCase()===String(artist.name).toLocaleLowerCase())).slice(0,20);popular=[...new Map(popular.map(song=>[song.id,song])).values()];popularAvailable=true;
 }catch{}
 await biographyRequest;
 return {biography,artist:{id:artist.id||id,name:artist.name||'',coverArt:artist.coverArt||null},popular,popularAvailable};
}
