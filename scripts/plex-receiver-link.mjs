// Admin-only CLI. Tokens stay in a mode-0600 file, never in command arguments.
import {readFile,mkdir,writeFile,rename,chmod} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {plexHeaders,boundedJson,validatePlexConfig,localAddress} from '../server/plex/source.mjs';
const [action,...args]=process.argv.slice(2),options=Object.fromEntries(args.reduce((pairs,v,i)=>i%2?pairs:[...pairs,[v.replace(/^--/,''),args[i+1]]],[]));
const configFile=options.config&&resolve(options.config),pendingFile=configFile&&configFile+'.link.json';
async function save(file,value){await mkdir(dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,file);await chmod(file,0o600);}
async function cloud(path,receiver,{method='GET',body,token}={}){return boundedJson(await fetch('https://plex.tv/api/v2/'+path,{method,body,redirect:'error',signal:AbortSignal.timeout(10000),headers:{...plexHeaders(receiver),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(token?{'X-Plex-Token':token}:{})}}),131072);}
async function readOptional(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;if(e instanceof SyntaxError)throw Error('Invalid private receiver configuration');throw e;}}
try{
 if(!configFile||!['begin','finish','status','discover'].includes(action))throw Error('Usage: node scripts/plex-receiver-link.mjs begin --config /private/receivers.json --server http://LAN:32400 --advertised http://LAN:18099 --device approved-device-id --name "NaviMuse Bedroom"; then finish --config /private/receivers.json');
 if(action==='begin'){
  const server=new URL(options.server);if(!localAddress(server.hostname)||!['http:','https:'].includes(server.protocol)||server.username||server.password||server.pathname!=='/'||server.search||server.hash)throw Error('Use the local Plex server URL');
  const endpoint=new URL(options.advertised);if(!localAddress(endpoint.hostname)||endpoint.protocol!=='http:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw Error('Use the local receiver URL');
  if(!/^[a-z0-9_-]{1,64}$/.test(options.device||''))throw Error('Choose an approved speaker device ID');
  const response=await fetch(new URL('/identity',server),{signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok)throw Error('Plex server identity unavailable');
  const identity=(await response.text()).match(/machineIdentifier="([\w]{8,128})"/)?.[1];if(!identity)throw Error('Plex server identity unavailable');
  const existing=await readOptional(configFile);
  if(existing&&(existing.server.url!==server.origin||existing.advertisedUrl!==endpoint.origin))throw Error('Existing receivers use a different server or advertised URL');
  const receiver={id:existing?.receivers.find(r=>r.deviceId===options.device)?.id||'navimuse-'+randomUUID(),deviceId:options.device,name:options.name||'NaviMuse Speaker'};
  // Validate names, ports and IDs before initiating the account-link flow.
  validatePlexConfig({version:1,server:{url:server.origin,machineIdentifier:identity},advertisedUrl:endpoint.origin,receivers:[{...receiver,accountId:'1',token:'pending-link-token'}]});
  const pin=await cloud('pins',receiver,{method:'POST',body:new URLSearchParams({strong:'false'})});
  if(!pin.id||!pin.code)throw Error('Plex did not return a linking code');
  await save(pendingFile,{version:1,server:{url:server.origin,machineIdentifier:identity},advertisedUrl:endpoint.origin,receiver,pinId:pin.id,expires:Date.now()+Math.min(Number(pin.expiresIn)||300,1800)*1000});
  console.log(JSON.stringify({receiver:receiver.name,url:'https://plex.tv/link',code:pin.code,expiresIn:pin.expiresIn||300}));
 }else if(action==='finish'){
  const pending=await readOptional(pendingFile);if(!pending||pending.expires<Date.now())throw Error('Link expired; run begin again');
  const pin=await cloud('pins/'+pending.pinId,pending.receiver);
  if(!pin.authToken){console.log('Waiting for Plex account approval. Complete the link, then run finish again.');process.exitCode=2;}
  else{
   const user=await cloud('user',pending.receiver,{token:pin.authToken});
   const receiver={...pending.receiver,token:pin.authToken,accountId:String(user.id)};
   const existing=await readOptional(configFile);
   const config=validatePlexConfig({version:1,server:pending.server,advertisedUrl:pending.advertisedUrl,autoDiscover:existing?.autoDiscover===true,receivers:[...(existing?.receivers||[]).filter(r=>r.id!==receiver.id),receiver]});
   await save(configFile,config);await save(pendingFile,{completed:true});
   console.log(JSON.stringify({linked:true,receiver:receiver.name,deviceId:receiver.deviceId,configFile}));
  }
 }else if(action==='discover'){
  if(!['true','false'].includes(options.enabled))throw Error('Use discover --config /private/receivers.json --enabled true|false');
  const config=validatePlexConfig({...await readOptional(configFile),autoDiscover:options.enabled==='true'});
  await save(configFile,config);console.log(JSON.stringify({autoDiscover:config.autoDiscover,restartRequired:true}));
 }else {
  const config=validatePlexConfig(await readOptional(configFile));
  console.log(JSON.stringify({server:config.server,advertisedUrl:config.advertisedUrl,autoDiscover:config.autoDiscover,receivers:config.receivers.map(({id,name,deviceId})=>({id,name,deviceId}))}));
 }
}catch(error){console.error(error?.status?'Plex linking failed; verify your account approval and server access.':error.message);process.exitCode=1;}
