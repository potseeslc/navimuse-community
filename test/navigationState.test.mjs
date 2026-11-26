import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultNavigationState, navigationUrl, parseNavigationState } from '../src/navigationState.js';

test('parseNavigationState accepts deep-linked surface and library state', () => {
  assert.deepEqual(
    parseNavigationState('https://navimuse.test/?view=library&library=classical&browse=playlists&albumSort=recent&track=song-1'),
    {
      activeTab: 'library',
      libraryKey: 'classical',
      libraryBrowseKey: 'playlists',
      libraryAlbumSort: 'recent'
    }
  );
});

test('parseNavigationState falls back deterministically for unsupported state', () => {
  assert.deepEqual(
    parseNavigationState('https://navimuse.test/?view=admin&browse=songs&albumSort=random'),
    defaultNavigationState
  );
});

test('navigationUrl keeps Library-only state out of unrelated views without dropping track links', () => {
  const url = navigationUrl('https://navimuse.test/?track=song-1&tab=search', {
    activeTab: 'sonic',
    libraryKey: 'jazz',
    libraryBrowseKey: 'genres',
    libraryAlbumSort: 'newest'
  });

  assert.equal(url.searchParams.get('view'), 'sonic');
  assert.equal(url.searchParams.get('tab'), null);
  assert.equal(url.searchParams.get('library'), 'jazz');
  assert.equal(url.searchParams.get('browse'), null);
  assert.equal(url.searchParams.get('albumSort'), null);
  assert.equal(url.searchParams.get('track'), 'song-1');
});

test('navigationUrl serializes non-default browse and sort state on Library', () => {
  const url = navigationUrl('https://navimuse.test/?view=search', {
    activeTab: 'library',
    libraryKey: 'jazz',
    libraryBrowseKey: 'genres',
    libraryAlbumSort: 'newest'
  });

  assert.equal(url.searchParams.get('view'), 'library');
  assert.equal(url.searchParams.get('library'), 'jazz');
  assert.equal(url.searchParams.get('browse'), 'genres');
  assert.equal(url.searchParams.get('albumSort'), 'newest');
});

test('navigationUrl omits default secondary state for stable shareable URLs', () => {
  const url = navigationUrl('https://navimuse.test/?library=old&browse=genres&albumSort=recent', defaultNavigationState);

  assert.equal(url.searchParams.get('view'), 'home');
  assert.equal(url.searchParams.get('library'), null);
  assert.equal(url.searchParams.get('browse'), null);
  assert.equal(url.searchParams.get('albumSort'), null);
});

test('album sort survives a fresh launch without navigation query state', async () => {
  const {saveAlbumSortPreference} = await import('../src/navigationState.js');
  const values = new Map();
  const storage = {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  assert.equal(saveAlbumSortPreference(storage, 'newest'), true);
  assert.equal(parseNavigationState('https://navimuse.test/', storage).libraryAlbumSort, 'newest');
  assert.equal(parseNavigationState('https://navimuse.test/?albumSort=recent', storage).libraryAlbumSort, 'recent');
  // Opening a deep link does not replace the saved preference.
  assert.equal(parseNavigationState('https://navimuse.test/', storage).libraryAlbumSort, 'newest');
  saveAlbumSortPreference(storage, 'alphabeticalByName');
  assert.equal(parseNavigationState('https://navimuse.test/', storage).libraryAlbumSort, 'alphabeticalByName');
});

test('sort preferences reject invalid values and tolerate unavailable storage', async () => {
  const {saveAlbumSortPreference} = await import('../src/navigationState.js');
  const unavailable = {getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');}};
  assert.equal(saveAlbumSortPreference(unavailable, 'newest'), false);
  assert.equal(saveAlbumSortPreference({setItem(){assert.fail('invalid write');}}, 'random'), false);
  for (const storage of [undefined, unavailable, {getItem:()=> 'invalid'}]) {
    assert.equal(parseNavigationState('https://navimuse.test/', storage).libraryAlbumSort, 'alphabeticalByName');
  }
});

test('album sort does not cross verified account storage boundaries', async () => {
  const {createAccountStorage} = await import('../src/accountStorage.js');
  const {saveAlbumSortPreference} = await import('../src/navigationState.js');
  const values = new Map();
  const backing = {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const first = createAccountStorage(`queue-scope-v2:${'a'.repeat(64)}`, backing);
  const second = createAccountStorage(`queue-scope-v2:${'b'.repeat(64)}`, backing);
  saveAlbumSortPreference(first, 'newest');
  assert.equal(parseNavigationState('https://navimuse.test/', first).libraryAlbumSort, 'newest');
  assert.equal(parseNavigationState('https://navimuse.test/', second).libraryAlbumSort, 'alphabeticalByName');
});
