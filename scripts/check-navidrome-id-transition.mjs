// Operator-only, isolated-server check. Read credentials from stdin, never argv
// or a saved report. This script performs reads only and reports no library IDs.
import {createNavidromeClient,navidromeEndpointFor} from '../server/navidromeClient.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {config,oldId,newId,oldPlaylistId}=JSON.parse(input);input='';
const client=createNavidromeClient(config),report={};
try {
  let ready=false;
  for(let attempt=0;attempt<15;attempt++) {
    try {const r=await client.request('/rest/ping.view',{}, {signal:AbortSignal.timeout(2000)});const body=await r.json();ready=body?.['subsonic-response']?.status==='ok';if(ready){report.serverVersion=body['subsonic-response'].serverVersion;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw Error('not ready');
  const raw=await fetch(navidromeEndpointFor(config,'/rest/getSong.view',{id:oldId}),{redirect:'manual',signal:AbortSignal.timeout(5000)});
  const direct=(await raw.json())['subsonic-response'];report.directOldId={status:direct.status,errorCode:direct.error?.code};
  for(const [label,id] of [['translatedOldId',oldId],['currentId',newId]]) {
    const r=await client.request('/rest/getSong.view',{id},{signal:AbortSignal.timeout(8000)});
    const body=(await r.json())['subsonic-response'];report[label]={status:body.status,matchesMigratedTrack:body.song?.id===newId};
  }
  if(oldPlaylistId) {
    const r=await client.request('/rest/getPlaylist.view',{id:oldPlaylistId},{signal:AbortSignal.timeout(8000)});
    const body=(await r.json())['subsonic-response'];report.playlist={status:body.status,entryCount:body.playlist?.entry?.length||0};
  }
  const stream=await client.request('/rest/stream.view',{id:oldId,format:'opus',maxBitRate:128},{formatJson:false,signal:AbortSignal.timeout(15000)});
  const reader=stream.body?.getReader();let bytes=0;
  try {while(reader&&bytes<65536){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;}}
  finally{await reader?.cancel().catch(()=>{});reader?.releaseLock();}
  report.opus={status:stream.status,contentType:stream.headers.get('content-type'),receivedBytes:bytes};
  report.passed=report.translatedOldId.matchesMigratedTrack&&report.currentId.matchesMigratedTrack&&
    (!oldPlaylistId||report.playlist.status==='ok')&&stream.ok&&/^audio\//.test(report.opus.contentType||'')&&bytes>0;
}catch{report.passed=false;report.error='Isolated API check did not complete; inspect private test-server logs.';}
console.log(JSON.stringify(report,null,2));process.exitCode=report.passed?0:1;
