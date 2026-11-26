import {AlbumNotes} from './AlbumNotes.jsx';
import {LoadingDots} from './LoadingDots.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, Play, X } from 'lucide-react';
import { navidromeAlbum } from './services/navidromeService.js';
import { TrackQueueActions } from './TrackQueueActions.jsx';
import { Artwork } from './surfaceUi.jsx';
import { formatDuration } from './playerChrome.jsx';

export function LibraryAlbumTracks({ onDownloadSongs, album, nowPlayingId, onClose, onPlayAlbum, onPlayNext, onAddToQueue, queueActionDisabledReason }) {
  const [result, setResult] = useState({ loading: true, album: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [album.id]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult({ loading: true, album: null, error: '' });
    navidromeAlbum(album.id, { signal: controller.signal }).then(payload => {
      if (!active) return;
      if (!payload.album || !Array.isArray(payload.album.song)) throw new Error('Invalid album');
      setResult({ loading: false, album: { ...payload.album, song: payload.album.song.filter(song => song?.id) }, error: '' });
    }).catch(error => {
      if (active && error.name !== 'AbortError') setResult({ loading: false, album: null, error: 'Could not load album tracks.' });
    });
    return () => { active = false; controller.abort(); };
  }, [album.id, attempt]);
  const songs = result.album?.song || [];
  return <section className="library-album-tracks" aria-labelledby="library-tracks-title" aria-busy={result.loading} onKeyDown={(event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }}>
    <button type="button" className="album-detail-back" onClick={onClose}><ArrowLeft size={18}/> Back to albums</button>
    <Artwork item={album} className="library-detail-cover"/>
    {onDownloadSongs&&<button className="album-download-button" type="button" disabled={!songs.length} onClick={()=>onDownloadSongs(songs)}>Download album</button>}
    <header className="library-tracks-heading">
      <h2 id="library-tracks-title" ref={heading} tabIndex={-1}>{album.title || album.name}</h2>
      <div>
        <button type="button" disabled={!songs.length} onClick={() => onPlayAlbum(result.album, 0)}><Play size={14} /> Play album</button>
        <button type="button" onClick={onClose} aria-label="Close album tracks"><X size={17} /></button>
      </div>
    </header>
    <AlbumNotes id={album.id} name={album.title||album.name}/>
    {result.loading && <LoadingDots label="Loading tracks"/>}
    {result.error && <p role="alert">{result.error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {!result.loading && !result.error && !songs.length && <p>This album has no available tracks.</p>}
    {songs.length > 0 && <table className="library-track-table">
      <thead><tr><th scope="col">#</th><th scope="col">Title</th><th scope="col" className="track-artist">Artist</th><th scope="col" className="track-album">Album</th><th scope="col"><Clock3 size={14} aria-label="Duration" /></th><th scope="col"><span className="sr-only">Queue actions</span></th></tr></thead>
      <tbody>{songs.map((song, index) => <tr key={`${song.id}:${index}`} aria-current={song.id === nowPlayingId ? 'true' : undefined}>
        <td className="track-number">{index + 1}</td>
        <td><button type="button" className="library-track-play" onClick={() => onPlayAlbum(result.album, index)} aria-label={`Play track ${index + 1}: ${song.title}`}><Play size={13} aria-hidden="true" /><span>{song.title || 'Untitled track'}</span></button></td>
        <td className="track-artist">{song.artist || result.album.artist}</td>
        <td className="track-album">{song.album || result.album.name}</td>
        <td className="track-duration">{formatDuration(song.duration)}</td>
        <td><TrackQueueActions song={song} disabledReason={queueActionDisabledReason} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} /></td>
      </tr>)}</tbody>
    </table>}
  </section>;
}
