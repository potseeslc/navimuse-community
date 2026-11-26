// LAN transport only. Queue, ownership, authorization and grants stay in the BFF.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startPlexDiscovery} from '../server/plex/discovery.mjs';
import {createHostBridgeHandler} from '../server/wiim/hostBridge.mjs';
const [registry,keyFile,mediaBaseUrl,port='18098']=process.argv.slice(2);
if(!registry||!keyFile||!mediaBaseUrl)throw new Error('Usage: wiim-host.mjs registry key-file media-base-url [port]');
const key=readFileSync(keyFile,'utf8').trim();
const server=createServer({requestTimeout:15000,headersTimeout:10000},createHostBridgeHandler({key,mediaBaseUrl,devices:()=>JSON.parse(readFileSync(registry,'utf8')).devices}));
const plexDiscovery=process.env.NAVIMUSE_PLEX_DISCOVERY_PORT?startPlexDiscovery({port:Number(process.env.NAVIMUSE_PLEX_DISCOVERY_PORT),host:new URL(mediaBaseUrl).hostname}):null;
let scanning=false;
const scan=()=>{if(scanning)return;scanning=true;const child=spawn(process.execPath,[fileURLToPath(new URL('./wiim-discovery.mjs',import.meta.url)),registry],{stdio:['ignore','inherit','inherit']});child.on('error',()=>{scanning=false;});child.on('close',()=>{scanning=false;});};
server.listen(Number(port),'0.0.0.0',()=>{console.log('WiiM LAN transport ready');scan();});
const timer=setInterval(scan,20000);
const close=()=>{plexDiscovery?.close();clearInterval(timer);server.close(()=>process.exit(0));};process.on('SIGTERM',close);process.on('SIGINT',close);
