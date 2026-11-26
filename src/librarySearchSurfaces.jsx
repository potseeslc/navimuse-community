import {LoadingSkeleton} from './LoadingSkeleton.jsx';
import {ArtistBiography} from './ArtistBiography.jsx';
import {LoadingDots} from './LoadingDots.jsx';
import {LibraryPicker} from './LibraryPicker.jsx';
import {appendUniqueAlbums, checkedAlbumPage} from './albumPage.js';
import {useAutoLoad} from './useAutoLoad.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Album, ArrowDown, ArrowUp, ArrowLeft, ChevronRight, Clock3, Disc3, Grid2X2, List, ListMusic, Pencil, Play, Plus, Search, Shuffle, Trash2 } from 'lucide-react';
import { createPlaylist, deletePlaylist, fetchPlaylistDetail, reorderPlaylist, updatePlaylist } from './playlists.js';
import { playlistDurationSeconds, samePlaylistEntryOrder } from './playlistPresentation.js';
import { libraryBrowsePageSize, nextVisibleLibraryCount, visibleLibraryItems } from './libraryPagination.js';
import { formatDuration } from './playerChrome.jsx';
import { navidromeArtistProfile, navidromeLibraryAlbums, navidromeLibraryBrowse, navidromeSearch } from './services/navidromeService.js';
import { Artwork, ScreenHeader, SectionHeader, normalizedAlbums } from './surfaceUi.jsx';
import { LibraryAlbumTracks } from './LibraryAlbumTracks.jsx';
import { TrackQueueActions } from './TrackQueueActions.jsx';

const quickSearches = [
  ['Live shows', 'live'],
  ['Acoustic', 'acoustic'],
  ['Radio', 'radio'],
  ['Beatles', 'Beatles'],
  ['Jazz', 'jazz'],
  ['2026', '2026']
];

