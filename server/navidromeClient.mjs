import {createHash,randomBytes} from 'node:crypto';
import {canonicalNavidromeParams,navidromeIdPolicy} from './navidromeIds.mjs';
const methods=new Set(['getOpenSubsonicExtensions','ping','getGenres','getAlbumList2','getMusicFolders','search3','getSong','getLyricsBySongId','getLyrics','getArtist','getArtistInfo2','getTopSongs','getAlbum','getSongsByGenre','createPlaylist','updatePlaylist','deletePlaylist','star','unstar','setRating','scrobble','getArtists','getPlaylists','getPlaylist','getInternetRadioStations','createInternetRadioStation','getCoverArt','stream']);
const reserved=new Set(['u','p','s','t','apikey','v','c','f']);
const fail=()=>{throw new TypeError('Invalid Navidrome request');};
function configured(value) {
  let url;try {url=new URL(value.url);} catch {fail();}
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      typeof value.username!=='string' || typeof value.password!=='string') fail();
  return {url:url.href,username:value.username,password:value.password};
}
// Private BFF helper only: its URL contains authentication material.
export function navidromeEndpointFor(config,pathname,params={},options={}) {
  const method=/^\/rest\/([A-Za-z0-9]+)\.view$/.exec(pathname)?.[1];
  if (!methods.has(method) || !params || typeof params!=='object' || Array.isArray(params) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(params))) fail();
  const saved=configured(config),url=new URL(saved.url.replace(/\/$/,'')+pathname);
  for (const [key,value] of Object.entries(params)) {
    if (reserved.has(key.toLowerCase()) || !/^[A-Za-z][A-Za-z0-9]*$/.test(key)) fail();
    const values=key==='musicFolderId'&&typeof value==='string'?value.split(','):Array.isArray(value)?value:[value];
    if(key==='musicFolderId'&&(values.length>64||values.some(id=>id!==''&&!/^[a-zA-Z0-9_-]{1,128}$/.test(String(id)))))fail();
    for (const item of values) {
      if (item===undefined || item===null || item==='') continue;
      if (!['string','number','boolean'].includes(typeof item) || typeof item==='number'&&!Number.isFinite(item)) fail();
      url.searchParams.append(key,String(item));
    }
  }
  const salt=randomBytes(12).toString('hex');
  url.searchParams.set('u',saved.username);url.searchParams.set('s',salt);
  url.searchParams.set('t',createHash('md5').update(saved.password+salt).digest('hex'));
  url.searchParams.set('v','1.16.1');url.searchParams.set('c','NaviMuse');
  if (options.formatJson!==false) url.searchParams.set('f','json');
  return url.href;
}
export function createNavidromeClient(config,{fetchImpl=globalThis.fetch}={}) {
  const saved=configured(config);
  if (!saved.username || !saved.password || typeof fetchImpl!=='function') fail();
  const canonical=navidromeIdPolicy(saved,fetchImpl);
  async function probe(signal) {
    const response=await fetchImpl(navidromeEndpointFor(saved,'/rest/ping.view'),{redirect:'manual',signal});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body){await response.body?.cancel();return null;}
    const reader=response.body.getReader();const chunks=[];let length=0;
    try {
      for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384)throw new Error('Invalid Navidrome ping');chunks.push(Buffer.from(value));}
      return JSON.parse(Buffer.concat(chunks,length).toString('utf8'))?.['subsonic-response'];
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  return Object.freeze({
    async request(pathname,params={},options={}) {
      if (!options || typeof options!=='object' || Object.keys(options).some(key=>!['formatJson','signal','headers','formPost'].includes(key))) fail();
      if (options.formPost !== undefined && typeof options.formPost !== 'boolean') fail();
      if (options.formPost && (pathname !== '/rest/createPlaylist.view' || options.headers !== undefined)) fail();
      const headers={};
      if (options.headers!==undefined) {
        if (!options.headers || typeof options.headers!=='object' || Array.isArray(options.headers)) fail();
        for (const [key,value] of Object.entries(options.headers)) {
          if (key.toLowerCase()!=='range' || typeof value!=='string' || value.length>256 || !/^bytes=(?:\d+-\d*|-\d+)(?:,\s*(?:\d+-\d*|-\d+))*$/.test(value)) fail();
          headers.Range=value;
        }
      }
      // Validate before probing: invalid requests must never reach a transport.
      let url=new URL(navidromeEndpointFor(saved,pathname,params,options));
      const converted=canonicalNavidromeParams(pathname,params);
      if(JSON.stringify(converted)!==JSON.stringify(params)) {
        try {if(await canonical(probe,options.signal))url=new URL(navidromeEndpointFor(saved,pathname,converted,options));}
        catch {const error=new Error('Navidrome request cancelled');error.name='AbortError';error.status=502;throw error;}
      }
      let body;
      if (options.formPost) {body=url.searchParams.toString();url.search='';headers['content-type']='application/x-www-form-urlencoded';}
      try {return await fetchImpl(url.href,{method:options.formPost?'POST':'GET',headers,...(body===undefined?{}:{body}),redirect:'manual',signal:options.signal});}
      catch (cause) {
        const error=new Error('Navidrome request failed');
        error.name=cause?.name==='TimeoutError'?'TimeoutError':cause?.name==='AbortError'?'AbortError':'Error';
        error.status=error.name==='TimeoutError'?504:502;
        error.publicMessage=error.name==='TimeoutError'?'Navidrome timed out':'Navidrome is unavailable';
        throw error;
      }
    },
  });
}
