import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the actual entrypoint helpers without booting the application's DOM.
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function canSyncTrackFeedback(songId)'),source.indexOf('function copyTextFallback(text)'));
test('real player feedback helpers sync radio and library tracks to separate services',async()=>{
 const calls=[];
 const {canSyncTrackFeedback,syncTrackFeedback}=runInNewContext(helpers+';({canSyncTrackFeedback,syncTrackFeedback})',{
  saveRadioFeedback:async(...args)=>{calls.push(['radio',...args]);return {feedback:{rating:4}};},
  navidromeFeedback:async(...args)=>{calls.push(['library',...args]);return {feedback:{rating:3}};},
 });
 assert.equal(canSyncTrackFeedback('radio:station-one'),true);
 assert.equal(canSyncTrackFeedback('library-song'),true);
 assert.equal(canSyncTrackFeedback('mock-one'),false);
 assert.equal(canSyncTrackFeedback(''),false);
 const signal=new AbortController().signal,feedback={favorite:true,rating:4};
 assert.equal((await syncTrackFeedback('radio:station-one',feedback,signal)).rating,4);
 assert.equal((await syncTrackFeedback('library-song',feedback,signal)).rating,3);
 assert.deepEqual(calls.map(c=>c[0]),['radio','library']);
 assert.equal(calls[0][1],'radio:station-one');
 assert.equal(calls[1][1],'library-song');
 for(const call of calls){assert.equal(call[2],feedback);assert.equal(call[3].signal,signal);}
});
