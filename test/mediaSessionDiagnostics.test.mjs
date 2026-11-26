import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMediaSessionActions, mediaSessionDiagnosticSnapshot } from '../src/mediaSession.js';

test('system diagnostic distinguishes rejected registration and received commands without recording media details', () => {
 const callbacks=new Map();const event={seekTime:42};let delivered;
 const media={playbackState:'playing',metadata:{title:'PRIVATE TITLE',artwork:[{src:'https://private.invalid/secret'}]},setActionHandler:(action,handler)=>{if(action==='previoustrack')throw new Error('PRIVATE ERROR');callbacks.set(action,handler);}};
 const cleanup=bindMediaSessionActions(media,{nexttrack:e=>{delivered=e;},previoustrack:()=>{},seekto:()=>{}});
 const first=mediaSessionDiagnosticSnapshot(media);
 assert.equal(first.actions.previoustrack,'rejected');assert.equal(first.actions.nexttrack,'accepted');assert.equal(first.actions.seekforward,'cleared');
 assert.equal(first.artworkPresent,true);assert.equal(first.metadataPresent,true);
 callbacks.get('nexttrack')(event);assert.equal(delivered,event);
 const snapshot=mediaSessionDiagnosticSnapshot(media);assert.equal(snapshot.lastAction,'nexttrack');assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE|private|secret|seekTime/);
 snapshot.actions.nexttrack='tampered';assert.equal(mediaSessionDiagnosticSnapshot(media).actions.nexttrack,'accepted');
 cleanup();assert.equal(mediaSessionDiagnosticSnapshot(media).actions.nexttrack,'cleared');assert.equal(mediaSessionDiagnosticSnapshot(null).available,false);
});
