import assert from 'node:assert/strict';
import test from 'node:test';

import {
  artistRadioSeedsFromAlbums,
  findSmartPlaylist,
  flattenStats,
  isSomaFmStation,
  isCurrentDiscoveryRequest,
  normalizeDiscoveryLabel,
  radioActionKind,
  radioCards,
  safeHttpUrl,
  scopedDiscoveryPath,
  sonicArtistRadioMessage,
  smartPlaylistCards,
  waveformAmplitudesFromPeaks
} from '../src/discovery.js';

test('discovery label normalization is stable for matching', () => {
  assert.equal(normalizeDiscoveryLabel('High-Rated Forgotten Decades!'), 'high rated forgotten decades');
  assert.equal(normalizeDiscoveryLabel('  Deep   Cuts  '), 'deep cuts');
});

test('findSmartPlaylist uses exact normalized aliases instead of broad substring matching', () => {
  const deepCuts = smartPlaylistCards.find((card) => card.label === 'Deep Cuts');
  const loved = smartPlaylistCards.find((card) => card.label === 'Loved, Not Recent');
  const playlists = [
    { id: 'wrong-1', name: 'Not So Deep Cuts' },
    { id: 'wrong-2', name: 'Deep Cuts Radio' },
    { id: 'right', name: 'Deep Cuts From Frequent Artists' }
  ];

  assert.equal(findSmartPlaylist(playlists, deepCuts).id, 'right');
  assert.equal(findSmartPlaylist([{ id: 'wrong', name: 'Deep Cuts Radio' }], deepCuts), null);
  assert.equal(findSmartPlaylist([{ id: 'loved', name: 'Loved, Not Played Recently' }], loved).id, 'loved');
});

test('artistRadioSeedsFromAlbums prefers frequent albums and dedupes artists', () => {
  const seeds = artistRadioSeedsFromAlbums([
    { id: 'a1', title: 'First Frequent', artist: 'Pink Floyd', artistId: 'artist-pink', coverArt: 'pink', artwork: '/cover/pink', playCount: 20 },
    { id: 'a2', title: 'Second Frequent', artist: 'Pink Floyd', coverArt: 'pink-2', playCount: 12 },
    { id: 'a3', title: 'Another Frequent', albumArtist: 'Radiohead', albumArtistId: 'artist-radiohead', coverArt: 'radiohead' }
  ], [
    { id: 'fallback-1', title: 'Fallback One', artist: 'Cole Chaney' },
    { id: 'fallback-2', title: 'Fallback Two', artist: 'Radiohead' }
  ], 3);

  assert.deepEqual(seeds.map((seed) => seed.artist), ['Pink Floyd', 'Radiohead', 'Cole Chaney']);
  assert.equal(seeds[0].id, 'artist-journey-artist-pink');
  assert.equal(seeds[0].artistId, 'artist-pink');
  assert.equal(seeds[0].title, 'Pink Floyd Journey');
  assert.equal(seeds[0].subtitle, 'Pink Floyd + similar artists');
  assert.equal(seeds[0].coverArt, 'ar-artist-pink');
  assert.equal(seeds[0].artwork, undefined);
  assert.equal(seeds[1].coverArt, 'ar-artist-radiohead');
  assert.equal(seeds[2].coverArt, null);
  assert.equal(seeds[1].artistId, 'artist-radiohead');
  assert.equal(seeds[1].albumTitle, 'Another Frequent');
  assert.equal(seeds[2].id, 'artist-journey-cole chaney');
  assert.equal(seeds[2].artistId, '');
});

test('radioActionKind maps every Sonic radio card explicitly', () => {
  assert.deepEqual(radioCards.map((label) => [label, radioActionKind(label)]), [
    ['Track Journey', 'song'],
    ['Artist Journey', 'artist'],
    ['Genre Journey', 'genre'],
    ['SOMA FM', 'soma']
  ]);
  assert.equal(radioActionKind('Future Radio'), 'unknown');
  assert.equal(radioActionKind('soma fm'), 'soma');
  assert.equal(radioActionKind('SomaFM'), 'soma');
  assert.equal(radioActionKind('track journey'), 'song');
  assert.equal(radioActionKind('genre journey'), 'genre');
  assert.equal(radioActionKind('artist journey'), 'artist');
  assert.equal(radioActionKind('song radio'), 'song');
  assert.equal(radioActionKind('genre radio'), 'genre');
  assert.equal(radioActionKind('artist radio'), 'artist');
});

