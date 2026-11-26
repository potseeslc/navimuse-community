// One bounded snapshot per verified account storage adapter. Library selection
// must match exactly; never use unscoped browser storage or treat cache as auth.
const KEY = 'navimuse.home.snapshot.v1';
const MAX_BYTES = 200000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const shelves = ['newestAlbums', 'recentAlbums', 'randomAlbums', 'frequentAlbums'];
const fields = ['id', 'name', 'title', 'artist', 'artistId', 'coverArt', 'year', 'songCount', 'duration', 'created', 'genre'];
function payloadSnapshot(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const result = { musicFolders: [], recentAlbumsUnavailable: Boolean(payload.recentAlbumsUnavailable) };
  for (const key of shelves) {
    if (!Array.isArray(payload[key])) return null;
    result[key] = payload[key].slice(0, 30).filter(album => album && typeof album.id === 'string').map(album => Object.fromEntries(fields.filter(field => typeof album[field] === 'string' && album[field].length <= 1024 || typeof album[field] === 'number' && Number.isFinite(album[field])).map(field => [field, album[field]])));
  }
  result.musicFolders = (Array.isArray(payload.musicFolders) ? payload.musicFolders : []).slice(0, 100).filter(folder => folder && ['string', 'number'].includes(typeof folder.id) && typeof folder.name === 'string').map(folder => ({id: String(folder.id).slice(0, 128), name: folder.name.slice(0, 256)}));
  return result;
}
export function readHomeSnapshot(storage, libraryKey, now = Date.now()) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw || raw.length > MAX_BYTES) return null;
    const record = JSON.parse(raw);
    if (record.version !== 1 || record.libraryKey !== libraryKey || !Number.isFinite(record.savedAt) || now < record.savedAt || now - record.savedAt > MAX_AGE) return null;
    return payloadSnapshot(record.payload);
  } catch { return null; }
}
export function saveHomeSnapshot(storage, libraryKey, payload, now = Date.now()) {
  try {
    const snapshot = payloadSnapshot(payload);
    if (!snapshot || !storage) return false;
    const raw = JSON.stringify({version: 1, savedAt: now, libraryKey, payload: snapshot});
    if (raw.length > MAX_BYTES) return false;
    storage.setItem(KEY, raw);
    return true;
  } catch { return false; }
}
