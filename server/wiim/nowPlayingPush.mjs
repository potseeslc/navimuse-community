import {connect} from 'node:http2';
import {createPrivateKey,sign} from 'node:crypto';

export function createNowPlayingAPNs({key,keyID,teamID,environment='production',now=Date.now}) {
 if(!/^[A-Z0-9]{10}$/.test(keyID)||!/^[A-Z0-9]{10}$/.test(teamID)||!['production','sandbox'].includes(environment))throw Error('Invalid APNs configuration');
 const privateKey=createPrivateKey(key);if(privateKey.asymmetricKeyType!=='ec'||privateKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('APNs requires an ES256 key');
 const origin=environment==='production'?'https://api.push.apple.com':'https://api.sandbox.push.apple.com';let jwt,issued=0;
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 function authorization(){if(!jwt||now()-issued>40*60000){issued=now();const content=encode({alg:'ES256',kid:keyID})+'.'+encode({iss:teamID,iat:Math.floor(issued/1000)});jwt=content+'.'+sign('sha256',Buffer.from(content),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');}return jwt;}
 return async function send(token,payload){
  if(!/^([a-f0-9]{2}){16,256}$/.test(token))throw Error('Invalid APNs token');const body=JSON.stringify(payload);if(Buffer.byteLength(body)>4096)throw Error('APNs payload exceeds limit');
  return new Promise((resolve,reject)=>{
   const client=connect(origin);let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);client.destroy();error?reject(error):resolve(value);};
   const timer=setTimeout(()=>finish(Error('APNs timed out')),8000);client.on('error',error=>finish(error));
   const req=client.request({':method':'POST',':path':'/3/device/'+token,authorization:'bearer '+authorization(),'apns-topic':'com.developer.navimuse.push-type.nowplaying','apns-push-type':'nowplaying','apns-priority':'5','apns-expiration':String(Math.floor(now()/1000)+60)});
   let status=0,data='';req.on('response',headers=>{status=Number(headers[':status']);});req.on('data',chunk=>{data+=chunk;if(data.length>8192)finish(Error('APNs response too large'));});req.on('error',error=>finish(error));req.on('end',()=>{let reason;try{reason=JSON.parse(data).reason;}catch{}finish(null,{ok:status===200,invalidToken:status===410||['BadDeviceToken','DeviceTokenNotForTopic','Unregistered'].includes(reason),retryAfter:status===429?60000:15000});});req.end(body);
  });
 };
}

// Runs independently of WebKit. Polls the authoritative projection, never the
// physical speaker. Coalesces position-only observations to one update/minute.
export function startNowPlayingDelivery({service,send,now=Date.now,interval=5000}) {
 const sent=new Map(),retry=new Map();let pending,closed=false;
 const tick=()=>{
  if(closed)return Promise.resolve();if(pending)return pending;
  pending=(async()=>{
   const items=await service.deliveries();const keys=new Set(items.map(x=>x.key));for(const key of sent.keys())if(!keys.has(key))sent.delete(key);for(const key of retry.keys())if(!keys.has(key))retry.delete(key);
   for(let item of items){
    if(closed)break;
    if(service.deliveryFor){item=await service.deliveryFor(item.key,item.pushToken);if(!item)continue;}if(item.publication.kind==='retain'||(retry.get(item.key)||0)>now())continue;
    const end=item.publication.kind==='end',attrs=end?{id:item.sessionID}:item.publication.attributes;
    const fingerprint=JSON.stringify({token:item.pushToken,...attrs,timestamp:undefined,elapsedTime:undefined});const prior=sent.get(item.key);
    if(!end&&prior?.fingerprint===fingerprint&&now()-prior.at<60000)continue;
    try{const result=await send(item.pushToken,{aps:{event:end?'end':'update',timestamp:Math.floor(now()/1000),attributes:attrs}});
     if(result.ok){sent.set(item.key,{fingerprint,at:now()});retry.delete(item.key);if(end)await service.removePush(item.key);}
     else if(result.invalidToken)await service.removePush(item.key);else retry.set(item.key,now()+(result.retryAfter||15000));
    }catch{retry.set(item.key,now()+15000);}
   }
  })().finally(()=>{pending=null;});return pending;
 };
 const timer=setInterval(()=>{void tick().catch(()=>{});},interval);timer.unref();
 return {tick,close:async()=>{closed=true;clearInterval(timer);await pending;}};
}
