import test from 'node:test';
import assert from 'node:assert/strict';
import {createIcyDecoder,radioArtworkProxyPath} from '../server/icyMetadata.mjs';
test('radio artwork keeps a stable first-party cache key until the source image changes',()=>{
 const first=radioArtworkProxyPath('station 1','https://station.example/a.jpg');
 assert.match(first,/^\/api\/navidrome\/radios\/station%201\/artwork\?v=[a-f0-9]{16}$/);
 assert.equal(first,radioArtworkProxyPath('station 1','https://station.example/a.jpg'));
 assert.notEqual(first,radioArtworkProxyPath('station 1','https://station.example/b.jpg'));
 assert.equal(radioArtworkProxyPath('station 1',null),null);
 assert.equal(first.includes('station.example'),false);
});
test('ICY metadata is stripped at every possible network chunk boundary without changing audio',()=>{
 const text=Buffer.from("StreamTitle='Artist - Song';StreamUrl='https://example.com/cover.jpg';");
 const metadata=Buffer.alloc(Math.ceil(text.length/16)*16);text.copy(metadata);
 const input=Buffer.concat([Buffer.from('ABCD'),Buffer.from([metadata.length/16]),metadata,Buffer.from('EFGH'),Buffer.from([0]),Buffer.from('IJKL')]);
 for(let split=1;split<input.length;split++){
  const events=[];const decode=createIcyDecoder(4,e=>events.push(e));
  assert.equal(Buffer.concat([...decode(input.subarray(0,split)),...decode(input.subarray(split))]).toString(),'ABCDEFGHIJKL');
  assert.deepEqual(events,[{title:'Artist - Song',artwork:'https://example.com/cover.jpg'}]);
 }
 const events=[];const decode=createIcyDecoder(4,e=>events.push(e));
 assert.equal(Buffer.concat([...input].flatMap(byte=>decode(Buffer.from([byte])))).toString(),'ABCDEFGHIJKL');assert.equal(events.length,1);
});
test('ordinary streams are unchanged without a valid ICY interval',()=>{
 for(const interval of [0,NaN,-1,2**30])assert.equal(Buffer.concat(createIcyDecoder(interval,()=>assert.fail())(Buffer.from('music'))).toString(),'music');
});
