const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value];

// getArtist is not music-folder scoped. Intersect its membership with a scoped
// album page, keeping the upstream cursor even when that page has no matches.
export async function libraryDetailAlbums(fetchNavidrome, params) {
  const artistId = params.get('artistId');
  const genre = params.get('genre');
  if ((!artistId && !genre) || (artistId && genre)) {
    const error = new Error('Choose one artist or genre.');
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
  const offset = Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0);
  const limit = Math.min(500, Math.max(1, Number.parseInt(params.get('limit') || '500', 10) || 500));
  const musicFolderId = params.get('musicFolderId');
  const folder = musicFolderId ? { musicFolderId } : {};
  let artistAlbums;
  if (artistId) {
    const result = await fetchNavidrome('/rest/getArtist.view', { id: artistId });
    artistAlbums = list(result.artist?.album);
    // Search cheaply proves positive folder membership. Only skip the scan when
    // every album from getArtist is present; incomplete search is never proof
    // that an album is outside this folder (compilations and aliases vary).
    let allInFolder = false;
    if (offset === 0 && musicFolderId && result.artist?.name && artistAlbums.length <= limit) {
      const matches = await fetchNavidrome('/rest/search3.view', {
        query: result.artist.name, musicFolderId, artistCount: '0', songCount: '0', albumCount: '500'
      }).catch(() => null);
      const ids = new Set(list(matches?.searchResult3?.album).map(album => String(album.id)));
      allInFolder = artistAlbums.length > 0 && artistAlbums.every(album => ids.has(String(album.id)));
    }
    if (!musicFolderId || allInFolder || !artistAlbums.length) {
      const albums = artistAlbums.slice(offset, offset + limit);
      return { albums, page: { offset, limit, nextOffset: offset + albums.length < artistAlbums.length ? offset + albums.length : null } };
    }
  }
  const result = await fetchNavidrome('/rest/getAlbumList2.view', {
    type: genre ? 'byGenre' : 'alphabeticalByName',
    ...(genre ? { genre } : {}),
    ...folder,
    offset: String(offset),
    size: String(limit)
  });
  const scanned = list(result.albumList2?.album);
  const membership = artistAlbums && new Set(artistAlbums.map((album) => String(album.id)));
  const albums = membership ? scanned.filter((album) => membership.has(String(album.id))) : scanned;
  return { albums, page: { offset, limit, nextOffset: scanned.length === limit ? offset + scanned.length : null } };
}

// getGenres returns global counts. Check membership with the same byGenre query
// used by details; never label global song/album counts as folder-local counts.
export async function libraryGenres(fetchNavidrome, musicFolderId, params = new URLSearchParams()) {
  const result = await fetchNavidrome('/rest/getGenres.view');
  const query = (params.get('q') || '').normalize('NFKC').toLowerCase().trim();
  const genres = list(result.genres?.genre).filter(genre => !query || String(genre.value || genre.name || '').normalize('NFKC').toLowerCase().includes(query));
  if (!musicFolderId) return { genres, page: null };
  const offset = Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0);
  const limit = Math.min(32, Math.max(1, Number.parseInt(params.get('limit') || '32', 10) || 32));
  const candidates = genres.slice(offset, offset + limit);
  const included = new Array(candidates.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
    while (next < candidates.length) {
      const index = next++;
      const value = candidates[index]?.value || candidates[index]?.name;
      if (!value) continue;
      const page = await fetchNavidrome('/rest/getAlbumList2.view', {
        type: 'byGenre', genre: value, musicFolderId, size: '1', offset: '0'
      });
      if (list(page.albumList2?.album).length) included[index] = { value, ...(list(page.albumList2?.album)[0]?.coverArt ? {coverArt:list(page.albumList2.album)[0].coverArt} : {}) };
    }
  }));
  return { genres: included.filter(Boolean), page: { offset, limit, nextOffset: offset + candidates.length < genres.length ? offset + candidates.length : null } };
}
