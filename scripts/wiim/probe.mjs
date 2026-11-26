import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

export function approvedAddress(address) {
  if (isIP(address)!==4 || !(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address))) throw new Error('An explicit private IPv4 address is required');
  return address;
}
export function xmlValue(xml, name) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML declarations are not permitted');
  const value=xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] || '';
  return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim();
}
export function request(address, {port=49152,path='/description.xml',body,action,pin}={}) {
  approvedAddress(address);
  return new Promise((resolve,reject)=>{
    // Self-signed trust is scoped to this explicit device and exact observed certificate.
    const secure=Boolean(pin);
    const req=(secure?https:http).request({hostname:address,port,path,method:body?'POST':'GET',agent:false,
      ...(secure?{rejectUnauthorized:false}:{}),headers:body?{'Content-Type':'text/xml; charset="utf-8"',SOAPAction:`"urn:schemas-upnp-org:service:AVTransport:1#${action}"`}:{}},res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>262144){res.destroy(new Error('Device response too large'));return;}chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>{if(res.statusCode!==200)return reject(new Error(`Device HTTP ${res.statusCode}`));resolve(Buffer.concat(chunks).toString('utf8'));});
    });
    if(secure) req.on('socket',socket=>socket.on('secureConnect',()=>{if(socket.getPeerCertificate().fingerprint256!==pin)req.destroy(new Error('Device certificate changed'));}));
    req.setTimeout(4000,()=>req.destroy(new Error('Device request timed out')));req.on('error',reject);req.end(body);
  });
}
export function certificate(address){
  approvedAddress(address);
  return new Promise((resolve,reject)=>{const s=tls.connect({host:address,port:443,rejectUnauthorized:false},()=>{const pin=s.getPeerCertificate().fingerprint256;s.end();pin?resolve(pin):reject(new Error('No certificate'));});s.setTimeout(4000,()=>s.destroy(new Error('Certificate probe timed out')));s.on('error',reject);});
}
export async function transport(address,action){
  if(!['GetTransportInfo','GetPositionInfo'].includes(action))throw new Error('Read-only probe action required');
  const body=`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:${action}></s:Body></s:Envelope>`;
  return request(address,{path:'/upnp/control/rendertransport1',action,body});
}
export async function probe(address){
  const description=await request(address);
  if(!/WiiM/i.test(xmlValue(description,'modelName')))throw new Error('Device is not a WiiM');
  const pin=await certificate(address);
  const status=JSON.parse(await request(address,{port:443,path:'/httpapi.asp?command=getStatusEx',pin}));
  const group=JSON.parse(await request(address,{port:443,path:'/httpapi.asp?command=multiroom:getSlaveList',pin}));
  const playback=await transport(address,'GetTransportInfo');
  const position=await transport(address,'GetPositionInfo');
  return {address,name:xmlValue(description,'friendlyName'),model:xmlValue(description,'modelName'),uuid:xmlValue(description,'UDN'),firmware:status.firmware,groupRole:status.group,groupName:status.GroupName,
    members:(group.slave_list||[]).map(s=>({name:s.name,ip:s.ip,uuid:s.uuid})),certificateSha256:pin,
    transport:xmlValue(playback,'CurrentTransportState'),position:xmlValue(position,'RelTime'),duration:xmlValue(position,'TrackDuration'),hasTrackUri:Boolean(xmlValue(position,'TrackURI')),hasMetadata:Boolean(xmlValue(position,'TrackMetaData'))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await probe(process.argv[2]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