export function LibrarySurface({
  libraryFolders, onLibraryChange, librarySaving, browseDisabled=false,
  onOpenDownloads, downloadsSelected=false, downloadsContent, onCloseDownloads, onDownloadSongs, onOpenArtist,
  activeLibrary,
  albumSort,
  browseKey,
  libraryKey,
  onAddToQueue,
  onPlayAlbum,
  onStartAlbum,
  onPlaySong,
  nowPlayingId,
  onPlayNext,
  onPlayPlaylist,
  onPlaylistsChanged,
  onSurfaceScroll,
  playbackMessage,
  playlistRevision,
  protectedApiFetch,
  queueActionDisabledReason,
  setAlbumSort,
  setBrowseKey,
  settings
}) {
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const albumOpener = useRef(null);
  const [selection, setSelection] = useState(null);
  const selectionOpener = useRef(null);
  const [view, setView] = useState(settings?.library?.defaultView || 'grid');
  const [browseData, setBrowseData] = useState({ artists: [], albums: [], albumsPage: null, playlists: [], genres: [], genresPage: null });
  const browseIdentity = JSON.stringify([libraryKey,browseKey,browseKey === 'albums' ? albumSort : '']);
  const [loadedBrowseIdentity, setLoadedBrowseIdentity] = useState(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [browseAttempt, setBrowseAttempt] = useState(0);
  const libraryHeading = useRef(null);
  const [albumPageLoading, setAlbumPageLoading] = useState(false);
  const [albumPageError, setAlbumPageError] = useState('');
  const albumPageRequestRef = useRef(0);
  const albumPageRequest = useRef(null);
  const genrePageRequest = useRef(null);
  const [genrePageLoading, setGenrePageLoading] = useState(false);
  const [genrePageError, setGenrePageError] = useState('');
  const albums = useMemo(
    () => normalizedAlbums(browseData.albums, [], settings?.library?.artworkSize),
    [browseData.albums, settings?.library?.artworkSize]
  );
  const eyebrow = activeLibrary?.name || 'All Navidrome Libraries';
  const libraryFilters = [
    { key: 'artists', label: 'Artists' },
    { key: 'albums', label: 'Albums' },
    { key: 'playlists', label: 'Playlists' },
    { key: 'genres', label: 'Genres' }
  ];
  const activeBrowse = libraryFilters.find((item) => item.key === browseKey) || libraryFilters[0];
  const remoteBrowse = !browseDisabled && !downloadsSelected && libraryFilters.some((item) => item.key === browseKey);
  const canShowBrowseResults = loadedBrowseIdentity === browseIdentity;

  useEffect(() => {
    setView(settings?.library?.defaultView || 'grid');
  }, [settings?.library?.defaultView]);

  useEffect(() => {
    setSelection(null);
    setSelectedAlbum(null);
    setBrowseData({ artists: [], albums: [], albumsPage: null, playlists: [], genres: [], genresPage: null });
  }, [libraryKey]);

  useEffect(() => { setSelectedAlbum(null); }, [albumSort]);
  useEffect(() => { if(downloadsSelected){setSelection(null);setSelectedAlbum(null);} }, [downloadsSelected]);

  useEffect(() => {
    if (!remoteBrowse) return undefined;
    albumPageRequestRef.current += 1;
    albumPageRequest.current?.abort();
    albumPageRequest.current = null;
    genrePageRequest.current?.abort();
    genrePageRequest.current = null;
    setGenrePageLoading(false);
    setGenrePageError('');
    setAlbumPageLoading(false);
    setAlbumPageError('');
    let cancelled = false;
    const browseTitle = activeBrowse.label || 'library items';
    const controller = new AbortController();
    const params = {};
    if (libraryKey) params.musicFolderId = libraryKey;
    if (browseKey === 'albums') params.sort = albumSort;
    setBrowseLoading(true);
    setBrowseError('');
    navidromeLibraryBrowse(browseKey, params, { signal: controller.signal })
      .then((payload) => {
        if (cancelled) return;
        setLoadedBrowseIdentity(browseIdentity);
        setBrowseData((current) => ({
          ...current,
          [browseKey]: browseKey === 'albums' ? appendUniqueAlbums([], payload.albums || []) : payload[browseKey] || [],
          ...(browseKey === 'albums' ? { albumsPage: payload.page || null } : {}),
          ...(browseKey === 'genres' ? { genresPage: payload.page || null } : {})
        }));
      })
      .catch((error) => {
        if (!cancelled && error.name !== 'AbortError') {
          setBrowseError(`Could not load ${browseTitle.toLowerCase()} from Navidrome.`);
        }
      })
      .finally(() => {
        if (!cancelled) setBrowseLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      albumPageRequestRef.current += 1;
      albumPageRequest.current?.abort();
      albumPageRequest.current = null;
      genrePageRequest.current?.abort();
      genrePageRequest.current = null;
    };
  }, [albumSort, browseKey, libraryKey, playlistRevision, remoteBrowse, browseAttempt]);

  const selectBrowse = (item) => {
    setSelection(null);
    setSelectedAlbum(null);
    onCloseDownloads?.();
    setBrowseKey(item.key);
  };

  const loadMoreAlbums = async () => {
    const page = browseData.albumsPage;
    if (browseKey !== 'albums' || albumPageRequest.current || albumPageLoading || page?.nextOffset === null || page?.nextOffset === undefined) return;
    const controller = new AbortController();
    albumPageRequest.current = controller;
    const requestId = albumPageRequestRef.current + 1;
    albumPageRequestRef.current = requestId;
    const params = { sort: albumSort, offset: String(page.nextOffset), limit: String(page.limit) };
    if (libraryKey) params.musicFolderId = libraryKey;
    setAlbumPageLoading(true);
    setAlbumPageError('');
    try {
      const payload = checkedAlbumPage(await navidromeLibraryAlbums(params, {signal: controller.signal}), page.nextOffset);
      if (albumPageRequestRef.current !== requestId) return;
      setBrowseData((current) => current.albumsPage?.nextOffset === page.nextOffset ? {
        ...current,
        albums: appendUniqueAlbums(current.albums, payload.albums),
        albumsPage: payload.page || null
      } : current);
    } catch {
      if (albumPageRequestRef.current === requestId) setAlbumPageError('Could not load more albums from Navidrome. Your loaded albums are still available.');
    } finally {
      if (albumPageRequestRef.current === requestId) {albumPageRequest.current = null;setAlbumPageLoading(false);}
    }
  };

  const loadMoreGenres = async () => {
    const page = browseData.genresPage;
    if (browseKey !== 'genres' || genrePageRequest.current || page?.nextOffset == null) return;
    const controller = new AbortController();
    genrePageRequest.current = controller;
    const timer = setTimeout(() => controller.abort(new DOMException('Genre loading timed out', 'TimeoutError')), 15000);
    setGenrePageLoading(true);
    setGenrePageError('');
    let offset = page.nextOffset;
    try {
      // Advance empty matching pages within one listener action. Each successful
      // page commits its cursor, so a later failure retries only the failed page.
      while (offset != null) {
        const payload = await navidromeLibraryBrowse('genres', {
          musicFolderId: libraryKey, offset: String(offset), limit: String(page.limit)
        }, { signal: controller.signal });
        if (genrePageRequest.current !== controller) return;
        const nextOffset = payload.page?.nextOffset;
        if (nextOffset != null && (!Number.isSafeInteger(nextOffset) || nextOffset <= offset))
          throw new Error('Genre page did not advance');
        setBrowseData(current => ({ ...current, genres: [...current.genres, ...(payload.genres || [])], genresPage: payload.page || null }));
        if (payload.genres?.length) break;
        offset = nextOffset;
      }
    } catch (error) {
      if (genrePageRequest.current === controller && error.name !== 'AbortError')
        setGenrePageError('Could not load more genres. Your loaded genres are still available.');
    } finally {
      clearTimeout(timer);
      if (genrePageRequest.current === controller) {
        genrePageRequest.current = null;
        setGenrePageLoading(false);
      }
    }
  };

  const collectionDetail = selection && <LibraryCollectionDetail key={`${libraryKey}:${selection.kind}:${selection.value}`} selection={selection} onPlaySong={onPlaySong} libraryKey={libraryKey} artworkSize={settings?.library?.artworkSize} onPlayAlbum={onPlayAlbum} onBack={() => { setSelection(null); requestAnimationFrame(() => selectionOpener.current?.focus()); }} />;

  const openCollection = (kind, item, opener) => {
    if(kind==='artist' && onOpenArtist){onOpenArtist(item,opener);return;}
    selectionOpener.current = opener;
    setSelection({ kind, value: kind === 'artist' ? item.id : item.value || item.name, name: item.name || item.value });
  };

  return (
    <>{collectionDetail}<section hidden={Boolean(selection)} style={selection ? { display: 'none' } : undefined} className="screen-surface library-workspace" aria-label="Library" onScroll={onSurfaceScroll}>
      <header className="library-workspace-heading"><h1 ref={libraryHeading} tabIndex={-1}>Library</h1>{onLibraryChange?<LibraryPicker folders={libraryFolders} value={libraryKey} onChange={onLibraryChange} disabled={librarySaving||browseDisabled}/>:<span>{eyebrow}</span>}</header>
      <div className="library-filter-bar" aria-label="Library results">
        {libraryFilters.map((filter) => (
          <button
            disabled={browseDisabled}
            aria-pressed={!downloadsSelected && browseKey === filter.key}
            className={!downloadsSelected && browseKey === filter.key ? 'active' : ''}
            key={filter.key}
            onClick={() => selectBrowse(filter)}
            type="button"
          >{filter.label}</button>
        ))}
        {onOpenDownloads&&<button type="button" aria-pressed={downloadsSelected} className={downloadsSelected?'active':''} onClick={()=>{setSelection(null);setSelectedAlbum(null);onOpenDownloads();}}>Downloads</button>}
      </div>
      {downloadsSelected ? downloadsContent : <>
      {browseKey === 'albums' && !selectedAlbum && (
        <div className="library-view-tools">
          <label>
            Sort
            <select value={albumSort} onChange={(event) => setAlbumSort(event.target.value)}>
              <option value="alphabeticalByName">Album name</option>
              <option value="alphabeticalByArtist">Artist name</option>
              <option value="newest">Newest added</option>
              <option value="recent">Recently played</option>
              <option value="frequent">Most played</option>
            </select>
          </label>
          <div className="view-switch" aria-label="Album view">
            <button aria-pressed={view === 'grid'} className={view === 'grid' ? 'active' : ''} onClick={() => { setSelectedAlbum(null); setView('grid'); }}><Grid2X2 size={17} /> Grid</button>
            <button aria-pressed={view === 'cover'} className={view === 'cover' ? 'active' : ''} onClick={() => { setSelectedAlbum(null); setView('cover'); }}><Album size={17} /> Covers</button>
            <button aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => { setSelectedAlbum(null); setView('list'); }}><List size={17} /> List</button>
          </div>
        </div>
      )}

      {playbackMessage && <p className="inline-warning">{playbackMessage}</p>}

      <div aria-busy={browseLoading}>
        {browseKey !== 'albums' && <SectionHeader title={activeBrowse.label} />}
        {browseError && <p role="alert" className="inline-warning">{browseError} <button type="button" onClick={() => { libraryHeading.current?.focus(); setBrowseAttempt(value => value + 1); }}>Retry loading {activeBrowse.label.toLowerCase()}</button></p>}
        {browseLoading && (canShowBrowseResults ? <LoadingDots label={`Refreshing ${activeBrowse.label.toLowerCase()}`}/> :
          <LoadingSkeleton label={`Loading ${activeBrowse.label.toLowerCase()}`} layout={browseKey === 'albums' && view !== 'list' ? 'grid' : 'list'}/>)}
        {canShowBrowseResults && browseKey === 'albums' && <div hidden={Boolean(selectedAlbum)}><AlbumCollection albums={albums} pageError={albumPageError} loadingMore={albumPageLoading} onLoadMore={loadMoreAlbums} onPlayAlbum={(album, opener) => { if (!onStartAlbum) { onPlayAlbum(album); return; } albumOpener.current = opener; setSelectedAlbum(album); }} selectedId={selectedAlbum?.id} page={browseData.albumsPage} resultIdentity={`${libraryKey}:${albumSort}`} view={view} /></div>}
        {browseKey === 'albums' && selectedAlbum && <LibraryAlbumTracks onDownloadSongs={onDownloadSongs} key={selectedAlbum.id} nowPlayingId={nowPlayingId} album={selectedAlbum} onClose={() => { setSelectedAlbum(null); requestAnimationFrame(() => albumOpener.current?.focus()); }} onPlayAlbum={onStartAlbum} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} queueActionDisabledReason={queueActionDisabledReason} />}
        {canShowBrowseResults && browseKey === 'artists' && <LibraryBrowseList items={browseData.artists} emptyLabel="No artists returned from Navidrome yet." kind="Artist" onOpen={(item, opener) => openCollection('artist', item, opener)} />}
        {browseKey === 'playlists' && (
          <PlaylistManager
            key={libraryKey || 'all'}
            loading={browseLoading && !canShowBrowseResults}
            items={canShowBrowseResults ? browseData.playlists : []}
            onAddToQueue={onAddToQueue}
            onChanged={onPlaylistsChanged}
            onItemsChange={(items) => setBrowseData((current) => ({ ...current, playlists: items }))}
            onPlayNext={onPlayNext}
            queueActionDisabledReason={queueActionDisabledReason}
            onDownloadSongs={onDownloadSongs}
            onPlayPlaylist={onPlayPlaylist}
            protectedApiFetch={protectedApiFetch}
          />
        )}
        {canShowBrowseResults && browseKey === 'genres' && <LibraryBrowseList page={browseData.genresPage} loadingMore={genrePageLoading} pageError={genrePageError} onLoadMore={loadMoreGenres} resultIdentity={libraryKey} items={browseData.genres} emptyLabel="No genres returned from Navidrome yet." kind="Genre" onOpen={(item, opener) => openCollection('genre', item, opener)} />}
      </div>
    </>}
    </section></>
  );
}

