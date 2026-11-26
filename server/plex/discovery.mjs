// Plex GDM advertises identities only; playback stays authenticated by the BFF.
import {createSocket} from 'node:dgram';
import {localAddress} from './source.mjs';
export function plexDiscoveryPackets(xml,port){
 if(typeof xml!=='string'||xml.length>65536||!Number.isInteger(port)||port<1024||port>65535)return [];
 const decode=s=>s.replace(/&(amp|quot|lt|gt|apos);/g,(_,e)=>({amp:'&',quot:'"',lt:'<',gt:'>',apos:"'"}[e])).replace(/[^\x20-\x7e]/g,' ').slice(0,120);
 return [...xml.matchAll(/<Player\s+([^>]+)\/>/g)].slice(0,16).flatMap(([,attrs])=>{
  const id=/\bmachineIdentifier="([a-zA-Z0-9_-]{8,100})"/.exec(attrs)?.[1],name=/\btitle="([^"]{1,720})"/.exec(attrs)?.[1];
  if(!id||!name)return [];
  return [Buffer.from(['HTTP/1.0 200 OK','Content-Type: plex/media-player',`Port: ${port}`,'Protocol: plex',`Resource-Identifier: ${id}`,`Name: ${decode(name)}`,'Version: 0.2.0','Product: NaviMuse','Protocol-Version: 1','Protocol-Capabilities: timeline,playback,playqueues','Device-Class: stb','',''].join('\r\n'))];
 });
}
export function startPlexDiscovery({port,host='127.0.0.1',fetchImpl=fetch,socket=createSocket({type:'udp4',reuseAddr:true}),logger=console}){
 if(!localAddress(host)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid Plex receiver discovery port');
 let packets=[],updated=0,busy=false,closed=false;const peers=new Map();
 const refresh=async()=>{if(busy||closed)return;busy=true;try{
  const r=await fetchImpl(`http://${host}:${port}/resources`,{redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error('Unavailable');let body='',size=0;
  for await(const chunk of r.body){size+=chunk.length;if(size>65536)throw Error('Oversized');body+=Buffer.from(chunk).toString();}
  if(!closed){packets=plexDiscoveryPackets(body,port);updated=Date.now();}
 }catch{packets=[];}finally{busy=false;}};
 socket.on('message',(message,peer)=>{
  if(closed||!localAddress(peer.address)||message.length>1024||!/^M-SEARCH \* HTTP\/1\.[01]\r?\n/.test(message.toString())||Date.now()-updated>90000)return;
  const last=peers.get(peer.address)||0;if(Date.now()-last<1000)return;
  if(peers.size>=128)peers.delete(peers.keys().next().value);peers.set(peer.address,Date.now());
  for(const packet of packets)socket.send(packet,peer.port,peer.address,()=>{});
 });
 socket.on('error',()=>logger.error('Plex LAN discovery unavailable'));
 socket.bind(32412,'0.0.0.0',()=>{logger.log('Plex LAN discovery ready');void refresh();});
 const timer=setInterval(refresh,20000);timer.unref();
 return {close:()=>{closed=true;clearInterval(timer);try{socket.close();}catch{}},refresh};
}
