import { radioStreamPath } from './services/navidromeService.js';

export function radioStationSong(station) {
  if (!station?.id || !station.streamUrl) return null;
  return {
    id: `radio:${station.id}`,
    title: station.name || 'Untitled Station',
    artist: station.homePageUrl ? 'Internet Radio' : 'Navidrome Radio',
    album: 'Internet Radio',
    ...(station.coverArt ? {coverArt:station.coverArt} : {}),
    duration: 0,
    suffix: 'radio',
    contentType: 'audio/radio',
    source: 'Navidrome Radio',
    streamUrl: radioStreamPath(station.id)
  };
}

export function shuffled(items = []) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
