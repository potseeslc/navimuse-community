import React from 'react';
import { ChevronRight, Disc3 } from 'lucide-react';
import { coverArtPath } from './services/navidromeService.js';
import { SafeImage } from './playerChrome.jsx';

export const defaultArtworkSize = '600';
export const fallbackArtwork = '/artwork/radio-tower.svg';

export function ScreenHeader({ eyebrow, title }) {
  return (
    <header className="screen-header">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </div>
    </header>
  );
}

export function SectionHeader({ title }) {
  return (
    <header className="section-header">
      <h2>{title}</h2>
      <ChevronRight size={22} />
    </header>
  );
}

export function Artwork({ item, className, fallbackIcon }) {
  const src = item?.artwork || coverArtUrl(item?.coverArt);
  return (
    <span className={`${className || ''} artwork-shell`}>
      {src ? <SafeImage src={src} alt="" loading="lazy" fallbackIcon={fallbackIcon} /> : fallbackIcon || <Disc3 size={26} />}
    </span>
  );
}

export function normalizedAlbums(albums = [], fallback = [], artworkSize = defaultArtworkSize) {
  const source = albums.length ? albums : fallback;
  return source.map((album, index) => ({
    id: String(album.id || `fallback-${index}`),
    title: album.title || album.name || 'Untitled Album',
    artist: album.artist || album.albumArtist || 'Unknown Artist',
    artistId: album.artistId || album.albumArtistId || '',
    coverArt: album.coverArt,
    artwork: album.artwork || coverArtUrl(album.coverArt, artworkSize),
    tone: album.tone || ['sage', 'coral', 'charcoal', 'forest', 'smoke'][index % 5],
    songCount: album.songCount,
    duration: album.duration
  }));
}

export function coverArtUrl(coverArt, size = defaultArtworkSize) {
  return coverArtPath(coverArt, size, defaultArtworkSize);
}
