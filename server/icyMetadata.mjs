import {createHash} from 'node:crypto';

export function radioArtworkProxyPath(id, artwork) {
 if (!artwork) return null;
 const version=createHash('sha256').update(artwork).digest('hex').slice(0,16);
 return `/api/navidrome/radios/${encodeURIComponent(id)}/artwork?v=${version}`;
}

// ICY metadata is interleaved with audio. Strip it across arbitrary chunk boundaries
// before forwarding bytes to AVPlayer/HTMLAudio; retain only bounded plain text.
export function createIcyDecoder(interval,onMetadata){
 if(!Number.isInteger(interval)||interval<1||interval>16*1024*1024)return chunk=>[Buffer.from(chunk)];
 let audioLeft=interval,metadataLeft=-1,parts=[];
 return input=>{
  const chunk=Buffer.from(input),output=[];let offset=0;
  while(offset<chunk.length){
   if(audioLeft>0){const n=Math.min(audioLeft,chunk.length-offset);output.push(chunk.subarray(offset,offset+n));offset+=n;audioLeft-=n;continue;}
   if(metadataLeft<0){metadataLeft=chunk[offset++]*16;parts=[];if(!metadataLeft){audioLeft=interval;metadataLeft=-1;}continue;}
   const n=Math.min(metadataLeft,chunk.length-offset);parts.push(chunk.subarray(offset,offset+n));offset+=n;metadataLeft-=n;
   if(metadataLeft===0){const text=Buffer.concat(parts).toString('utf8').replace(/\0+$/,'');const title=/StreamTitle='([^']*)'/i.exec(text)?.[1];const artwork=/StreamUrl='([^']*)'/i.exec(text)?.[1];onMetadata({title:title?.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,512),artwork});audioLeft=interval;metadataLeft=-1;parts=[];}
  }
  return output;
 };
}
