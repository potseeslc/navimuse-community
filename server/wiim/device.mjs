import {receiverDetails,receiverVolume} from './delivery.mjs';
import http from 'node:http';import https from 'node:https';import {isIP} from 'node:net';
import {PlaybackError} from '../../shared/wiim/contract.js';
const service='urn:schemas-upnp-org:service:AVTransport:1';
export const xmlEscape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function xmlText(xml,tag){
 if(typeof xml!=='string'||xml.length>262144||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new PlaybackError('Invalid speaker XML',502);
 return (xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`))?.[1]||'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):'';}).replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&amp;','&').trim();
}
export function validateDevice(d){if(!d||typeof d.id!=='string'||! /^[a-z0-9_-]{1,64}$/.test(d.id)||isIP(d.address)!==4||! /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(d.address)||! /^([A-F\d]{2}:){31}[A-F\d]{2}$/.test(d.certificateSha256)||typeof d.uuid!=='string'||!d.uuid)throw new PlaybackError('Invalid approved WiiM configuration');return {...d};}
export function deviceRequest(device,{path,body,action,secure=false}={}){
 const d=validateDevice(device);if(!path||!path.startsWith('/')||path.startsWith('//'))throw new PlaybackError('Invalid device path');
 return new Promise((resolve,reject)=>{
  const req=(secure?https:http).request({hostname:d.address,port:secure?443:49152,path,method:body?'POST':'GET',agent:false,signal:AbortSignal.timeout(4000),...(secure?{rejectUnauthorized:false}:{}),headers:body?{'Content-Type':'text/xml; charset="utf-8"',SOAPAction:`"${service}#${action}"`}:{}},res=>{
   let size=0;const chunks=[];res.on('data',c=>{size+=c.length;if(size>262144)return res.destroy(new Error('Speaker response too large'));chunks.push(c);});res.on('error',reject);res.on('end',()=>res.statusCode===200?resolve(Buffer.concat(chunks).toString('utf8')):reject(new PlaybackError('Speaker request failed',502)));
  });
  if(secure)req.on('socket',s=>s.on('secureConnect',()=>{if(s.getPeerCertificate().fingerprint256!==d.certificateSha256)req.destroy(new Error('Speaker certificate changed'));}));
  req.setTimeout(4000,()=>req.destroy(new Error('Speaker request timed out')));req.on('error',cause=>{const error=new PlaybackError('Speaker unavailable or certificate changed',502);error.code=cause.code||cause.name;reject(error);});req.end(body);
 });
}
const seconds=s=>{const p=s.split(':').map(Number);return p.length===3&&p.every(Number.isFinite)?p[0]*3600+p[1]*60+p[2]:0;};
const clock=s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(Math.floor(s)%60).padStart(2,'0')}`;
const mediaMetadata=({song,uri,art})=>`<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="navimuse" parentID="0" restricted="1"><dc:title>${xmlEscape(song.title)}</dc:title><upnp:artist>${xmlEscape(song.artist)}</upnp:artist><upnp:album>${xmlEscape(song.album)}</upnp:album><upnp:class>object.item.audioItem.${song.isRadio===true?'audioBroadcast':'musicTrack'}</upnp:class><upnp:albumArtURI>${xmlEscape(art)}</upnp:albumArtURI><res protocolInfo="http-get:*:${xmlEscape(song.contentType||'audio/mpeg')}:*"${song.isRadio===true?'':` duration="${clock(song.duration||0)}"`}>${xmlEscape(uri)}</res></item></DIDL-Lite>`;
export function createWiiMDevice(configuration,{request=deviceRequest}={}){
 const device=validateDevice(configuration);
 async function soap(action,args={}){if(!['GetTransportInfo','GetPositionInfo','SetAVTransportURI','SetNextAVTransportURI','GetMediaInfo','Play','Pause','Stop','Seek'].includes(action))throw new PlaybackError('Invalid speaker command');return request(device,{path:'/upnp/control/rendertransport1',action,body:`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${action} xmlns:u="${service}"><InstanceID>0</InstanceID>${Object.entries(args).map(([k,v])=>`<${k}>${xmlEscape(v)}</${k}>`).join('')}</u:${action}></s:Body></s:Envelope>`});}
 async function api(command){return JSON.parse(await request(device,{path:'/httpapi.asp?command='+encodeURIComponent(command),secure:true}));}
 return {
  configuration:device,
  async topology(){const xml=await request(device,{path:'/description.xml'});if(xmlText(xml,'UDN')!==device.uuid||! /WiiM/i.test(xmlText(xml,'modelName')))throw new PlaybackError('Speaker identity changed',409);const [status,group]=await Promise.all([api('getStatusEx'),api('multiroom:getSlaveList')]);return {id:device.id,address:device.address,name:xmlText(xml,'friendlyName'),uuid:device.uuid,model:xmlText(xml,'modelName'),firmware:status.firmware,follower:String(status.group)==='1',members:(group.slave_list||[]).slice(0,16).map(m=>({id:String(m.uuid),name:String(m.name),address:String(m.ip)}))};},
  async observe(){const [t,p]=await Promise.all([soap('GetTransportInfo'),soap('GetPositionInfo')]);return {state:xmlText(t,'CurrentTransportState'),uri:xmlText(p,'TrackURI'),position:seconds(xmlText(p,'RelTime')),duration:seconds(xmlText(p,'TrackDuration')),at:Date.now()};},
  async queuedMedia(){const value=await soap('GetMediaInfo');return {uri:xmlText(value,'CurrentURI'),nextUri:xmlText(value,'NextURI')};},
  prepareNext:({song,uri,art})=>soap('SetNextAVTransportURI',{NextURI:uri,NextURIMetaData:mediaMetadata({song,uri,art})}),
  clearNext:()=>soap('SetNextAVTransportURI',{NextURI:'',NextURIMetaData:''}),
  async readVolume(){return receiverVolume(await api('getPlayerStatus'));},
  async delivery({uri,art}) {
   const [position,metadata]=await Promise.all([soap('GetPositionInfo'),api('getMetaInfo')]);
   return xmlText(position,'TrackURI')===uri?receiverDetails(metadata.metaData,art):null;
  },
  async load({song,uri,art,position=0,paused=false}){
   await soap('SetAVTransportURI',{CurrentURI:uri,CurrentURIMetaData:mediaMetadata({song,uri,art})});
   if(!paused){await soap('Play',{Speed:1});if(position>0)await soap('Seek',{Unit:'REL_TIME',Target:clock(position)});}
  },
  pause:()=>soap('Pause'),play:()=>soap('Play',{Speed:1}),stop:()=>soap('Stop'),seek:time=>soap('Seek',{Unit:'REL_TIME',Target:clock(Math.max(0,time))}),
  async volume(value){if(!Number.isInteger(value)||value<0||value>100)throw new PlaybackError('Volume must be 0–100');await request(device,{path:'/httpapi.asp?command='+encodeURIComponent('setPlayerCmd:vol:'+value),secure:true});},
 };
}
