// Storage must already be scoped to the verified account/server by the caller.
const key = 'artistJourneyOpeners.v1';
const artistLimit = 64;
const openerLimit = 8;

export function createArtistOpenerHistory(storage, random = Math.random) {
  let memory = [];
  let storageFailed = false;
  function read() {
    try {
      const raw = storageFailed ? null : storage?.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) memory = parsed.filter(entry =>
          Array.isArray(entry) && typeof entry[0] === 'string' && Array.isArray(entry[1])
        ).slice(-artistLimit).map(([artist, ids]) => [artist, ids.filter(id => typeof id === 'string').slice(-openerLimit)]);
      }
    } catch { /* Unavailable storage must not prevent music from starting. */ }
    return memory;
  }
  return {
    choose(artistId, songs) {
      const unique = [...new Map(songs.filter(song => song?.id).map(song => [String(song.id), song])).values()];
      if (unique.length < 2) return unique[0];
      const recent = read().find(([artist]) => artist === artistId)?.[1] || [];
      const alternatives = unique.filter(song => String(song.id) !== recent.at(-1));
      const fresh = alternatives.filter(song => !recent.includes(String(song.id)));
      // Exhausted small catalogs rotate oldest first rather than immediately repeating.
      if (!fresh.length) return alternatives.reduce((oldest, song) =>
        recent.indexOf(String(song.id)) < recent.indexOf(String(oldest.id)) ? song : oldest);
      return fresh[Math.min(fresh.length - 1, Math.max(0, Math.floor(random() * fresh.length)))];
    },
    remember(artistId, songId) {
      const entries = read();
      const previous = entries.find(([artist]) => artist === artistId)?.[1] || [];
      memory = [...entries.filter(([artist]) => artist !== artistId),
        [artistId, [...previous.filter(id => id !== String(songId)), String(songId)].slice(-openerLimit)]]
        .slice(-artistLimit);
      try { storage?.setItem(key, JSON.stringify(memory)); } catch { storageFailed = true; /* Retain session memory. */ }
    }
  };
}
