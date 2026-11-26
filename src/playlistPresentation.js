export function trackDurationSeconds(value) {
  if (typeof value === 'string' && value.includes(':')) {
    const parts = value.trim().split(':');
    if ((parts.length === 2 || parts.length === 3) && parts.every((part) => /^\d+$/.test(part))) {
      const numbers = parts.map(Number);
      return numbers.reduce((total, part) => (total * 60) + part, 0);
    }
    return 0;
  }
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export function playlistDurationSeconds(entries = []) {
  return entries.reduce((total, song) => total + trackDurationSeconds(song?.duration), 0);
}

export function playablePlaylistEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((song) => {
    if (!song || typeof song !== 'object') return false;
    return String(song.id || '').trim().length > 0;
  });
}

export function playlistPlaybackPlan(entries, shouldShuffle = false, shuffleEntries = (items) => items, selectedIndex = null) {
  const playableEntries = playablePlaylistEntries(entries);
  if (selectedIndex !== null) {
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= (entries?.length || 0) || !playablePlaylistEntries([entries[selectedIndex]]).length) return null;
    // Count valid preceding occurrences; searching by song ID loses duplicates.
    const queueIndex = playablePlaylistEntries(entries.slice(0, selectedIndex)).length;
    return { firstSong: playableEntries[queueIndex], queueSongs: playableEntries, queueIndex };
  }
  const queueSongs = shouldShuffle ? shuffleEntries([...playableEntries]) : playableEntries;
  if (!queueSongs.length) return null;
  return { firstSong: queueSongs[0], queueSongs, queueIndex: 0 };
}

// Positional edits must compare the whole observed order, not just the target ID:
// a duplicate can remain at that index after another client rearranges the list.
export function samePlaylistEntryOrder(expected, actual) {
  if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) return false;
  return expected.every((entry, index) => {
    const id = String(entry?.id || '').trim();
    return id.length > 0 && id === String(actual[index]?.id || '').trim();
  });
}
