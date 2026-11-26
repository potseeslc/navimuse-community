import dgram from 'node:dgram';
import https from 'node:https';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {xmlText,validateDevice} from './device.mjs';

export const privateAddress=ip=>isIP(ip)===4&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
export function advertisedWiiMAddress(message,source){
 if(!privateAddress(source)||message.length>16384)return null;
 const location=/^location:\s*(.+)$/im.exec(message)?.[1]?.trim();
 try{const url=new URL(location);return url.protocol==='http:'&&url.hostname===source&&url.port==='49152'&&url.pathname==='/description.xml'&&!url.username&&!url.password&&!url.search&&!url.hash?source:null;}catch{return null;}
}
export async function findRenderers({duration=3500}={}){
 const found=new Set();
 await Promise.all(Object.values(networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal&&privateAddress(i.address)).map(i=>new Promise(resolve=>{
  const socket=dgram.createSocket('udp4');let timer;
  const finish=()=>{clearTimeout(timer);try{socket.close();}catch{}resolve();};
  socket.on('error',finish);
  socket.on('message',(data,info)=>{const address=advertisedWiiMAddress(data.toString('utf8'),info.address);if(address&&found.size<16)found.add(address);});
  socket.bind(0,i.address,()=>{
   socket.setMulticastInterface(i.address);socket.setMulticastTTL(1);
   socket.send('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n',1900,'239.255.255.250');
   timer=setTimeout(finish,duration);
  });
 })));
 return [...found];
}
async function certificate(address){
 return new Promise((resolve,reject)=>{
  // First contact is scoped to a discovered private LAN WiiM. Subsequent
  // discovery must retain its certificate pin; transport always checks it.
  const req=https.request({hostname:address,port:443,path:'/httpapi.asp?command=getStatusEx',rejectUnauthorized:false,agent:false,signal:AbortSignal.timeout(3000)},res=>res.resume());
  req.on('socket',socket=>socket.on('secureConnect',()=>{const pin=socket.getPeerCertificate().fingerprint256;resolve(pin);req.destroy();}));
  req.on('error',reject);req.setTimeout(3000,()=>req.destroy(new Error('Discovery timeout')));req.end();
 });
}
export async function inspectDiscoveredSpeaker(address,previous=[],{fetchImpl=fetch,certificateFor=certificate}={}){
 if(!privateAddress(address))throw new Error('Not a local speaker');
 const response=await fetchImpl(`http://${address}:49152/description.xml`,{redirect:'error',signal:AbortSignal.timeout(3000)});
 if(!response.ok)throw new Error('Speaker description unavailable');
 const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>262144)throw new Error('Description too large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
 const uuid=xmlText(text,'UDN'),name=xmlText(text,'friendlyName');
 if(!/^uuid:[a-f0-9-]{16,64}$/i.test(uuid)||!/^WiiM\b/i.test(xmlText(text,'modelName'))||!name||name.length>128)throw new Error('Not a WiiM speaker');
 const pin=await certificateFor(address),saved=previous.find(d=>d.uuid===uuid);
 if(saved&&saved.certificateSha256!==pin)throw new Error('Speaker certificate changed');
 return validateDevice({id:saved?.id||'wiim-'+uuid.slice(5).replaceAll('-','').toLowerCase(),name,address,uuid,certificateSha256:pin});
}
