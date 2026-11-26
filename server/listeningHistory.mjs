import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,openSync,closeSync,chmodSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
const fail=(message,status=400)=>Object.assign(Error(message),{status,publicMessage:message});
const text=value=>typeof value==='string'?value.slice(0,500):'';
export function openListeningHistory(directory,{now=Date.now}={}) {
 mkdirSync(directory,{recursive:true,mode:0o700});
 if(!lstatSync(directory).isDirectory()||(lstatSync(directory).mode&0o077))throw Error('Listening directory must be private');
 const file=join(directory,'history.sqlite');
 try{closeSync(openSync(file,'wx',0o600));}catch(e){if(e.code!=='EEXIST')throw e;}
 if(!lstatSync(file).isFile())throw Error('Listening database must be a regular file');
 chmodSync(file,0o600);
 const db=new DatabaseSync(file,{timeout:5000,allowExtension:false});
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS listens(scope TEXT NOT NULL,id TEXT NOT NULL,song_id TEXT NOT NULL,time INTEGER NOT NULL,song TEXT NOT NULL,PRIMARY KEY(scope,id));
 CREATE INDEX IF NOT EXISTS listens_by_time ON listens(scope,time);`);
 let closed=false;
 const find=db.prepare('SELECT song_id,time FROM listens WHERE scope=? AND id=?');
 const insert=db.prepare('INSERT OR IGNORE INTO listens(scope,id,song_id,time,song) VALUES(?,?,?,?,?)');
 function validate(scope,event){
  if(typeof scope!=='string'||!scope||!event||typeof event.id!=='string'||!/^[a-f0-9-]{36}$/i.test(event.id)||typeof event.songId!=='string'||!event.songId||event.songId.length>512||!Number.isSafeInteger(event.time)||event.time<=0||event.time>now()+300000)throw fail('Invalid listening record');
  const prior=find.get(scope,event.id);
  if(prior&&(prior.song_id!==event.songId||prior.time!==event.time))throw fail('Listening record changed',409);
  return Boolean(prior);
 }
 return {
  has:validate,
  record(scope,event,input){
   if(validate(scope,event))return {ok:true,id:event.id,duplicate:true};
   if(!input||input.id!==event.songId||input.isRadio)throw fail('Listening track unavailable');
   const song={id:text(input.id),title:text(input.title||input.name),artist:text(input.artist),artistId:text(input.artistId),album:text(input.album),albumId:text(input.albumId),coverArt:text(input.coverArt),duration:Number(input.duration)||0};
   insert.run(scope,event.id,event.songId,event.time,JSON.stringify(song));return {ok:true,id:event.id};
  },
  section(scope,kind,range='this_month'){
   if(!scope)throw fail('Sign in first',401);
   if(!['recent','listening-activity','artists','release-groups','recordings'].includes(kind)||!['this_week','this_month','this_year','all_time'].includes(range))throw fail('Invalid listening chart request');
   const end=now(),start=new Date(end);start.setUTCHours(0,0,0,0);
   if(range==='this_week')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
   if(range==='this_month')start.setUTCDate(1);
   if(range==='this_year')start.setUTCMonth(0,1);
   const from=range==='all_time'||kind==='recent'?0:start.getTime();
   const coverage=db.prepare('SELECT MIN(time) AS first FROM listens WHERE scope=?').get(scope).first;
   const result={state:'ready',source:'navimuse',updatedAt:Math.floor(end/1000),historySince:coverage?Math.floor(coverage/1000):null,items:[]};
   if(kind==='recent'){
    result.items=db.prepare('SELECT id,time,song FROM listens WHERE scope=? AND time<=? ORDER BY time DESC,id LIMIT 25').all(scope,end).map(r=>{const song=JSON.parse(r.song);return {id:r.id,at:Math.floor(r.time/1000),title:song.title,artist:song.artist,coverArt:song.coverArt,song};});return result;
   }
   // One indexed account/range scan; immutable metadata snapshots survive library changes.
   const rows=db.prepare('SELECT time,song FROM listens WHERE scope=? AND time>=? AND time<=? ORDER BY time').all(scope,from,end);
   const groups=new Map();
   for(const row of rows){
    const song=JSON.parse(row.song);let key,item;
    if(kind==='listening-activity'){
     const date=new Date(row.time);date.setUTCHours(0,0,0,0);if(range==='all_time'||range==='this_year')date.setUTCDate(1);
     key=date.getTime();item={from:key/1000,title:date.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',...(range==='this_year'||range==='all_time'?{year:'numeric'}:{day:'numeric'})})};
    }else if(kind==='artists'){key=song.artistId||song.artist.toLowerCase();item={title:song.artist||'Unknown artist'};}
    else if(kind==='release-groups'){key=song.albumId||JSON.stringify([song.artist.toLowerCase(),song.album.toLowerCase()]);item={title:song.album||'Unknown album',artist:song.artist,albumId:song.albumId,coverArt:song.coverArt};}
    else {key=song.id;item={title:song.title,artist:song.artist,coverArt:song.coverArt,song};}
    const old=groups.get(key);if(old)old.count++;else groups.set(key,{...item,count:1});
   }
   if(kind==='listening-activity'&&rows.length){
    const cursor=new Date(range==='all_time'?rows[0].time:from);cursor.setUTCHours(0,0,0,0);
    const monthly=range==='this_year'||range==='all_time';if(monthly)cursor.setUTCDate(1);
    while(cursor.getTime()<=end){const key=cursor.getTime();if(!groups.has(key))groups.set(key,{from:key/1000,title:cursor.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',...(monthly?{year:'numeric'}:{day:'numeric'})}),count:0});if(monthly)cursor.setUTCMonth(cursor.getUTCMonth()+1);else cursor.setUTCDate(cursor.getUTCDate()+1);}
   }
   result.items=[...groups.values()];
   if(kind==='listening-activity')result.items.sort((a,b)=>a.from-b.from);
   else result.items.sort((a,b)=>b.count-a.count||a.title.localeCompare(b.title));
   if(kind!=='listening-activity')result.items=result.items.slice(0,100);
   result.total=rows.length;return result;
  },
  close(){if(!closed){db.close();closed=true;}}
 };
}
