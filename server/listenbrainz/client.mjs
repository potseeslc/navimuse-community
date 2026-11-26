const ranges = new Set(['this_week','this_month','this_year','week','month','quarter','year','half_yearly','all_time']);
export class ListenBrainzError extends Error {
 constructor(message,status){super(message);this.status=status;}
}
// Read-only integration. Never submits listens or forwards NaviMuse credentials.
export function createListenBrainzClient({fetchImpl=fetch,timeoutMs=8000,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
 const user = value => {
  if(typeof value!=='string'||!value.trim()||['.','..'].includes(value.trim())||value.length>100||/[\x00-\x1f\x7f]/.test(value))throw new TypeError('Enter a ListenBrainz username');
  return encodeURIComponent(value.trim());
 };
 let tail=Promise.resolve(),nextAllowed=0,pending=0,failures=0;
 function get(path){
  if(pending>=50)return Promise.reject(new ListenBrainzError('ListenBrainz request queue is busy.',503));
  pending++;
  const result=tail.then(async()=>{
   const delay=nextAllowed-now();if(delay>0)await sleep(delay);
   nextAllowed=now()+1000;
   try{return await request(path);}catch(error){if(!error.status||error.status===429||error.status>=500){failures++;nextAllowed=Math.max(nextAllowed,now()+Math.min(300000,30000*2**(failures-1)));}throw error;}
  });
  tail=result.catch(()=>{});
  return result.finally(()=>{pending--;});
 }
 async function request(path){
  const response=await fetchImpl(`https://api.listenbrainz.org/1/${path}`,{
   headers:{accept:'application/json','user-agent':'NaviMuse/0.2.0 (https://navimuse.example.com)'},
   redirect:'error',signal:AbortSignal.timeout(timeoutMs)
  });
  const reset=Number(response.headers.get('x-ratelimit-reset-in'));
  if((response.status===429||response.headers.get('x-ratelimit-remaining')==='0')&&Number.isFinite(reset)&&reset>0)nextAllowed=Math.max(nextAllowed,now()+reset*1000);
  const remaining=Number(response.headers.get('x-ratelimit-remaining'));
  if(response.headers.has('x-ratelimit-remaining')&&remaining>0&&Number.isFinite(reset)&&reset>0)nextAllowed=Math.max(nextAllowed,now()+reset*1000/remaining);
  if(response.ok)failures=0;
  if(response.status===204)return {state:'pending',data:null};
  if(!response.ok)throw new ListenBrainzError(response.status===429?'ListenBrainz is busy. Try again later.':response.status===404?'ListenBrainz profile or playlist was not found.':'ListenBrainz is temporarily unavailable.',response.status);
  return {state:'ready',data:await boundedJson(response)};
 }
 return {
  stats(username,kind,range='this_month'){
   if(!['artists','recordings','release-groups','listening-activity'].includes(kind)||!ranges.has(range))throw new TypeError('Invalid listening statistics request');
   return get(`stats/user/${user(username)}/${kind}?range=${range}`);
  },
  recommendations:username=>get(`user/${user(username)}/playlists/recommendations`),
  listens:username=>get(`user/${user(username)}/listens?count=25`),
  playlist(id){
   if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new TypeError('Invalid ListenBrainz playlist');
   return get(`playlist/${id}`);
  }
 };
}

async function boundedJson(response){const reader=response.body?.getReader();if(!reader)throw new Error('Empty response');const chunks=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>2*1024*1024){await reader.cancel();throw new Error('Response too large');}chunks.push(Buffer.from(value));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{reader.releaseLock();}}