test('isSomaFmStation prefers SOMA FM domains over broad substring matches', () => {
  assert.equal(isSomaFmStation({ name: 'Groove Salad', streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3' }), true);
  assert.equal(isSomaFmStation({ name: 'SomaFM Drone Zone' }), true);
  assert.equal(isSomaFmStation({ name: 'Somatic Experiments', streamUrl: 'https://radio.example/stream' }), false);
  assert.equal(isSomaFmStation({ name: 'SOMA Clone', streamUrl: 'not a url' }), false);
});

test('sonicArtistRadioMessage distinguishes fallback seeds from artist matches', () => {
  assert.equal(sonicArtistRadioMessage({
    hasSeedArtist: true,
    matchCount: 0,
    totalCount: 12,
    shownCount: 12
  }), 'No exact artist match found. Showing popular artists as seeds.');
  assert.equal(sonicArtistRadioMessage({
    hasSeedArtist: true,
    matchCount: 30,
    totalCount: 100,
    shownCount: 16
  }), 'Showing 16 of 30 artist seeds.');
  assert.equal(sonicArtistRadioMessage({
    hasSeedArtist: true,
    matchCount: 3,
    totalCount: 100,
    shownCount: 3
  }), 'Artist matches from Navidrome.');
  assert.equal(sonicArtistRadioMessage({
    hasSeedArtist: false,
    matchCount: 0,
    totalCount: 10,
    shownCount: 10
  }), 'Choose an artist as a Sonic seed.');
});

test('scopedDiscoveryPath adds musicFolderId without overwriting explicit scope', () => {
  assert.equal(
    scopedDiscoveryPath('/api/navidrome/search?q=prince', 'music', 'http://example.test/app'),
    '/api/navidrome/search?q=prince&musicFolderId=music'
  );
  assert.equal(
    scopedDiscoveryPath('/api/audiomuse/clap/stats', 'live', 'http://example.test'),
    '/api/audiomuse/clap/stats?musicFolderId=live'
  );
  assert.equal(
    scopedDiscoveryPath('/api/navidrome/search?q=jazz&musicFolderId=archive', 'music', 'http://example.test'),
    '/api/navidrome/search?q=jazz&musicFolderId=archive'
  );
  assert.equal(
    scopedDiscoveryPath('/api/navidrome/radios', '', 'http://example.test'),
    '/api/navidrome/radios'
  );
});

test('waveformAmplitudesFromPeaks converts AudioMuse min max pairs to percentages', () => {
  assert.deepEqual(waveformAmplitudesFromPeaks([-0.5, 0.25, -1.2, 0.1, 'bad', 0.4]), [50, 100, 40]);
  assert.deepEqual(waveformAmplitudesFromPeaks(null), []);
});

test('safeHttpUrl only allows http and https stream URLs', () => {
  assert.equal(safeHttpUrl('https://ice.somafm.com/groovesalad'), true);
  assert.equal(safeHttpUrl('http://ice.somafm.com/dronezone'), true);
  assert.equal(safeHttpUrl('https://fcradio.example/stream'), true);
  assert.equal(safeHttpUrl('https://fdancefm.example/stream'), true);
  assert.equal(safeHttpUrl('https://fe80radio.example/stream'), true);
  assert.equal(safeHttpUrl('javascript:alert(1)'), false);
  assert.equal(safeHttpUrl('ftp://example.test/radio'), false);
  assert.equal(safeHttpUrl('http://127.0.0.1/radio'), false);
  assert.equal(safeHttpUrl('http://192.168.1.10/radio'), false);
  assert.equal(safeHttpUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(safeHttpUrl('http://0.0.0.0/radio'), false);
  assert.equal(safeHttpUrl('http://[::]/radio'), false);
  assert.equal(safeHttpUrl('http://[0:0:0:0:0:0:0:0]/radio'), false);
  assert.equal(safeHttpUrl('http://[0:0:0:0:0:0:0:1]/radio'), false);
  assert.equal(safeHttpUrl('http://[::ffff:127.0.0.1]/radio'), false);
  assert.equal(safeHttpUrl('http://[::ffff:169.254.169.254]/latest/meta-data'), false);
  assert.equal(safeHttpUrl('http://[0:0:0:0:0:ffff:7f00:1]/radio'), false);
  assert.equal(safeHttpUrl('http://[0:0:0:0:0:ffff:a9fe:a9fe]/latest/meta-data'), false);
  assert.equal(safeHttpUrl('http://[2002:7f00:0001::]/radio'), false);
  assert.equal(safeHttpUrl('http://[2002:a9fe:a9fe::]/latest/meta-data'), false);
  assert.equal(safeHttpUrl('http://localhost:8000/radio'), false);
  assert.equal(safeHttpUrl('not a url'), false);
});

test('isCurrentDiscoveryRequest rejects stale async completions', () => {
  assert.equal(isCurrentDiscoveryRequest(3, 3), true);
  assert.equal(isCurrentDiscoveryRequest(4, 3), false);
});

test('flattenStats keeps primitive AudioMuse status values only', () => {
  assert.deepEqual(flattenStats({
    ok: true,
    clap: { analyzed: 42, nested: { model: 'laion-clap' } },
    ignored: ['array']
  }), {
    ok: true,
    'clap.analyzed': 42,
    'clap.nested.model': 'laion-clap'
  });
});
