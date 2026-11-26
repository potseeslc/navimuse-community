import {createHash} from 'node:crypto';

const digits='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const max128=(1n<<128n)-1n;
function encode(value) {
  let result='';
  do {result=digits[Number(value%62n)]+result;value/=62n;} while(value);
  return result.padStart(22,'0');
}
// Match Navidrome v0.64.0's canonicalID migration, including overflowing nanoids.
// This is identity conversion, never a title/path-based guess or an access grant.
export function canonicalNavidromeId(value) {
  if(typeof value!=='string')return value;
  if(/^[0-9a-fA-F]{32}$/.test(value))return encode(BigInt('0x'+value));
  if(/^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/.test(value))return encode(BigInt('0x'+value.replaceAll('-','')));
  if(/^[0-9a-zA-Z]{22}$/.test(value)) {
    let number=0n;for(const digit of value)number=number*62n+BigInt(digits.indexOf(digit));
    if(number>max128)return encode(BigInt('0x'+createHash('md5').update(value).digest('hex')));
  }
  return value;
}
export function canonicalCoverArtId(value) {
  if(typeof value!=='string')return value;
  const prefix=/^(al-|ar-|pl-|mf-|ra-)(.+)$/.exec(value);
  return prefix?prefix[1]+canonicalNavidromeId(prefix[2]):canonicalNavidromeId(value);
}
export function usesCanonicalNavidromeIds(response) {
  if(response?.status!=='ok'||typeof response.type!=='string'||response.type.toLowerCase()!=='navidrome')return false;
  const version=/^v?(\d+)\.(\d+)\.(\d+)(?:[-+ ].*)?$/.exec(response.serverVersion||'');
  return Boolean(version&&(Number(version[1])>0||Number(version[2])>=64));
}
export function navidromeSongForReference(response,id) {
  const song=response?.song;
  return song&&usesCanonicalNavidromeIds(response)&&song.id===canonicalNavidromeId(id)
    ? {...song,id} : song;
}
// Only protocol ID parameters. Never rewrite names, search text, numeric library
// IDs, removal indexes, credentials, or arbitrary JSON that happens to look like an ID.
const fields=new Set(['id','songId','songIdToAdd','playlistId','albumId','artistId']);
export function canonicalNavidromeParams(pathname,params) {
  return Object.fromEntries(Object.entries(params).map(([key,value])=>{
    if(!fields.has(key))return [key,value];
    const convert=pathname==='/rest/getCoverArt.view'&&key==='id'?canonicalCoverArtId:canonicalNavidromeId;
    return [key,Array.isArray(value)?value.map(convert):convert(value)];
  }));
}

// Bounded, credential-scoped cache survives short-lived legacy clients without
// mixing servers/accounts or test transports. No secrets appear in cache keys.
const transports=new WeakMap();
export function navidromeIdPolicy(config,fetchImpl,{now=Date.now}={}) {
  let cache=transports.get(fetchImpl);if(!cache){cache=new Map();transports.set(fetchImpl,cache);}
  const key=createHash('sha256').update(JSON.stringify([config.url,config.username,config.password])).digest('hex');
  return async function canonical(probe,signal) {
    signal?.throwIfAborted();
    const entry=cache.get(key);if(entry?.expires>now())return entry.value;
    // Share the probe independently of any one caller's cancellation.
    let pending=entry?.pending;
    if(!pending) {
      pending=(async()=>{
        try {
          const value=usesCanonicalNavidromeIds(await probe(AbortSignal.timeout(2000)));
          cache.set(key,{value,expires:now()+(value?30000:5000)});return value;
        }catch{cache.set(key,{value:false,expires:now()+1000});return false;}
      })();
      if(cache.size>=256)cache.delete(cache.keys().next().value);
      cache.set(key,{pending});
    }
    if(!signal)return pending;
    let abort;
    try {return await Promise.race([pending,new Promise((_,reject)=>{
      abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted)abort();
    })]);}finally{signal.removeEventListener('abort',abort);}
  };
}
