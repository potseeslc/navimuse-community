import {PlaybackError} from '../../shared/wiim/contract.js';

// Fixed public paths: bearer grants never authorize the authenticated control API.
export function createWiiMHttpHandler({coordinator,principalFor,requestFor,radioMediaFor,externalMediaFor,readBody}) {
 const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
 return async function handle(req,res){
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/api/playback/wiim')&&!url.pathname.startsWith('/media/wiim/'))return false;
  try {
   if(!coordinator)throw new PlaybackError('WiiM Direct is not enabled on this server',503);
   if(url.pathname.startsWith('/media/wiim/')){
    const match=/^\/media\/wiim\/([A-Za-z0-9_-]{32})\/(audio|art\.jpg)$/.exec(url.pathname);
    if(!match||url.search)throw new PlaybackError('Media not found',404);
    if(!['GET','HEAD'].includes(req.method))throw new PlaybackError('Method not allowed',405);
    const grant=await coordinator.grant(match[1],match[2]==='audio'?'audio':'art');
    const controller=new AbortController();res.once('close',()=>controller.abort());
    const headers={};if(req.headers.range){if(!/^bytes=(?:\d+-\d*|-\d+)$/.test(req.headers.range)||req.headers.range.length>128)throw new PlaybackError('Invalid media range',400);headers.Range=req.headers.range;}
    const audio=match[2]==='audio';
    const upstream=grant.principal.kind==='plex'
     ? await externalMediaFor(grant.principal,grant.songId,{artwork:!audio,headers,signal:controller.signal})
     : grant.isRadio
     ? await radioMediaFor(grant.principal,grant.songId,{artwork:!audio,signal:controller.signal})
     : await requestFor(grant.principal,audio?'/rest/stream.view':'/rest/getCoverArt.view',audio?{id:grant.songId,format:'raw'}:{id:grant.coverArt||grant.songId,size:600},{formatJson:false,headers,signal:controller.signal});
    const type=upstream.headers.get('content-type')||'';
    if(![200,206,416].includes(upstream.status)||upstream.status!==416&&!(audio?/^(audio\/|application\/octet-stream)/i:/^image\/(jpeg|png|webp)(;|$)/i).test(type)){
     await upstream.body?.cancel();throw new PlaybackError('Speaker media is unavailable',502);
    }
    if(audio&&req.method==='GET'&&[200,206].includes(upstream.status)&&upstream.body)coordinator.receivedMedia?.(match[1],type);
    const outgoing={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
    for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(key);if(value)outgoing[key]=value;}
    res.writeHead(upstream.status,outgoing);
    if(req.method==='HEAD'||!upstream.body){await upstream.body?.cancel();res.end();return true;}
    // pipeline handles client disconnect and backpressure without buffering songs.
    const {Readable}=await import('node:stream');const {pipeline}=await import('node:stream/promises');
    await pipeline(Readable.fromWeb(upstream.body),res);return true;
   }
   const principal=await principalFor(req,res,url);if(!principal)return true;
   if(url.pathname==='/api/playback/wiim/outputs'&&req.method==='GET')send(res,200,{outputs:await coordinator.outputs()});
   else if(url.pathname==='/api/playback/wiim/session'&&req.method==='GET')send(res,200,{session:await coordinator.snapshot(principal)});
   else if(url.pathname==='/api/playback/wiim/session'&&req.method==='POST')send(res,201,{session:await coordinator.create(principal,await readBody(req))});
   else {
    const match=/^\/api\/playback\/wiim\/session\/([a-f0-9-]{36})\/commands$/.exec(url.pathname);
    if(!match||req.method!=='POST')throw new PlaybackError('Playback route not found',404);
    send(res,200,{session:await coordinator.command(principal,match[1],await readBody(req))});
   }
  }catch(error){if(!res.headersSent)send(res,error instanceof PlaybackError?error.status:502,{ok:false,error:error instanceof PlaybackError?error.message:'WiiM request failed'});else if(!res.destroyed)res.destroy();}
  return true;
 };
}
