export const smartPlaylistCards = [
  { label: 'Loved, Not Recent', aliases: ['loved but not played recently', 'loved not played recently', 'loved not recent'] },
  { label: 'Forgotten Decades', aliases: ['high-rated forgotten decades', 'forgotten decades'] },
  { label: 'Unheard Favorites', aliases: ['unplayed tracks by favorite artists', 'unheard favorites'] },
  { label: 'Deep Cuts', aliases: ['deep cuts from frequent artists', 'deep cuts'] }
];

export const radioCards = ['Track Journey', 'Artist Journey', 'Genre Journey', 'SOMA FM'];
export const audioMuseCards = ['Long Builds', 'Quiet Intros', 'High Energy'];

export function artistRadioSeedsFromAlbums(primaryAlbums = [], fallbackAlbums = [], limit = 8) {
  const seeds = [];
  const seen = new Set();
  for (const album of [...primaryAlbums, ...fallbackAlbums]) {
    const artist = album?.artist || album?.albumArtist;
    const artistId = album?.artistId || album?.albumArtistId || '';
    const normalized = normalizeDiscoveryLabel(artist || '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    seeds.push({
      id: `artist-journey-${artistId || normalized}`,
      artist,
      artistId,
      title: `${artist} Journey`,
      subtitle: `${artist} + similar artists`,
      // Navidrome artist artwork uses ar- IDs; never reuse the seed album cover.
      coverArt: artistId ? `ar-${artistId}` : null,
      albumTitle: album?.title || album?.name || ''
    });
    if (seeds.length >= limit) break;
  }
  return seeds;
}

export function radioActionKind(label = '') {
  const normalized = normalizeDiscoveryLabel(label);
  if (normalized === 'soma fm' || normalized === 'somafm') return 'soma';
  if (normalized === 'genre journey' || normalized === 'genre radio') return 'genre';
  if (normalized === 'artist journey' || normalized === 'artist radio') return 'artist';
  if (normalized === 'track journey' || normalized === 'song radio') return 'song';
  return 'unknown';
}

export function isSomaFmStation(station = {}) {
  const urlValues = [station.streamUrl, station.homePageUrl].filter(Boolean);
  if (urlValues.some((value) => {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return host === 'somafm.com' || host.endsWith('.somafm.com');
    } catch (error) {
      return false;
    }
  })) {
    return true;
  }

  const name = normalizeDiscoveryLabel(station.name || '');
  return name.includes('soma fm') || name.includes('somafm');
}

export function sonicArtistRadioMessage({ hasSeedArtist = false, matchCount = 0, totalCount = 0, shownCount = 0 } = {}) {
  if (hasSeedArtist && matchCount === 0) {
    return 'No exact artist match found. Showing popular artists as seeds.';
  }
  if (shownCount < (matchCount || totalCount)) {
    return `Showing ${shownCount} of ${matchCount || totalCount} artist seeds.`;
  }
  return hasSeedArtist ? 'Artist matches from Navidrome.' : 'Choose an artist as a Sonic seed.';
}

export function scopedDiscoveryPath(path, libraryKey = '', origin = 'http://navimuse.local') {
  const url = new URL(path, origin);
  if (libraryKey && !url.searchParams.has('musicFolderId')) {
    url.searchParams.set('musicFolderId', libraryKey);
  }
  return `${url.pathname}${url.search}`;
}

export function waveformAmplitudesFromPeaks(peaks = []) {
  if (!Array.isArray(peaks)) return [];
  const values = [];
  for (let index = 0; index < peaks.length; index += 2) {
    const low = Number(peaks[index]);
    const high = Number(peaks[index + 1]);
    const amplitude = Math.max(
      Number.isFinite(low) ? Math.abs(low) : 0,
      Number.isFinite(high) ? Math.abs(high) : 0
    );
    values.push(Math.max(0, Math.min(100, amplitude * 100)));
  }
  return values.filter((value) => Number.isFinite(value));
}

export function normalizeDiscoveryLabel(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findSmartPlaylist(playlists = [], card) {
  const aliases = new Set((card?.aliases || []).map(normalizeDiscoveryLabel));
  return playlists.find((playlist) => aliases.has(normalizeDiscoveryLabel(playlist.name || playlist.title || ''))) || null;
}

export function isCurrentDiscoveryRequest(currentRequestId, requestId) {
  return currentRequestId === requestId;
}

export function safeHttpUrl(value = '') {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !privateOrLocalHost(url.hostname);
  } catch (error) {
    return false;
  }
}

function privateOrLocalHost(hostname = '') {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;

  const ipv6 = ipv6Words(host);
  if (ipv6) return privateIpv6(ipv6);

  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

function privateIpv6(words) {
  const allLeadingZero = words.slice(0, 7).every((word) => word === 0);
  if (words.every((word) => word === 0) || (allLeadingZero && words[7] === 1)) return true;
  if ((words[0] & 0xfe00) === 0xfc00) return true;
  if ((words[0] & 0xffc0) === 0xfe80) return true;

  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return privateOrLocalHost(ipv4FromWords(words[6], words[7]));
  }

  if (words[0] === 0x2002) {
    return privateOrLocalHost(ipv4FromWords(words[1], words[2]));
  }

  return false;
}

function ipv4FromWords(high, low) {
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff
  ].join('.');
}

function ipv6Words(host) {
  if (!host.includes(':')) return null;
  const [address] = host.split('%');
  const dottedMatch = address.match(/(^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  let normalized = address;
  if (dottedMatch) {
    const octets = dottedMatch[2].split('.').map((part) => Number(part));
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    normalized = `${address.slice(0, dottedMatch.index + dottedMatch[1].length)}${replacement}`;
  }

  if ((normalized.match(/::/g) || []).length > 1) return null;
  const [leftText, rightText = ''] = normalized.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  if (!normalized.includes('::') && left.length !== 8) return null;

  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8) return null;

  const words = groups.map((group) => /^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : Number.NaN);
  return words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff) ? null : words;
}

export function flattenStats(value, prefix = '') {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value).reduce((stats, [key, entry]) => {
    const label = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return { ...stats, ...flattenStats(entry, label) };
    }
    if (['string', 'number', 'boolean'].includes(typeof entry)) {
      stats[label] = entry;
    }
    return stats;
  }, {});
}
