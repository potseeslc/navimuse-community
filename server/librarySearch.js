import {libraryGenres} from './libraryDetailAlbums.js';

async function searchGenres(fetchNavidrome, musicFolderId, query) {
  const genres = [];
  let offset = 0;
  do {
    const result = await libraryGenres(fetchNavidrome, musicFolderId,
      new URLSearchParams({q:query, limit:'32', offset:String(offset)}));
    genres.push(...result.genres);
    offset = result.page?.nextOffset ?? null;
  } while (offset !== null && genres.length < 32);
  return {genres:genres.slice(0,32)};
}

export async function searchLibrary(fetchNavidrome, params) {
  const query = (params.get('q') || '').trim();
  const musicFolderId = params.get('musicFolderId') || '';
  if (query.length < 2) return {query, artists:[], albums:[], songs:[], genres:[]};
  const [result, genreResult] = await Promise.all([
    fetchNavidrome('/rest/search3.view', {
      query, artistCount:'8', albumCount:'12', songCount:'18',
      ...(musicFolderId ? {musicFolderId} : {})
    }),
    searchGenres(fetchNavidrome, musicFolderId, query)
      .catch(() => ({genres:[], unavailable:true}))
  ]);
  const search = result.searchResult3 || {};
  return {
    query, artists:search.artist || [], albums:search.album || [], songs:search.song || [],
    genres:genreResult.genres.slice(0,32), genresUnavailable:Boolean(genreResult.unavailable)
  };
}
