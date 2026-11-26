import React, { useEffect, useRef, useState } from 'react';
import { resolveAtlasTrackPoints } from './services/atlasPointService.js';
import { navidromeSearch } from './services/navidromeService.js';
import { useAtlasJourney } from './AtlasJourneyContext.jsx';
import { invalidatedPlannerState, isCurrentAtlasPlan } from './atlasPlannerState.js';

const MIN_TRACKS = 10;
const MAX_TRACKS = 50;
const DEFAULT_TRACKS = 25;

function trackLabel(track) {
  return [track?.title || track?.name || 'Untitled track', track?.artist || 'Unknown artist'].join(' — ');
}

function JourneyStops({ journey, heading = 'Ordered Journey stops' }) {
  if (!journey?.stops?.length) return null;
  return (
    <section className="atlas-journey-stops" aria-labelledby="atlas-journey-stops-title">
      <h4 id="atlas-journey-stops-title">{heading}</h4>
      <ol>
        {journey.stops.map((stop) => (
          <li key={stop.stopId}>
            <strong>{stop.playback.title}</strong>
            <span>{stop.playback.artist}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AtlasJourneyPlanner({ currentAtlasPointId = '', libraryKey, nowPlaying }) {
  const journey = useAtlasJourney();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [destination, setDestination] = useState(null);
  const [targetTrackCount, setTargetTrackCount] = useState(DEFAULT_TRACKS);
  const [searching, setSearching] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  const searchGeneration = useRef(0);
  const planGeneration = useRef(0);
  const planAbortRef = useRef(null);

  useEffect(() => {
    setDestination(null);
    setQuery('');
    setResults([]);
    setError('');
  }, [libraryKey]);

  useEffect(() => {
    setDestination(null); setQuery(''); setResults([]); setError('');
    invalidatePreview(); setPlanning(false);
  }, [nowPlaying?.id]);

  useEffect(() => () => { planGeneration.current += 1; planAbortRef.current?.abort(); }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || destination) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    const generation = ++searchGeneration.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const payload = await navidromeSearch(trimmed, libraryKey, { signal: controller.signal });
        if (generation === searchGeneration.current) {
          setResults((payload.songs || []).filter((song) => song?.id && String(song.id) !== String(nowPlaying?.id)).slice(0, 8));
        }
      } catch (searchError) {
        if (searchError?.name !== 'AbortError' && generation === searchGeneration.current) {
          setError(searchError.message || 'Destination search failed.');
          setResults([]);
        }
      } finally {
        if (generation === searchGeneration.current) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [destination, libraryKey, nowPlaying?.id, query]);

  const preview = journey.state.preview;
  const active = journey.state.persisted?.journey;
  const attached = Boolean(journey.state.queueAttached);
  const revalidation = journey.state.revalidation;
  const revalidating = journey.state.status === 'revalidating';
  const repairRequired = revalidation?.status === 'repair-required';
  const repairReady = repairRequired && preview;
  const displayedJourney = preview || active;
  const requestedCount = displayedJourney?.segments?.reduce((sum, segment) => sum + segment.targetTrackCount, 0);
  const actualCount = displayedJourney?.stops?.length;
  const shorter = displayedJourney?.segments?.some((segment) => segment.returnedTrackCount < segment.targetTrackCount);
  const canPreview = Boolean(nowPlaying?.id && destination?.id && !planning);
  const latestEvent = journey.state.events?.at(-1);
  const activeCurrentStop = active?.stops?.find((stop) => stop.queueItemId === journey.state.currentQueueItemId) || null;
  const knownStartPointId = activeCurrentStop?.pointId || currentAtlasPointId;

  const invalidatePreview = () => { planGeneration.current += 1; planAbortRef.current?.abort(); planAbortRef.current = null; setPlanning(invalidatedPlannerState().planning); if (journey.state.preview) journey.cancelPreview(); };

  const selectDestination = (song) => {
    invalidatePreview();
    setDestination(song);
    setQuery(trackLabel(song));
    setResults([]);
    setError('');
  };

  const previewJourney = async () => {
    if (!canPreview) return;
    setPlanning(true);
    setError('');
    const requestId = `planner-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const generation = ++planGeneration.current, startId = String(nowPlaying.id), destinationId = String(destination.id), requestedTarget = targetTrackCount, controller = new AbortController();
    planAbortRef.current?.abort(); planAbortRef.current = controller;
    try {
      const resolved = await resolveAtlasTrackPoints(knownStartPointId ? [destinationId] : [startId, destinationId], { requestId, signal: controller.signal });
      if (!isCurrentAtlasPlan(generation, planGeneration.current)) return;
      await journey.plan({
        requestId,
        waypoints: knownStartPointId ? [knownStartPointId, resolved.points[0].pointId] : resolved.points.map((point) => point.pointId),
        targetTrackCount: requestedTarget
      });
    } catch (planError) {
      if (planError?.name !== 'AbortError') setError(planError.message || 'NaviMuse could not preview this Journey.');
    } finally {
      if (planAbortRef.current === controller) planAbortRef.current = null;
      if (generation === planGeneration.current) setPlanning(false);
    }
  };

  const startJourney = () => {
    setError('');
    try {
      journey.start();
    } catch (startError) {
      setError(startError.message || 'NaviMuse could not start this Journey.');
    }
  };

  return (
    <section className="atlas-journey-planner" aria-labelledby="atlas-journey-title">
      <div className="atlas-journey-heading">
        <div>
          <p className="eyebrow">Sonic Atlas</p>
          <h2 id="atlas-journey-title">Plan a Journey</h2>
          <p>Choose one destination song. Previewing never changes playback.</p>
        </div>
        {active && (
          <button className="secondary-button" type="button" onClick={journey.detach}>Detach Journey</button>
        )}
      </div>

      {active && (
        <p className={`atlas-journey-status ${attached ? '' : 'is-detached'}`} role="status">
          {journey.state.status === 'completed' ? 'Journey completed at its destination through the current queue.' : revalidating ? 'Saved Journey is revalidating remaining stops against Navidrome.' : repairReady ? 'Saved Journey changed. Review the repair preview and reroute to continue.' : repairRequired ? 'Saved Journey changed and needs a new route before continuing.' : revalidation?.status === 'valid' ? 'Saved Journey revalidated and remains attached to the current queue.' : revalidation?.status === 'unavailable' ? 'Saved Journey is attached, but revalidation is temporarily unavailable.' : attached ? 'Active Journey restored and attached to the current queue.' : 'Restored Journey is detached from the current queue.'}
        </p>
      )}

      <div className="atlas-waypoints" aria-label="Journey waypoints">
        <div>
          <span>Start</span>
          <strong>{nowPlaying ? trackLabel(nowPlaying) : 'Play a song to choose a starting point'}</strong>
        </div>
        <div className="atlas-destination-picker">
          <label htmlFor="atlas-destination-search">Destination song</label>
          <input
            id="atlas-destination-search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => { invalidatePreview(); setQuery(event.target.value); setDestination(null); }}
            placeholder="Search your library"
            aria-describedby="atlas-search-state"
          />
          <span id="atlas-search-state" className="sr-only" aria-live="polite">{searching ? 'Searching' : `${results.length} destination results`}</span>
          {results.length > 0 && (
            <ul className="atlas-search-results" aria-label="Destination song results">
              {results.map((song) => (
                <li key={song.id}><button type="button" onClick={() => selectDestination(song)}>{trackLabel(song)}</button></li>
              ))}
            </ul>
          )}
          {!searching && query.trim().length >= 2 && !destination && results.length === 0 && !error && <p>No destination songs found.</p>}
        </div>
      </div>

      <div className="atlas-plan-controls">
        <label htmlFor="atlas-target-count">Target tracks: <strong>{targetTrackCount}</strong></label>
        <input id="atlas-target-count" type="range" min={MIN_TRACKS} max={MAX_TRACKS} value={targetTrackCount} onChange={(event) => { invalidatePreview(); setTargetTrackCount(Number(event.target.value)); }} />
        <button type="button" disabled={!canPreview} onClick={previewJourney}>{planning ? 'Planning…' : active ? 'Preview reroute' : 'Preview Journey'}</button>
        {preview && <button type="button" disabled={planning} onClick={startJourney}>{active ? 'Reroute Journey' : 'Start Journey'}</button>}
      </div>

      {error && <p className="atlas-journey-error" role="alert">{error}</p>}
      {latestEvent && <p className="atlas-journey-status" role="status">Latest route event: {latestEvent.type.replaceAll('-', ' ')}</p>}
      {displayedJourney && (
        <div className="atlas-journey-preview" aria-live="polite">
          <p><strong>{preview ? 'Preview ready' : 'Active Journey'}</strong> · Requested {requestedCount} tracks · Actual {actualCount} ordered stops</p>
          {shorter && <p className="atlas-shorter-notice">This route is shorter than requested because Atlas returned every available stop.</p>}
          <JourneyStops journey={displayedJourney} heading={preview ? 'Previewed ordered Journey stops' : 'Active ordered Journey stops'} />
        </div>
      )}
    </section>
  );
}