function PlaylistManager({ onDownloadSongs, items, loading, onAddToQueue, onChanged, onItemsChange, onPlayNext, onPlayPlaylist, protectedApiFetch, queueActionDisabledReason }) {
  const [detail, setDetail] = useState(null);
  const [loadingId, setLoadingId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [createName, setCreateName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [reorderNeedsRefresh, setReorderNeedsRefresh] = useState(false);
  const [reorderMessage, setReorderMessage] = useState('');
  const trackPlayButtonsRef = useRef(new Map());
  const movedTrackFocusRef = useRef(null);
  const deleteConfirmRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const deleteWasConfirming = useRef(false);
  const detailBackRef = useRef(null);
  const createInputRef = useRef(null);
  const summaryButtonsRef = useRef(new Map());
  const openerIdRef = useRef(null);
  const restoreListFocusRef = useRef(false);
  const trackRemoveButtonsRef = useRef(new Map());
  const removedTrackFocusRef = useRef(null);

  useEffect(() => {
    if (detail?.id) detailBackRef.current?.focus();
    else if (restoreListFocusRef.current) {
      restoreListFocusRef.current = false;
      (summaryButtonsRef.current.get(openerIdRef.current) || createInputRef.current)?.focus();
    }
  }, [detail?.id]);

  useEffect(() => {
    if (deleteConfirming) deleteConfirmRef.current?.focus();
    else if (deleteWasConfirming.current) deleteTriggerRef.current?.focus();
    deleteWasConfirming.current = deleteConfirming;
  }, [deleteConfirming]);

  useEffect(() => {
    if (busy || removedTrackFocusRef.current === null) return;
    const index = Math.min(removedTrackFocusRef.current, (detail?.entry?.length || 0) - 1);
    removedTrackFocusRef.current = null;
    (trackRemoveButtonsRef.current.get(index) || detailBackRef.current)?.focus();
  }, [busy, detail]);

  useEffect(() => {
    if (busy || movedTrackFocusRef.current === null) return;
    const index = movedTrackFocusRef.current;
    movedTrackFocusRef.current = null;
    (trackPlayButtonsRef.current.get(index) || detailBackRef.current)?.focus();
  }, [busy, detail]);

  const refreshReorder = async () => {
    if (!detail?.id || busy) return;
    setBusy('refresh');
    try {
      const updated = await fetchPlaylistDetail(protectedApiFetch, detail.id);
      if (!updated) throw new Error('This playlist is no longer available.');
      setDetail(updated); setReorderNeedsRefresh(false); setError('');
      setReorderMessage('Playlist refreshed. Review the order before moving a track.');
      movedTrackFocusRef.current = 0;
    } catch (error) { setError(error.message); }
    finally { setBusy(''); }
  };

  const moveTrack = async (index, target) => {
    if (!detail?.id || busy || reorderNeedsRefresh) return;
    setBusy('reorder'); setError(''); setReorderMessage('');
    try {
      const updated = await reorderPlaylist(protectedApiFetch, detail.id, detail.entry, index, target);
      movedTrackFocusRef.current = target;
      setDetail(updated);
      setReorderMessage(`Moved track ${index + 1} to position ${target + 1}.`);
      onChanged?.();
    } catch (error) {
      setReorderNeedsRefresh(true); setError(error.message);
      movedTrackFocusRef.current = index;
    } finally { setBusy(''); }
  };

  const closeDetail = () => {
    setReordering(false); setReorderNeedsRefresh(false); setReorderMessage('');
    restoreListFocusRef.current = true;
    setDetail(null);
    setError('');
    setDeleteConfirming(false);
  };

  const openDetail = async (playlist) => {
    if (!playlist?.id || busy) return;
    setLoadingId(playlist.id);
    setError('');
    try {
      const nextDetail = await fetchPlaylistDetail(protectedApiFetch, playlist.id);
      setReordering(false); setReorderNeedsRefresh(false); setReorderMessage('');
      openerIdRef.current = playlist.id;
      setDetail(nextDetail);
      setRenameName(nextDetail?.name || playlist.name || '');
      setDeleteConfirming(false);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingId('');
    }
  };

  const createNewPlaylist = async (event) => {
    event.preventDefault();
    const name = createName.trim();
    if (!name || busy) return;
    setBusy('create');
    setError('');
    try {
      const created = await createPlaylist(protectedApiFetch, { name });
      onItemsChange?.([...items, created].filter(Boolean));
      setCreateName('');
      onChanged?.();
      if (created) {
        openerIdRef.current = created.id;
        setDetail(created);
        setRenameName(created.name || name);
      }
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy('');
    }
  };

  const renamePlaylist = async (event) => {
    event.preventDefault();
    const name = renameName.trim();
    if (!detail?.id || !name || busy) return;
    setBusy('rename');
    setError('');
    try {
      const updated = await updatePlaylist(protectedApiFetch, detail.id, { name });
      setDetail(updated);
      onItemsChange?.(items.map((item) => item.id === detail.id ? {
        ...item,
        name: updated?.name || name,
        songCount: updated?.songCount ?? updated?.entry?.length ?? item.songCount
      } : item));
      onChanged?.();
    } catch (renameError) {
      setError(renameError.message);
    } finally {
      setBusy('');
    }
  };

  const removeTrack = async (song, trackIndex) => {
    if (!detail?.id || busy) return;
    removedTrackFocusRef.current = trackIndex;
    setBusy(`remove-${trackIndex}`);
    setError('');
    try {
      const latest = await fetchPlaylistDetail(protectedApiFetch, detail.id);
      const latestEntry = latest?.entry?.[trackIndex];
      if (!latestEntry || String(latestEntry.id) !== String(song?.id) || !samePlaylistEntryOrder(detail.entry, latest.entry)) {
        setDetail(latest);
        setError('This playlist changed elsewhere. Review the refreshed tracks and try again.');
        return;
      }
      const updated = await updatePlaylist(protectedApiFetch, detail.id, { removeSongIndexes: [trackIndex] });
      setDetail(updated);
      onItemsChange?.(items.map((item) => item.id === detail.id ? {
        ...item,
        name: updated?.name || item.name,
        songCount: updated?.songCount ?? updated?.entry?.length ?? item.songCount
      } : item));
      onChanged?.();
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusy('');
    }
  };

  const removePlaylist = async () => {
    if (!detail?.id || busy) return;
    setBusy('delete');
    setError('');
    try {
      await deletePlaylist(protectedApiFetch, detail.id);
      onItemsChange?.(items.filter((item) => item.id !== detail.id));
      restoreListFocusRef.current = true;
      setDetail(null);
      setRenameName('');
      setDeleteConfirming(false);
      onChanged?.();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy('');
    }
  };

  if (detail) {
    const entries = detail.entry || [];
    const totalDuration = playlistDurationSeconds(entries);
    return (
      <section className="playlist-manager playlist-detail" aria-label={`Manage ${detail.name || 'playlist'}`}>
        <header className="playlist-detail-header">
          <button ref={detailBackRef} className="playlist-back" type="button" disabled={Boolean(busy)} onClick={closeDetail}><ArrowLeft size={18} /> Playlists</button>
          {deleteConfirming ? (
            <div className="playlist-delete-confirmation" role="group" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); setDeleteConfirming(false); } }} aria-label={`Confirm deletion of ${detail.name || 'this playlist'}`}>
              <span>This cannot be undone.</span>
              <button type="button" disabled={Boolean(busy)} onClick={() => setDeleteConfirming(false)}>Cancel</button>
              <button ref={deleteConfirmRef} className="danger" type="button" disabled={Boolean(busy)} onClick={removePlaylist}><Trash2 size={17} /> {busy === 'delete' ? 'Deleting…' : 'Delete'}</button>
            </div>
          ) : (
            <button ref={deleteTriggerRef} className="danger" type="button" disabled={Boolean(busy)} onClick={() => setDeleteConfirming(true)}><Trash2 size={17} /> Delete</button>
          )}
        </header>
        <div className="playlist-detail-hero">
          <Artwork item={detail} className="playlist-detail-art browse-glyph" fallbackIcon={<ListMusic size={42}/>}/>
          <div className="playlist-detail-copy">
            <h2 className="playlist-type-label">Playlist</h2>
            <form className="playlist-manager-form" onSubmit={renamePlaylist}>
              <label><span className="sr-only">Playlist name</span><input aria-label="Playlist name" maxLength="200" value={renameName} disabled={Boolean(busy)} onChange={(event) => setRenameName(event.target.value)} /></label>
              <button type="submit" disabled={Boolean(busy) || !renameName.trim()}><Pencil size={17} /> Rename</button>
            </form>
            <p aria-label="Playlist summary">{entries.length} tracks{totalDuration ? ` · ${formatDuration(totalDuration)}` : ''}</p>
            <div className="playlist-play-actions">
              {onDownloadSongs&&<button type="button" disabled={!entries.length||Boolean(busy)} onClick={()=>onDownloadSongs(entries,{kind:'playlist',id:detail.id,name:detail.name})}>Download playlist</button>}
              <button className="primary" type="button" disabled={!entries.length || Boolean(busy)} onClick={() => onPlayPlaylist?.(entries, false, detail)}><Play size={17} fill="currentColor" /> Play</button>
              <button type="button" disabled={!entries.length || Boolean(busy)} onClick={() => onPlayPlaylist?.(entries, true, detail)}><Shuffle size={17} /> Shuffle</button>
            </div>
          </div>
        </div>
        {error && <p className="inline-warning" role="alert">{error}</p>}
        <div className="settings-actions">
          <button type="button" aria-pressed={reordering} disabled={Boolean(busy) || (!reordering && (entries.length < 2 || entries.length > 10000))} onClick={() => setReordering(value => !value)}>{reordering ? 'Done reordering' : 'Reorder tracks'}</button>
          {reorderNeedsRefresh && <button type="button" disabled={Boolean(busy)} onClick={refreshReorder}>Refresh playlist</button>}
        </div>
        {reordering && <p className="settings-note">Move tracks with the arrow buttons. Each move saves the playlist; your listening queue stays unchanged.</p>}
        {reorderMessage && <p role="status">{reorderMessage}</p>}
        <div className="playlist-track-table" role="table" aria-label={`${detail.name || 'Playlist'} tracks`}>
          <div className="playlist-track-head" role="row">
            <span role="columnheader">#</span><span role="columnheader">Title</span><span role="columnheader">Artist</span><span role="columnheader">Album</span><span role="columnheader"><Clock3 size={15} /><span className="sr-only">Duration</span></span><span aria-hidden="true" />
          </div>
          {entries.map((song, index) => (
            <article role="row" key={`${song.id || song.title}-${index}`}>
              <span className="playlist-track-number" role="cell">{index + 1}</span>
              <div role="cell"><button ref={(node) => { if (node) trackPlayButtonsRef.current.set(index, node); else trackPlayButtonsRef.current.delete(index); }} className="playlist-track-play" type="button" aria-label={`Play playlist track ${index + 1}: ${song.title || 'Untitled Track'}`} disabled={Boolean(busy) || !String(song.id || '').trim()} onClick={() => onPlayPlaylist?.(entries, false, detail, index)}>{song.title || 'Untitled Track'}</button></div>
              <p role="cell">{song.artist || 'Unknown Artist'}</p>
              <p role="cell">{song.album || 'Unknown Album'}</p>
              <p role="cell">{song.duration ? formatDuration(song.duration) : '—'}</p>
              <div className="playlist-track-tools" role="cell">
                {reordering ? <>
                  <button type="button" aria-label={`Move playlist track ${index + 1} up`} disabled={Boolean(busy) || reorderNeedsRefresh || index === 0} onClick={() => moveTrack(index,index-1)}><ArrowUp size={16}/></button>
                  <button type="button" aria-label={`Move playlist track ${index + 1} down`} disabled={Boolean(busy) || reorderNeedsRefresh || index === entries.length-1} onClick={() => moveTrack(index,index+1)}><ArrowDown size={16}/></button>
                </> : <>
                <TrackQueueActions disabledReason={queueActionDisabledReason} song={song} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} />
                <button ref={(node) => { if (node) trackRemoveButtonsRef.current.set(index, node); else trackRemoveButtonsRef.current.delete(index); }} type="button" aria-label={`Remove ${song.title || 'track'} from playlist`} disabled={Boolean(busy)} onClick={() => removeTrack(song, index)}><Trash2 size={16} /><span className="sr-only">Remove</span></button>
                </>}
              </div>
            </article>
          ))}
          {!entries.length && <p className="empty-state">This playlist is empty. Add a playing track from Now Playing.</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="playlist-manager" aria-label="Playlist manager">
      <form className="playlist-manager-form" onSubmit={createNewPlaylist}>
        <label><span>New playlist name</span><input ref={createInputRef} maxLength="200" value={createName} disabled={Boolean(busy)} onChange={(event) => setCreateName(event.target.value)} /></label>
        <button type="submit" disabled={Boolean(busy) || !createName.trim()}><Plus size={17} /> Create</button>
      </form>
      {error && <p className="inline-warning" role="alert">{error}</p>}
      {!items.length ? (!loading && <p className="empty-state">No playlists returned from Navidrome yet.</p>) : (
        <div className="result-list playlist-summary-list">
          {items.map((playlist) => (
            <button key={playlist.id || playlist.name} ref={(node) => { if (node) summaryButtonsRef.current.set(playlist.id, node); else summaryButtonsRef.current.delete(playlist.id); }} type="button" disabled={Boolean(busy || loadingId)} onClick={() => openDetail(playlist)}>
              <Artwork item={playlist} className="small-cover browse-glyph" fallbackIcon={<ListMusic size={24}/>}/>
              <div><h3>{playlist.name || 'Untitled Playlist'}</h3><p>Playlist · {playlist.songCount || 0} songs</p></div>
              <ChevronRight size={20} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function AlbumCollection({ albums, pageError, loadingMore, onLoadMore, onPlayAlbum, page, resultIdentity, view, selectedId }) {
  const [visibleCount, setVisibleCount] = useState(libraryBrowsePageSize);
  const previousAlbumLengthRef = useRef(albums.length);
  const previousResultIdentityRef = useRef(resultIdentity);

  useEffect(() => {
    if (resultIdentity !== previousResultIdentityRef.current || albums.length < previousAlbumLengthRef.current) {
      setVisibleCount(libraryBrowsePageSize);
    }
    previousAlbumLengthRef.current = albums.length;
    previousResultIdentityRef.current = resultIdentity;
  }, [albums, resultIdentity]);

  const collectionRef = useRef(null);
  useEffect(() => {
    if (selectedId) collectionRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  const countRef = useRef(null);
  const moreRef = useRef(null);
  const paginationOwnedFocus = useRef(false);
  const visibleAlbums = visibleLibraryItems(albums, visibleCount);
  const hasMore = visibleAlbums.length < albums.length;
  const hasNextPage = page?.nextOffset !== null && page?.nextOffset !== undefined;
  useAutoLoad(moreRef,{enabled:!selectedId&&(hasMore||hasNextPage)&&!loadingMore&&!pageError,identity:`${visibleCount}:${albums.length}:${page?.nextOffset}`});
  useEffect(() => {
    if (!loadingMore && paginationOwnedFocus.current) {
      if (document.activeElement === document.body) (moreRef.current || countRef.current)?.focus();
      paginationOwnedFocus.current = false;
    }
  }, [visibleCount, loadingMore, page, albums.length]);

  return (
    <section className="library-browse-results" aria-label="Album results">
      <p ref={countRef} tabIndex={-1} className="library-browse-count" aria-live="polite">Showing {visibleAlbums.length} of {albums.length} album results{page?.nextOffset != null ? '; load more albums to continue this sorted list.' : ''}</p>
      {!albums.length && <p className="empty-state">{hasNextPage ? 'No matching albums in this part of the library. Continue to check more.' : 'No albums returned from Navidrome yet.'}</p>}
      <div ref={collectionRef} className={`library-collection ${view}`} id="library-album-results">
        {visibleAlbums.map((album) => (
          <button className={`library-card${selectedId === album.id ? ' selected' : ''}`} aria-pressed={selectedId === album.id} key={album.id} type="button" onClick={(event) => onPlayAlbum(album, event.currentTarget)}>
            <Artwork item={album} className={`album-cover ${album.tone}`} />
            <div>
              <h3>{album.title}</h3>
              <p>{album.artist}</p>
            </div>
            <ChevronRight size={20} />
          </button>
        ))}
      </div>
      {pageError && <p role="alert" className="inline-warning">{pageError}</p>}
      {(hasMore || hasNextPage) && (
        <button
          ref={moreRef}
          aria-controls="library-album-results"
          aria-busy={loadingMore}
          className="library-browse-more"
          disabled={loadingMore}
          type="button"
          onClick={(event) => {
            paginationOwnedFocus.current = document.activeElement === event.currentTarget;
            if (hasMore) setVisibleCount((current) => nextVisibleLibraryCount(current, albums.length));
            else onLoadMore?.();
          }}
        >
          {hasMore ? `Show ${Math.min(libraryBrowsePageSize, albums.length - visibleAlbums.length)} more album results`
            : loadingMore ? 'Loading more albums…' : pageError ? 'Retry loading more albums' : 'Load more albums'}
        </button>
      )}
    </section>
  );
}

function LibraryBrowseList({ emptyLabel, items, kind, onOpen, page, loadingMore, pageError, onLoadMore, resultIdentity }) {
  const [visibleCount, setVisibleCount] = useState(libraryBrowsePageSize);
  const remotePaging = Boolean(onLoadMore);
  const previous = useRef({ kind, resultIdentity, length: items.length });
  const moreButton = useRef(null);
  const countLabel = useRef(null);
  const ownsFocus = useRef(false);
  useEffect(() => {
    if (previous.current.kind !== kind || previous.current.resultIdentity !== resultIdentity || items.length < previous.current.length)
      setVisibleCount(libraryBrowsePageSize);
    else if (remotePaging && items.length > previous.current.length)
      setVisibleCount(current => Math.max(current, items.length));
    previous.current = { kind, resultIdentity, length: items.length };
  }, [items.length, kind, resultIdentity, remotePaging]);
  useEffect(() => {
    if (loadingMore || !ownsFocus.current) return;
    ownsFocus.current = false;
    if (document.activeElement === document.body) (moreButton.current || countLabel.current)?.focus();
  }, [loadingMore, visibleCount, items.length, pageError]);

  const visibleItems = visibleLibraryItems(items, visibleCount);
  const hasMore = visibleItems.length < items.length;
  const hasServerMore = page?.nextOffset != null;
  useAutoLoad(moreButton,{enabled:(hasMore||hasServerMore)&&!loadingMore&&!pageError,identity:`${visibleCount}:${items.length}:${page?.nextOffset}`});

  return (
    <section className="library-browse-results" aria-label={`${kind} results`}>
      <p ref={countLabel} tabIndex={-1} className="library-browse-count" aria-live="polite">Showing {visibleItems.length} of {items.length} {kind.toLowerCase()} results{hasServerMore ? "; load more to continue this collection." : ""}</p>
      {!items.length && <p className="empty-state">{hasServerMore ? "No matching genres in this part of the library. Continue loading to find more." : emptyLabel}</p>}
      {pageError && <p role="alert" className="inline-warning">{pageError}</p>}
      <div className="result-list" id={`library-${kind.toLowerCase()}-results`}>
        {visibleItems.map((item, index) => {
          const name = item.name || item.title || item.value || `Untitled ${kind}`;
          const detail = item.albumCount
            ? `${item.albumCount} albums`
            : item.songCount
              ? `${item.songCount} songs`
              : item.duration
                ? formatDuration(item.duration)
                : kind;
          return (
            <button type="button" onClick={(event) => onOpen(item, event.currentTarget)} key={item.id || item.value || `${kind}-${name}-${index}`}>
              <Artwork item={item} className="small-cover browse-glyph" fallbackIcon={kind==='Artist'?undefined:<List size={24}/>}/>
              <div>
                <h3>{name}</h3>
                <p>{kind} · {detail}</p>
              </div>
              <ChevronRight size={20} />
            </button>
          );
        })}
      </div>
      {(hasMore || hasServerMore) && (
        <button
          ref={moreButton}
          disabled={loadingMore}
          aria-controls={`library-${kind.toLowerCase()}-results`}
          className="library-browse-more"
          type="button"
          onClick={(event) => {
            ownsFocus.current = document.activeElement === event.currentTarget;
            if (hasMore) setVisibleCount(current => nextVisibleLibraryCount(current, items.length));
            else onLoadMore?.();
          }}
        >
          {hasMore ? `Show ${Math.min(libraryBrowsePageSize, items.length - visibleItems.length)} more ${kind.toLowerCase()} results` : loadingMore ? 'Loading more genres…' : pageError ? 'Retry loading more genres' : 'Load more genres'}
        </button>
      )}
    </section>
  );
}

export function SearchSurface({ onOpenArtist, query = '', onQueryChange, shortcutsEnabled = true, activeLibrary, libraryKey, onAddToQueue, onPlayAlbum, onPlayNext, onPlaySong, onSurfaceScroll, playbackMessage, queueActionDisabledReason, settings }) {
  const setQuery = onQueryChange;
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const searchIdentity = JSON.stringify([libraryKey,query.trim()]);
  const searchIdentityRef = useRef(null);
  const [results, setResults] = useState({ artists: [], albums: [], songs: [], genres: [] });
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef(null);
  const artistOpener = useRef(null);
  const [artistSelection, setArtistSelection] = useState(null);
  useEffect(() => { setArtistSelection(null); }, [query, libraryKey]);

  useEffect(() => {
    if (!shortcutsEnabled) return undefined;
    let focusFrame;
    const focusSearch = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const isEditable = target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !isEditable) {
        event.preventDefault();
        setArtistSelection(null);
        window.cancelAnimationFrame(focusFrame);
        focusFrame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (event.key === 'Escape' && document.activeElement === searchInputRef.current && query) {
        event.preventDefault();
        setQuery('');
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => { window.removeEventListener('keydown', focusSearch); window.cancelAnimationFrame(focusFrame); };
  }, [query, shortcutsEnabled, onQueryChange]);

  useEffect(() => {
    const trimmed = query.trim();
    if (searchIdentityRef.current !== searchIdentity) setResults({ artists: [], albums: [], songs: [], genres: [] });
    searchIdentityRef.current = searchIdentity;
    setError('');
    setLoading(trimmed.length >= 2);
    if (trimmed.length < 2) return undefined;

    const controller = new AbortController();
    let active = true;
    const handle = window.setTimeout(() => {
      navidromeSearch(trimmed, libraryKey, { signal: controller.signal })
        .then((payload) => {
          if (!active) return;
          if (!payload || !['artists', 'albums', 'songs'].every(key => Array.isArray(payload[key]))) throw new Error('Invalid search response');
          setResults(payload);
        })
        .catch(() => {
          if (active) setError('Search is unavailable. Check your connection and try again.');
        })
        .finally(() => { if (active) setLoading(false); });
    }, 260);

    return () => {
      active = false;
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [libraryKey, query, attempt]);

  const albumResults = normalizedAlbums(results.albums, [], settings?.library?.artworkSize);
  const artistResults = results.artists || [];
  const genreResults = results.genres || [];

  return (
    <><section className="screen-surface search-workspace" style={artistSelection ? {display: 'none'} : undefined} aria-label="Search" onScroll={onSurfaceScroll}>
      <ScreenHeader eyebrow={activeLibrary?.name || 'All Music'} title="Search" />
      <label className="search-box">
        <Search size={20} />
        <input aria-label="Search songs, albums, artists, and genres" ref={searchInputRef} placeholder="Songs, albums, artists, genres" value={query} onChange={(event) => setQuery(event.target.value)} />
        <kbd>/</kbd>
      </label>
      {playbackMessage && <p className="inline-warning">{playbackMessage}</p>}

      {query.trim().length < 2 && <>
      <SectionHeader title="Try a search" />
      <div className="quick-grid">
        {quickSearches.map(([quickLabel, quickQuery]) => (
          <button key={quickLabel} type="button" onClick={() => setQuery(quickQuery)}>
            {quickLabel}
          </button>
        ))}
      </div>

      </>}
      <SectionHeader title="Results" />
      {loading && (results.artists.length + results.albums.length + results.songs.length + genreResults.length > 0 ? <p role="status" className="search-status">Refreshing results…</p> : <LoadingSkeleton label="Searching…"/>)}
      {error && <div role="alert" className="search-error"><p>{error}</p><button type="button" onClick={() => { searchInputRef.current?.focus(); setAttempt(value => value + 1); }}>Retry search</button></div>}
      {query.trim().length < 2 && <p className="empty-state">Enter at least two characters to find music.</p>}
      {results.genresUnavailable && <p className="inline-warning">Genre search is temporarily unavailable. Other results are shown below.</p>}
      <div className="search-result-groups">
        {genreResults.length > 0 && <section className="search-result-group" aria-labelledby="search-genres-title">
          <h3 id="search-genres-title">Genres</h3>
          <div className="result-list">{genreResults.map(genre => {
            const name = genre.value || genre.name;
            return <button key={`genre-${name}`} type="button" onClick={event => {
              artistOpener.current = event.currentTarget;
              setArtistSelection({kind:'genre', value:name, name});
            }}><Artwork item={genre} className="small-cover browse-glyph"/><div><h3>{name}</h3><p>View albums</p></div></button>;
          })}</div>
        </section>}
        {artistResults.length > 0 && (
          <section className="search-result-group" aria-labelledby="search-artists-title">
            <h3 id="search-artists-title">Artists</h3>
            <div className="result-list">
              {artistResults.map((artist) => {
                const name = artist.name || 'Unknown Artist';
                const detail = artist.albumCount
                  ? `${artist.albumCount} albums`
                  : artist.songCount
                    ? `${artist.songCount} songs`
                    : '';
                return (
                  <button key={`artist-${artist.id || name}`} type="button" onClick={(event) => {
                    if (!artist.id) { setQuery(name); return; }
                    if(onOpenArtist){onOpenArtist(artist,event.currentTarget);return;}
                    artistOpener.current = event.currentTarget;
                    setArtistSelection({kind: 'artist', value: artist.id, name});
                  }}>
                    <Artwork item={artist} className="small-cover browse-glyph" />
                    <div>
                      <h3>{name}</h3>
                      <p>{detail ? `${detail} · ` : ''}{artist.id ? 'View albums' : 'Search name'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {albumResults.length > 0 && (
          <section className="search-result-group" aria-labelledby="search-albums-title">
            <h3 id="search-albums-title">Albums</h3>
            <div className="result-list">
              {albumResults.map((album) => (
                <button key={`album-${album.id}`} type="button" onClick={(event) => onPlayAlbum(album, event.currentTarget)}>
                  <Artwork item={album} className="small-cover" />
                  <div>
                    <h3>{album.title}</h3>
                    <p>{album.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
        {(results.songs || []).length > 0 && (
          <section className="search-result-group" aria-labelledby="search-songs-title">
            <h3 id="search-songs-title">Songs</h3>
            <div className="result-list">
              {(results.songs || []).map((song) => (
                <article className="actionable-result-row" key={`song-${song.id}`}>
                  <button type="button" onClick={() => onPlaySong(song, results.songs || [])}>
                    <Artwork item={song} className="small-cover" />
                    <div>
                      <h3>{song.title}</h3>
                      <p>{song.artist || 'Unknown Artist'}</p>
                    </div>
                  </button>
                  <TrackQueueActions disabledReason={queueActionDisabledReason} song={song} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} />
                </article>
              ))}
            </div>
          </section>
        )}
        {query.trim().length >= 2 && !loading && !error && !results.genresUnavailable && genreResults.length === 0 && artistResults.length === 0 && albumResults.length === 0 && (results.songs || []).length === 0 && (
          <p className="empty-state">No matches for “{query.trim()}”. Try another title, artist, or genre.</p>
        )}
      </div>
    </section>
    {artistSelection && <LibraryCollectionDetail key={`${libraryKey}:${artistSelection.value}`} selection={artistSelection} onPlaySong={onPlaySong} libraryKey={libraryKey} artworkSize={settings?.library?.artworkSize} onPlayAlbum={onPlayAlbum} backLabel="Back to Search" className="search-artist-detail" onBack={() => {setArtistSelection(null); requestAnimationFrame(() => artistOpener.current?.focus());}} />}
    </>
  );
}

export function LibraryCollectionDetail({ onPlaySong, selection, libraryKey, artworkSize, onPlayAlbum, onBack, backLabel = 'Back to Library', className = '' }) {
  const [albums, setAlbums] = useState([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError('');
    const params = { [selection.kind === 'artist' ? 'artistId' : 'genre']: selection.value, offset: String(offset) };
    if (libraryKey) params.musicFolderId = libraryKey;
    navidromeLibraryAlbums(params, { signal: controller.signal }).then((response) => {
      if (!active) return;
      const payload=checkedAlbumPage(response,offset);
      setAlbums((current) => [...new Map([...current, ...(payload.albums || [])].map((album) => [album.id, album])).values()]);
      setNextOffset(payload.page?.nextOffset ?? null);
    }).catch((failure) => {
      if (active && failure.name !== 'AbortError') setError('Could not load these albums. Try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [selection.kind, selection.value, libraryKey, offset, attempt]);
  const [profile,setProfile]=useState(null);
  useEffect(()=>{
    setProfile(null);if(selection.kind!=='artist')return;
    const controller=new AbortController();let current=true;
    navidromeArtistProfile(selection.value,{signal:controller.signal}).then(value=>{if(current)setProfile(value);}).catch(()=>{if(current)setProfile({popularAvailable:false});});
    return()=>{current=false;controller.abort();};
  },[selection.kind,selection.value]);
  // Finish the existing folder-membership scan before offering a ranked queue.
  // A partial album page must not silently truncate Popular songs at play time.
  useEffect(()=>{
    if(selection.kind==='artist' && profile?.popular?.length && !loading && !error && nextOffset!=null) setOffset(nextOffset);
  },[selection.kind,profile,loading,error,nextOffset]);
  const popularReady=!loading && !error && nextOffset==null;
  const membership=new Set(albums.map(a=>String(a.id)));
  const popular=(profile?.popular||[]).filter(song=>membership.has(String(song.albumId||song.parent)));
  const autoMore=useRef(null);
  useAutoLoad(autoMore,{enabled:!loading&&!error&&nextOffset!=null,identity:nextOffset});
  return <section className={`screen-surface library-collection-detail ${className}`} aria-label={`${selection.name} albums`}>
    <button type="button" className="album-detail-back" onClick={onBack}><ArrowLeft size={18} /> {backLabel}</button>
    <header className="artist-page-header">
      {selection.kind==='artist' && <Artwork item={profile?.artist} className="artist-page-image" />}
      <div><p className="eyebrow">{selection.kind==='artist'?'Artist':'Genre'}</p><h1 ref={heading} tabIndex={-1}>{profile?.artist?.name || selection.name}</h1></div>
    </header>
    {selection.kind==='artist' && <ArtistBiography key={selection.value} name={profile?.artist?.name || selection.name} biography={profile?.biography}/>}
    {selection.kind==='artist' && <section className="artist-popular" aria-label="Popular songs">
      <h2>Popular songs</h2>
      {!popularReady && profile?.popular?.length>0 && <p role="status">{error?'Finish loading albums to play the complete ranked list.':'Preparing the complete ranked list…'}</p>}
      {popular.length>0 ? <><p>Ranked by your music server’s metadata provider · available in this library</p><ol>{popular.map(song=><li key={song.id}><button type="button" disabled={!onPlaySong || !popularReady} onClick={()=>onPlaySong(song,popular)}><span>{song.title}</span><small>{song.album}</small><time>{formatDuration(song.duration)}</time></button></li>)}</ol></> : <p>{!profile || loading || nextOffset != null ? <LoadingDots label="Loading artist details"/> : profile.popularAvailable?'No ranked songs available in this library.':'Popularity data is unavailable from your music server.'}</p>}
    </section>}
    <h2>Albums</h2>
    <p>{selection.kind === 'artist' ? 'Artist' : 'Genre'} albums in the selected library</p>
    <div aria-busy={loading}>
      {albums.length > 0 && <AlbumCollection albums={normalizedAlbums(albums, [], artworkSize)} onPlayAlbum={onPlayAlbum} resultIdentity={`${libraryKey}:${selection.value}`} view="grid" />}
      {loading && <div className="artist-albums-loading"><LoadingDots label="Loading albums"/></div>}
      {error && <p role="alert">{error} <button type="button" onClick={() => { heading.current?.focus(); setAttempt((value) => value + 1); }}>Retry</button></p>}
      {!loading && !error && !albums.length && <p className="empty-state">{nextOffset == null ? 'No albums found in this library.' : 'No matching albums in this part of the library. Continue to check more.'}</p>}
      {!loading && !error && nextOffset != null && <button ref={autoMore} type="button" onClick={(event) => { if(document.activeElement===event.currentTarget)heading.current?.focus(); setOffset(nextOffset); }}>Load more albums</button>}
    </div>
  </section>;
}
