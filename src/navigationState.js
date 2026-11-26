export const primarySurfaceKeys = ['home', 'library', 'search', 'sonic', 'settings', 'listenbrainz'];
export const libraryBrowseKeys = ['artists', 'albums', 'playlists', 'genres'];
export const albumSortKeys = ['alphabeticalByName', 'alphabeticalByArtist', 'newest', 'recent', 'frequent'];

export const defaultNavigationState = {
  activeTab: 'home',
  libraryKey: '',
  libraryBrowseKey: 'albums',
  libraryAlbumSort: 'alphabeticalByName'
};

const albumSortPreferenceKey = 'libraryAlbumSort.v1';

// Callers provide verified account/server-scoped storage, never global storage.
export function readAlbumSortPreference(storage) {
  try {
    const value = storage?.getItem(albumSortPreferenceKey);
    if (albumSortKeys.includes(value)) return value;
  } catch { /* A storage failure must not prevent browsing. */ }
  return defaultNavigationState.libraryAlbumSort;
}

export function saveAlbumSortPreference(storage, value) {
  if (!albumSortKeys.includes(value)) return false;
  try {
    if (!storage) return false;
    storage.setItem(albumSortPreferenceKey, value);
    return true;
  } catch { return false; }
}

export function parseNavigationState(urlLike, storage) {
  const url = new URL(urlLike, 'http://navimuse.local/');
  const view = url.searchParams.get('view') || url.searchParams.get('tab') || defaultNavigationState.activeTab;
  const browse = url.searchParams.get('browse') || defaultNavigationState.libraryBrowseKey;
  const albumSort = url.searchParams.get('albumSort') || readAlbumSortPreference(storage);

  return {
    activeTab: primarySurfaceKeys.includes(view) ? view : defaultNavigationState.activeTab,
    libraryKey: url.searchParams.get('library') || defaultNavigationState.libraryKey,
    libraryBrowseKey: libraryBrowseKeys.includes(browse) ? browse : defaultNavigationState.libraryBrowseKey,
    libraryAlbumSort: albumSortKeys.includes(albumSort) ? albumSort : defaultNavigationState.libraryAlbumSort
  };
}

export function navigationUrl(urlLike, state = defaultNavigationState) {
  const url = new URL(urlLike, 'http://navimuse.local/');
  const activeTab = primarySurfaceKeys.includes(state.activeTab) ? state.activeTab : defaultNavigationState.activeTab;
  const libraryBrowseKey = libraryBrowseKeys.includes(state.libraryBrowseKey) ? state.libraryBrowseKey : defaultNavigationState.libraryBrowseKey;
  const libraryAlbumSort = albumSortKeys.includes(state.libraryAlbumSort) ? state.libraryAlbumSort : defaultNavigationState.libraryAlbumSort;

  url.searchParams.set('view', activeTab);
  url.searchParams.delete('tab');

  if (state.libraryKey) {
    url.searchParams.set('library', state.libraryKey);
  } else {
    url.searchParams.delete('library');
  }

  if (activeTab === 'library' && libraryBrowseKey !== defaultNavigationState.libraryBrowseKey) {
    url.searchParams.set('browse', libraryBrowseKey);
  } else {
    url.searchParams.delete('browse');
  }

  if (activeTab === 'library' && libraryAlbumSort !== defaultNavigationState.libraryAlbumSort) {
    url.searchParams.set('albumSort', libraryAlbumSort);
  } else {
    url.searchParams.delete('albumSort');
  }

  return url;
}

export function readBrowserNavigationState(storage) {
  if (typeof window === 'undefined') return defaultNavigationState;
  return parseNavigationState(window.location.href, storage);
}
