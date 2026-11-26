import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { createPasswordService, PASSWORD_HASH_OPTIONS } from '../server/passwordCredentials.mjs';

const require=createRequire(import.meta.url);
const service=await createPasswordService();
const delay=monitorEventLoopDelay({resolution:10});delay.enable();
const summarize=values=>({samples:values.length,minMs:Math.min(...values),medianMs:[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],maxMs:Math.max(...values)});
const hashes=[],checks=[];let credential;
for(let i=0;i<10;i++) {
  const start=performance.now();credential=await service.hashPassword('Synthetic benchmark passphrase only');hashes.push(performance.now()-start);
  const check=performance.now();if(!await service.verifyPassword(credential,'Synthetic benchmark passphrase only'))throw new Error('Benchmark verification failed');checks.push(performance.now()-check);
}
const start=performance.now();await Promise.all([service.verifyPassword(credential,'Synthetic benchmark passphrase only'),service.verifyPassword(null,'Synthetic benchmark passphrase only')]);
delay.disable();
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,argon2:require('argon2/package.json').version,parameters:PASSWORD_HASH_OPTIONS,hash:summarize(hashes),verify:summarize(checks),twoConcurrentMs:performance.now()-start,eventLoopP99Ms:delay.percentile(99)/1e6,maxRssKiB:process.resourceUsage().maxRSS},null,2));
