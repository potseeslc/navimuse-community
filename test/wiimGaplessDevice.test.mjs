import test from 'node:test';
import assert from 'node:assert/strict';
import {createWiiMDevice,xmlText} from '../server/wiim/device.mjs';
const configuration={id:'bedroom',address:'192.168.1.140',uuid:'uuid:test',certificateSha256:Array(32).fill('AB').join(':')};
test('next transport carries the same escaped DIDL as load and never sends Play',async()=>{
 const calls=[];const d=createWiiMDevice(configuration,{request:async(_,value)=>{calls.push(value);return '<ok/>';}});
 const media={song:{title:'A & B <live>',artist:'Artist',album:'Album',duration:100,contentType:'audio/flac'},uri:'http://192.168.1.242/media/audio',art:'http://192.168.1.242/media/art'};
 await d.load({...media,paused:true});await d.prepareNext(media);
 assert.deepEqual(calls.map(c=>c.action),['SetAVTransportURI','SetNextAVTransportURI']);
 assert.equal(xmlText(calls[0].body,'CurrentURIMetaData'),xmlText(calls[1].body,'NextURIMetaData'));
 assert.match(xmlText(calls[1].body,'NextURIMetaData'),/A &amp; B &lt;live&gt;/);
 await d.clearNext();assert.equal(xmlText(calls[2].body,'NextURI'),'');assert.equal(xmlText(calls[2].body,'NextURIMetaData'),'');
});
test('next-slot observation reads current and next URIs without changing playback',async()=>{
 const d=createWiiMDevice(configuration,{request:async(_,value)=>{assert.equal(value.action,'GetMediaInfo');return '<CurrentURI>one&amp;two</CurrentURI><NextURI>three</NextURI>';}});
 assert.deepEqual(await d.queuedMedia(),{uri:'one&two',nextUri:'three'});
});
