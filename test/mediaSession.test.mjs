import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindMediaSessionActions,
  buildMediaSessionMetadata,
  createMediaSessionMetadata,
  mediaSessionPlaybackState,
  mediaSessionPositionState,
  supportedMediaSessionActions
} from '../src/mediaSession.js';

test('buildMediaSessionMetadata maps nowPlaying to MediaSession metadata', () => {
  const nowPlaying = {
    id: 'song-1',
    title: 'Yesterday',
    artist: 'The Beatles',
    album: 'Help!',
    artwork: '/artwork/123.jpg'
  };
  assert.deepEqual(buildMediaSessionMetadata(nowPlaying), {
    title: 'Yesterday',
    artist: 'The Beatles',
    album: 'Help!',
    artwork: [{ src: '/artwork/123.jpg' }]
  });
});

test('buildMediaSessionMetadata handles missing fields gracefully', () => {
  assert.deepEqual(buildMediaSessionMetadata({ id: 'a' }), {
    title: 'Unknown Track',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    artwork: []
  });
});

test('createMediaSessionMetadata constructs the native value required by MediaSession', () => {
  class FakeMediaMetadata {
    constructor(init) { this.init = init; }
  }
  const result = createMediaSessionMetadata({
    id: 'song-1', title: 'Yesterday', artist: 'The Beatles', album: 'Help!', artwork: '/artwork/123.jpg'
  }, FakeMediaMetadata);
  assert.ok(result instanceof FakeMediaMetadata);
  assert.deepEqual(result.init.artwork, [{ src: '/artwork/123.jpg' }]);
  assert.equal(createMediaSessionMetadata(null, FakeMediaMetadata), null);
  assert.equal(createMediaSessionMetadata({ id: 'song-1' }, undefined), null);
});

test('buildMediaSessionMetadata returns null for no track', () => {
  assert.equal(buildMediaSessionMetadata(null), null);
  assert.equal(buildMediaSessionMetadata({}), null);
  assert.equal(buildMediaSessionMetadata({ title: 'No ID' }), null);
});

test('mediaSessionPlaybackState maps internal state to MediaSession string', () => {
  assert.equal(mediaSessionPlaybackState(true, { id: 'a' }), 'playing');
  assert.equal(mediaSessionPlaybackState(false, { id: 'a' }), 'paused');
  assert.equal(mediaSessionPlaybackState(false, null), 'none');
  assert.equal(mediaSessionPlaybackState(true, null), 'none');
});

test('supportedMediaSessionActions returns all NaviMuse-supported actions', () => {
  const actions = supportedMediaSessionActions();
  assert.ok(actions.includes('play'));
  assert.ok(actions.includes('pause'));
  assert.ok(actions.includes('previoustrack'));
  assert.ok(actions.includes('nexttrack'));
  assert.ok(!actions.includes('seekbackward'));
  assert.ok(!actions.includes('seekforward'));
  assert.ok(actions.includes('seekto'));
  assert.ok(actions.includes('stop'));
  assert.equal(actions.length, 6);
});

test('mediaSessionPositionState clamps valid positions and rejects unknown duration', () => {
  assert.deepEqual(mediaSessionPositionState({ currentTime: 12, duration: 10 }, { id: 'a' }), {
    duration: 10, position: 10, playbackRate: 1
  });
  assert.equal(mediaSessionPositionState({ currentTime: 2, duration: 0 }, { id: 'a' }), null);
});

test('system track actions stay wired while interval actions are cleared, including cleanup', () => {
  const registered=new Map(); let next=0,previous=0,seek=null;
  const dispose=bindMediaSessionActions({setActionHandler:(name,handler)=>registered.set(name,handler)}, {nexttrack:()=>next++,previoustrack:()=>previous++,seekto:event=>seek=event.seekTime});
  assert.equal(registered.get('seekbackward'),null); assert.equal(registered.get('seekforward'),null);
  registered.get('nexttrack')(); registered.get('previoustrack')(); registered.get('seekto')({seekTime:42});
  assert.deepEqual([next,previous,seek],[1,1,42]); dispose(); assert([...registered.values()].every(value=>value===null));
});
