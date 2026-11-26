import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaCodec,receiverDetails,receiverVolume} from '../server/wiim/delivery.mjs';
import {createWiiMDevice} from '../server/wiim/device.mjs';
const art='http://192.168.1.242:8099/media/wiim/'+'b'.repeat(32)+'/art.jpg';
test('receiver format is bounded, sanitized and tied to the current artwork grant',()=>{
 const meta={albumArtURI:art,'sampleRate ':'44100',bitDepth:'16',bitRate:'893',title:'private'};
 assert.deepEqual(receiverDetails(meta,art),{sampleRate:44100,bitDepth:16,estimatedBitRate:893000});
 assert.equal(receiverDetails({...meta,albumArtURI:art+'old'},art),null);
 assert.equal(receiverDetails({albumArtURI:art,sampleRate:-1,bitDepth:999,bitRate:'NaN'},art),null);
 assert.equal(mediaCodec('audio/flac; charset=binary'),'FLAC');
 assert.equal(mediaCodec('audio/mpeg'),'MP3');
 for(const mime of ['audio/mp4','audio/ogg','application/octet-stream','audio/unknown'])assert.equal(mediaCodec(mime),null);
});
test('speaker telemetry only reads metadata and rejects transport or track races',async()=>{
 let current='grant-uri',image=art;const calls=[];
 const device=createWiiMDevice({id:'living',address:'192.168.1.12',uuid:'uuid:123',certificateSha256:Array(32).fill('AB').join(':')},{request:async(_,request)=>{
 calls.push(request);return request.action?`<TrackURI>${current}</TrackURI>`:JSON.stringify({metaData:{albumArtURI:image,sampleRate:'48000',bitDepth:'24'}});
 }});
 assert.deepEqual(await device.delivery({uri:'grant-uri',art}),{sampleRate:48000,bitDepth:24});
 current='other';assert.equal(await device.delivery({uri:'grant-uri',art}),null);
 current='grant-uri';image='old-art';assert.equal(await device.delivery({uri:'grant-uri',art}),null);
 assert.ok(calls.every(c=>c.action==='GetPositionInfo'||c.path==='/httpapi.asp?command=getMetaInfo'&&c.secure));
});

test('initial receiver volume is a secure read and invalid levels stay unknown',async()=>{
 for(const [vol,expected] of [['0',0],['42',42],[100,100],['',null],[' ',null],[null,null],[true,null],[-1,null],[101,null],[12.5,null],['NaN',null]])assert.equal(receiverVolume({vol}),expected);
 const calls=[];const device=createWiiMDevice({id:'living',address:'192.168.1.12',uuid:'uuid:123',certificateSha256:Array(32).fill('AB').join(':')},{request:async(_,request)=>{calls.push(request);return JSON.stringify({vol:'37'});}});
 assert.equal(await device.readVolume(),37);assert.equal(calls.length,1);assert.equal(calls[0].path,'/httpapi.asp?command=getPlayerStatus');assert.equal(calls[0].secure,true);
});


test('radio DIDL identifies a broadcast without a finite duration while library metadata stays a track',async()=>{
 const calls=[];
 const device=createWiiMDevice({id:'living',address:'192.168.1.12',uuid:'uuid:123',certificateSha256:Array(32).fill('AB').join(':')},{request:async(_device,request)=>{calls.push(request);return '<ok/>';}});
 const song={title:'Station & One',artist:'Radio',album:'Internet Radio',duration:0,isRadio:true};
 await device.load({song,uri:'http://192.168.1.242:8099/media/wiim/'+ 'a'.repeat(32)+'/audio',art,paused:true});
 assert.equal(calls.length,1);assert.equal(calls[0].action,'SetAVTransportURI');
 assert.match(calls[0].body,/audioBroadcast/);assert.doesNotMatch(calls[0].body,/duration=/);assert.doesNotMatch(calls[0].body,/musicTrack/);
 calls.length=0;await device.load({song:{...song,isRadio:false,duration:123},uri:'library',art,paused:true});
 assert.match(calls[0].body,/musicTrack/);assert.match(calls[0].body,/00:02:03/);
});
