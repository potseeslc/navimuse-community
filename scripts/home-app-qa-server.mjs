// Isolated QA server: runs the production app entry point with synthetic services.
// No production credentials, sessions, or upstream proxying. Loopback binding only.
import {createServer} from 'vite';
import {albums as covers,songs as examples} from '../docs/evidence/m8/library-design/fixtureData.js';
const albums=covers.map((album,index)=>({...album,artistId:`artist-${album.artist.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,coverArt:`qa-${index}`}));
const albumSongs=album=>examples.map((song,index)=>({...song,id:`${album.id}-${index}`,albumId:album.id,artistId:album.artistId,album:album.name,artist:album.artist,artwork:album.artwork,coverArt:album.coverArt,duration:60}));
const wav=Buffer.alloc(44+44100*60*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const folders=[{id:'music',name:'QA Music'},{id:'other',name:'QA Other'}];
const playlists=['Loved, Not Recent','Forgotten Decades','Unheard Favorites','Deep Cuts'].map((name,i)=>({id:`playlist-${i}`,name}));
const port=Number(process.env.NAVIMUSE_QA_PORT || 5200);
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'home-app-qa-services',configureServer(server){server.middlewares.use('/api/',(req,res)=>{
 const url=new URL(req.url,'http://localhost');const path=url.pathname;let body;
 if(path.startsWith('/navidrome/cover/')) {
  const album=albums.find(a=>a.coverArt===path.split('/').pop());
  if(album){res.writeHead(302,{Location:album.artwork});res.end();return;}
 }
 if(path.startsWith('/navidrome/stream/')) {
  const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),wav.length-1):wav.length-1;
  if(start>=wav.length||end<start){res.writeHead(416,{'Content-Range':`bytes */${wav.length}`});res.end();return;}
  res.writeHead(range?206:200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})});res.end(wav.subarray(start,end+1));return;
 }
 if(path==='/config')body={app:'NaviMuse',services:{}};
 else if(path==='/settings/session')body={adminConfigured:true,authenticated:true,queueScope:`queue-scope-v1:${'a'.repeat(64)}`};
 else if(path==='/settings'&&req.method==='GET')body={preferences:{}};
 else if(path==='/health')body={ok:false,services:{navidrome:{ok:true},audiomuse:{ok:false}}};
 else if(path==='/navidrome/bootstrap')body={musicFolders:folders,newestAlbums:albums,recentAlbums:[...albums].reverse(),randomAlbums:albums,frequentAlbums:albums};
 else if(path.startsWith('/navidrome/albums/')) {const album=albums.find(a=>a.id===path.split('/').pop());body=album&&{album:{...album,song:albumSongs(album)}};}
 else if(path.startsWith('/navidrome/songs/')) {
  const id=path.split('/').pop();
  const status=id===process.env.NAVIMUSE_QA_MISSING_SONG?404:Number(process.env.NAVIMUSE_QA_SONG_STATUS || 200);
  if(status!==200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:status===404?'QA track deliberately missing':'QA metadata deliberately unavailable'}));return;}
  const song=albums.flatMap(albumSongs).find(s=>s.id===id);body=song&&{song};
 }
 else if(path==='/navidrome/search') {
  const query=(url.searchParams.get('q')||'').toLowerCase();
  if(query==='error'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'QA search deliberately unavailable'}));return;}
  const artists=[...new Map(albums.map(a=>[a.artistId,{id:a.artistId,name:a.artist}])).values()].filter(a=>a.name.toLowerCase().includes(query));
  body={artists,albums:albums.filter(a=>`${a.name} ${a.artist}`.toLowerCase().includes(query)),songs:albums.flatMap(albumSongs).filter(s=>`${s.title} ${s.artist}`.toLowerCase().includes(query))};
 }
 else if(path==='/navidrome/library/albums')body={albums:albums.filter(a=>!url.searchParams.get('artistId')||a.artistId===url.searchParams.get('artistId')),page:{nextOffset:null}};
 else if(path==='/navidrome/library/artists')body={artists:albums.map(a=>({id:a.artistId,name:a.artist}))};
 else if(path==='/navidrome/library/genres')body={genres:[{value:'Electronic'}]};
 else if(path==='/navidrome/library/playlists')body={playlists};
 else if(path.startsWith('/navidrome/playlists/')){const playlist=playlists.find(p=>p.id===path.split('/').pop());body=playlist&&{playlist:{...playlist,entry:albumSongs(albums[0])}};}
 else if(path.startsWith('/navidrome/lyrics/'))body={songId:path.split('/').pop(),status:'ready',source:'library',synced:true,offsetMs:0,lines:['A quiet room, a record turns','The afternoon comes through the glass','We pause and find our place again','The next song waits beyond this one'].map((value,index)=>({value,startMs:index*15000}))};
 else if(path.startsWith('/navidrome/scrobble'))body={ok:true};
 else if(path.startsWith('/audiomuse/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'AudioMuse deliberately unavailable in QA'}));return;}
 if(body===undefined){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Not configured by the isolated QA service'}));return;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));
 });}}]});await server.listen();console.log(`Production App with synthetic QA services: http://127.0.0.1:${port}/?view=home`);
