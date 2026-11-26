import {AlbumNotes} from './AlbumNotes.jsx';
import {LoadingDots} from './LoadingDots.jsx';
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleArrowDown } from "lucide-react";
import { navidromeAlbum } from "./services/navidromeService.js";
import { Artwork } from "./surfaceUi.jsx";
import { formatDuration } from "./playerChrome.jsx";
import { TrackQueueActions } from "./TrackQueueActions.jsx";

export function AlbumDetail({
  onDownloadSongs,
  onOpenArtist,
  album,
  onBack,
  onPlayAlbum,
  onAddToQueue,
  onPlayNext,
  queueActionDisabledReason,
}) {
  const [result, setResult] = useState({
    loading: true,
    album: null,
    error: "",
  });
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, [album.id]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult({ loading: true, album: null, error: "" });
    navidromeAlbum(album.id, { signal: controller.signal })
      .then((payload) => {
        if (!active) return;
        if (!payload?.album || !Array.isArray(payload.album.song))
          throw new Error("Album tracks are unavailable.");
        setResult({
          loading: false,
          album: {
            ...payload.album,
            song: payload.album.song.filter((song) => song?.id),
          },
          error: "",
        });
      })
      .catch((error) => {
        if (active && error.name !== "AbortError")
          setResult({
            loading: false,
            album: null,
            error:
              "Could not load this album. Check your connection and retry.",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [album.id, attempt]);
  const detail = result.album;
  const songs = detail?.song || [];
  const artistId = detail?.artistId || album.artistId;
  const artistName = detail?.artist || album.artist;
  const rawYear = detail?.year ?? album.year;
  const year = /^\d{4}$/.test(String(rawYear)) && Number(rawYear) > 0 ? String(rawYear) : '';

  const title =
    detail?.name || detail?.title || album.title || album.name || "Album";
  return (
    <section
      className="screen-surface album-detail"
      aria-labelledby="album-detail-title"
      aria-busy={result.loading}
    >
      <button type="button" className="album-detail-back" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" /> Back
      </button>
      {onDownloadSongs && <button className="album-download-button" type="button" aria-label="Download album" title="Download album" disabled={!songs.length} onClick={()=>onDownloadSongs(songs)}><CircleArrowDown size={24} aria-hidden="true" /></button>}
      <header className="album-detail-header">
        <Artwork item={album} className="album-cover" />
        <div>
          <p className="eyebrow">Album</p>
          <h2 id="album-detail-title" tabIndex={-1} ref={titleRef}>
            {title}
          </h2>
          <p>{artistId && onOpenArtist ? <button type="button" className="player-album-link" onClick={event => onOpenArtist({id: artistId, name: artistName}, event.currentTarget)} aria-label={`Go to artist: ${artistName}`}>{artistName}</button> : artistName}</p>
          {detail && (
            <p>
              {year && <><span className="album-release-year">{year}</span> · </>}
              {songs.length} tracks ·{" "}
              {formatDuration(
                songs.reduce(
                  (total, song) => total + Number(song.duration || 0),
                  0,
                ),
              )}
            </p>
          )}

        </div>
      </header>
      <AlbumNotes id={album.id} name={title}/>
      {result.loading && <LoadingDots label="Loading album tracks"/>}
      {result.error && (
        <div role="alert">
          <p>{result.error}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry album
          </button>
        </div>
      )}
      {detail && !songs.length && (
        <p className="empty-state">This album has no playable tracks.</p>
      )}
      <ol className="album-detail-tracks" aria-label="Album tracks">
        {songs.map((song, index) => (
          <li key={`${song.id}-${index}`}>
            <button
              type="button"
              className="album-detail-track"
              aria-label={`Play track ${index + 1}: ${song.title || "Untitled track"}`}
              onClick={() => onPlayAlbum(detail, index)}
            >
              <span className="album-detail-number">{index + 1}</span>
              <span>
                <strong>{song.title || "Untitled track"}</strong>
                <small>{song.artist || detail.artist}</small>
              </span>
              <time>{formatDuration(song.duration)}</time>
            </button>
            <TrackQueueActions
              song={song}
              onAddToQueue={onAddToQueue}
              onPlayNext={onPlayNext}
              disabledReason={queueActionDisabledReason}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
