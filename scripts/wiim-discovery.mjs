// Run on the LAN host (outside Docker Desktop's multicast-isolated VM).
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {findRenderers,inspectDiscoveredSpeaker} from '../server/wiim/discovery.mjs';
const file=process.argv[2];
if(!file)throw new Error('Usage: node scripts/wiim-discovery.mjs <registry.json>');
await mkdir(dirname(file),{recursive:true});
let previous={devices:[]};
try{previous=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const addresses=await findRenderers();
const results=await Promise.allSettled(addresses.map(address=>inspectDiscoveredSpeaker(address,previous.devices)));
const devices=new Map(previous.devices.map(d=>[d.uuid,d]));
for(const result of results)if(result.status==='fulfilled'&&(devices.has(result.value.uuid)||devices.size<16))devices.set(result.value.uuid,result.value);
const registry={devices:[...devices.values()],discoveredAt:new Date().toISOString()};
await writeFile(file+'.tmp',JSON.stringify(registry,null,2)+'\n',{mode:0o600});await rename(file+'.tmp',file);
console.log(`WiiM discovery: ${results.filter(r=>r.status==='fulfilled').length} reachable, ${devices.size} remembered`);
