import test from 'node:test';
import assert from 'node:assert/strict';
import {advertisedWiiMAddress,inspectDiscoveredSpeaker} from '../server/wiim/discovery.mjs';
const ip='192.168.1.12',pin=Array(32).fill('AB').join(':');
test('discovery accepts only the responder’s private, fixed description endpoint',()=>{
 const advert=location=>`HTTP/1.1 200 OK\r\nLOCATION: ${location}\r\n`;
 assert.equal(advertisedWiiMAddress(advert(`http://${ip}:49152/description.xml`),ip),ip);
 for(const url of ['http://192.168.1.13:49152/description.xml',`http://user@${ip}:49152/description.xml`,`http://${ip}:49152/description.xml?url=other`,`http://${ip}:80/description.xml`,'https://example.com/description.xml'])assert.equal(advertisedWiiMAddress(advert(url),ip),null);
 assert.equal(advertisedWiiMAddress(advert('http://8.8.8.8:49152/description.xml'),'8.8.8.8'),null);
});
test('discovery keeps stable identity across address changes and rejects changed pins or non-WiiM devices',async()=>{
 let model='WiiM Pro Receiver';
 const options={fetchImpl:async()=>new Response(`<root><friendlyName>Kitchen</friendlyName><modelName>${model}</modelName><UDN>uuid:12345678-1234-1234-1234-123456789012</UDN></root>`),certificateFor:async()=>pin};
 const first=await inspectDiscoveredSpeaker(ip,[],options);
 const second=await inspectDiscoveredSpeaker('192.168.1.13',[{...first,id:'kitchen'}],options);
 assert.equal(second.id,'kitchen');assert.equal(second.address,'192.168.1.13');
 await assert.rejects(inspectDiscoveredSpeaker(ip,[{...first,certificateSha256:Array(32).fill('CD').join(':')}],options),/certificate changed/);
 model='Other speaker';await assert.rejects(inspectDiscoveredSpeaker(ip,[],options),/Not a WiiM/);
});
