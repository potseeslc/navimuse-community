import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ListMusic, LocateFixed, Map, Move, Pause, Play, Route, SkipBack, SkipForward, ZoomIn, ZoomOut } from 'lucide-react';
import { useAtlasJourney } from './AtlasJourneyContext.jsx';
import { atlasJourneyFallbackModel, atlasPersistedJourneyFallbackModel, dispatchAtlasFallbackQueueAction } from './atlasFallback.js';
import { atlasCameraModes, followAtlasCamera, overviewAtlasCamera, panAtlasCamera, zoomAtlasCamera } from './atlasCamera.js';
import { selectFullAtlasPopulation } from './atlasLod.js';
import { createAtlasProjectionStore } from './atlasProjectionStore.js';
import { ATLAS_RENDERER_INTERFACE_VERSION, createAtlasRendererHost } from './atlasRendererContract.js';
import { atlasPinRoles, atlasPopulationDiagnostics, journeyRoutePath, journeyRouteScreenSpan, mapWithConcurrencyProgress } from './atlasOverviewGeometry.js';
import { atlasProjectionManifest, atlasProjectionTile } from './services/atlasService.js';

const viewportFor = canvas => ({ width: canvas?.clientWidth || 800, height: canvas?.clientHeight || 440 });

export function AtlasOverview({ libraryOnly = false, initialCameraMode = atlasCameraModes.overview, isPlaying = false, onNext, onOpenJourneyTools, onOpenQueue, onPrevious, onTogglePlayback, queue, playHistoryQueueItemIds = [], rendererActive = true, transition = null }) {
  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  const storeRef = useRef(null);
  const tilesRef = useRef([]);
  const dragRef = useRef(null);
  const atlasJourney = useAtlasJourney();
  const { state } = atlasJourney;
  const persisted = state.persisted || null;
  const journey = libraryOnly ? null : state.preview || persisted?.journey || null;
  const identityKey = journey ? [journey.identity.projectionId, journey.identity.projectionVersion, journey.identity.projectionDigest].join('/') : libraryOnly ? 'library' : '';
  const [status, setStatus] = useState('idle');
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [error, setError] = useState('');
  const [manifest, setManifest] = useState(null);
  const [tiles, setTiles] = useState([]);
  const [population, setPopulation] = useState(null);
  const [rendererDiagnostics, setRendererDiagnostics] = useState({ drawnCount: 0, devicePixelRatio: 1 });
  const [rendererRevision, setRendererRevision] = useState(0);
  const [viewportRevision, setViewportRevision] = useState(0);
  const evidenceContextLossObservedRef = useRef(false);
  const evidenceContextLossRequestedRef = useRef(false);
  const rendererActiveRef = useRef(rendererActive);
  const [cameraMode, setCameraMode] = useState(initialCameraMode);
  const [exploreCamera, setExploreCamera] = useState(null);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const fallback = useMemo(() => !journey ? null : persisted && !state.preview
    ? atlasPersistedJourneyFallbackModel(persisted, { ...queue, completed: state.status === 'completed', skippedQueueItemIds: persisted.routeHistory.filter(event => event.type === 'skip' || event.type === 'dislike').map(event => event.queueItemId) }, playHistoryQueueItemIds)
    : atlasJourneyFallbackModel(journey, queue, playHistoryQueueItemIds), [journey, persisted, playHistoryQueueItemIds, queue, state.preview, state.status]);
  const pins = useMemo(() => atlasPinRoles(journey, fallback), [fallback, journey]);
  const currentStop = fallback?.stops.find(stop => stop.state === 'current' || stop.state === 'completed') || fallback?.stops[0] || null;
  const destinationStop = fallback?.stops.at(-1) || null;
  const selectedStop = fallback?.stops.find(stop => stop.stopId === selectedStopId) || currentStop;
  const atFinalCommittedStop = Boolean(fallback?.queueAttached && (fallback.completed || currentStop?.index === fallback.stops.length - 1));

  useEffect(() => {
    if (currentStop?.stopId) setSelectedStopId(currentStop.stopId);
  }, [currentStop?.stopId, journey?.journeyId]);

  useEffect(() => {
    if (!journey && !libraryOnly) { tilesRef.current = []; setStatus('idle'); setManifest(null); setTiles([]); setPopulation(null); setRendererDiagnostics({ drawnCount: 0, devicePixelRatio: 1 }); setError(''); return undefined; }
    const store = createAtlasProjectionStore({ fetchManifest: atlasProjectionManifest, fetchTile: atlasProjectionTile, maxTiles: 1024 });
    storeRef.current = store;
    const controller = new AbortController();
    tilesRef.current = [];
    setStatus('loading'); setError(''); setManifest(null); setTiles([]); setPopulation(null); setRendererDiagnostics({ drawnCount: 0, devicePixelRatio: 1 });
    store.loadManifest().then(next => {
      if (controller.signal.aborted) return;
      if (journey && (next.projectionId !== journey.identity.projectionId || next.projectionVersion !== journey.identity.projectionVersion || next.projectionDigest !== journey.identity.projectionDigest)) throw new Error('This Journey uses a different Atlas projection and needs revalidation.');
      setManifest(next);
    }).catch(loadError => {
      if (!controller.signal.aborted && loadError?.name !== 'AbortError') { setError(loadError.message || 'Sonic Atlas map is unavailable.'); setStatus('failed'); }
    });
    return () => { controller.abort(); store.dispose(); if (storeRef.current === store) storeRef.current = null; };
  }, [identityKey, recoveryAttempt]);

  useEffect(() => {
    if (!canvasRef.current || !manifest || status === 'failed') return undefined;
    let disposed = false;
    let host;
    import('./reglAtlasRenderer.js').then(({ ReglAtlasRenderer }) => {
      if (disposed) return;
      host = createAtlasRendererHost({ createRenderer: reportFailure => new ReglAtlasRenderer({ onFailure: reportFailure, onDiagnostics: setRendererDiagnostics }), onFailure: rendererError => { if (disposed) return; evidenceContextLossObservedRef.current = true; setError(rendererError.message || 'Sonic Atlas renderer failed.'); setStatus('failed'); } });
      hostRef.current = host;
      if (host.mount(canvasRef.current)) setRendererRevision(value => value + 1);
    }).catch(rendererError => { if (disposed) return; setError(rendererError.message || 'Sonic Atlas renderer failed.'); setStatus('failed'); });
    const visible = () => document.hidden || !rendererActiveRef.current ? host?.suspend() : host?.resume();
    document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; document.removeEventListener('visibilitychange', visible); host?.dispose(); hostRef.current = null; };
  }, [manifest, status === 'failed']);

  useEffect(() => {
    rendererActiveRef.current = rendererActive;
    if (!hostRef.current) return;
    if (rendererActive && !document.hidden) hostRef.current.resume();
    else hostRef.current.suspend();
  }, [rendererActive, rendererRevision]);

  useEffect(() => {
    if (!canvasRef.current || !['loading', 'partial', 'ready'].includes(status)) return undefined;
    const observer = new ResizeObserver(() => setViewportRevision(value => value + 1));
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [manifest, status]);

  const camera = useMemo(() => {
    if (!manifest || (!journey && !libraryOnly)) return null;
    const viewport = viewportFor(canvasRef.current);
    if (journey && cameraMode === atlasCameraModes.follow) return followAtlasCamera(manifest, journey, pins, viewport);
    if (cameraMode === atlasCameraModes.explore) return exploreCamera || overviewAtlasCamera(manifest, viewport);
    return overviewAtlasCamera(manifest, viewport);
  }, [cameraMode, exploreCamera, journey, manifest, pins, viewportRevision]);
  const routePath = useMemo(() => journeyRoutePath(journey, camera), [camera, journey]);
  const routeSpan = useMemo(() => journeyRouteScreenSpan(journey, camera), [camera, journey]);

  useEffect(() => {
    if (!manifest || !storeRef.current) return undefined;
    if (evidenceContextLossRequestedRef.current || evidenceContextLossObservedRef.current) return undefined;
    const store = storeRef.current;
    let cancelled = false;
    let selection;
    const failTiles = loadError => {
      if (cancelled) return;
      cancelled = true;
      setError(loadError.message || 'Sonic Atlas map is unavailable.');
      setStatus(tilesRef.current.length ? 'partial' : 'failed');
    };
    try {
      selection = selectFullAtlasPopulation(manifest);
      setPopulation(atlasPopulationDiagnostics(manifest, [], selection));
    } catch (loadError) {
      failTiles(loadError);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const progressive = new Array(selection.tiles.length);
      mapWithConcurrencyProgress(selection.tiles, 12, tile => store.loadTile({ lod: selection.lod, tileX: tile.tileX, tileY: tile.tileY }), (tile, index, completed, total) => {
        if (cancelled || evidenceContextLossRequestedRef.current || evidenceContextLossObservedRef.current) return;
        progressive[index] = tile;
        if (completed % 16 !== 0 && completed !== total) return;
        const loaded = progressive.filter(Boolean);
        tilesRef.current = loaded;
        setTiles(loaded);
        setPopulation(atlasPopulationDiagnostics(manifest, loaded, selection));
        setStatus('loading');
      }).then(loaded => {
        if (cancelled) return;
        if (evidenceContextLossRequestedRef.current || evidenceContextLossObservedRef.current) return;
        const diagnostics = atlasPopulationDiagnostics(manifest, loaded, selection);
        if (!diagnostics.complete) throw new Error(`Sonic Atlas full population is incomplete (${diagnostics.loadedCount}/${diagnostics.projectionCount}).`);
        tilesRef.current = loaded;
        setTiles(loaded);
        setPopulation(diagnostics);
        setError('');
        setStatus('ready');
      }).catch(loadError => {
        if (loadError?.name !== 'AbortError') failTiles(loadError);
      });
    }, 80);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [manifest]);

  useEffect(() => {
    if (!camera || !hostRef.current || !tiles.length || !['loading', 'partial', 'ready'].includes(status)) return;
    hostRef.current.render({ interfaceVersion: ATLAS_RENDERER_INTERFACE_VERSION, manifest, tiles, pins, journey, camera: { mode: cameraMode, view: camera } });
  }, [camera, cameraMode, journey, manifest, pins, rendererRevision, status, tiles]);

  useEffect(() => {
    if (status !== 'ready' || evidenceContextLossRequestedRef.current || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('navimuse-m7-webgl-loss') !== '1') return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (!hostRef.current?.requestContextLossForEvidence?.()) {
        if (attempts < 20) return;
        setError('Sonic Atlas WebGL context loss extension was unavailable in this WebView.');
        setStatus('failed');
        evidenceContextLossRequestedRef.current = true;
        window.clearInterval(timer);
        return;
      }
      evidenceContextLossRequestedRef.current = true;
      window.clearInterval(timer);
      window.setTimeout(() => {
        if (evidenceContextLossObservedRef.current) return;
        setError('Sonic Atlas WebGL context loss was requested, but this WebView did not emit webglcontextlost.');
        setStatus('failed');
      }, 2000);
    }, 250);
    return () => window.clearInterval(timer);
  }, [rendererRevision, status]);

  const selectMode = mode => {
    if (mode === cameraMode) return;
    if (mode === atlasCameraModes.explore && manifest) setExploreCamera(camera || overviewAtlasCamera(manifest, viewportFor(canvasRef.current)));
    if (mode !== atlasCameraModes.explore) setSelectedStopId('');
    setCameraMode(mode);
  };
  const zoom = factor => { if (manifest && camera) { setCameraMode(atlasCameraModes.explore); setExploreCamera(zoomAtlasCamera(camera, factor, manifest)); } };
  const stopPosition = stop => {
    const journeyStop = journey?.stops.find(candidate => candidate.stopId === stop?.stopId);
    if (!camera || !journeyStop) return null;
    const left = 50 + ((journeyStop.coordinate.x - camera.centerX) / camera.width) * 100;
    return {
      left: `clamp(8px, ${left}%, calc(100% - 128px))`,
      top: `${50 - ((journeyStop.coordinate.y - camera.centerY) / camera.height) * 100}%`
    };
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || status !== 'ready') return undefined;
    const onWheel = event => { event.preventDefault(); zoom(event.deltaY < 0 ? .86 : 1.16); };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [camera, manifest, status]);
  const onPointerDown = event => { if (cameraMode === atlasCameraModes.explore || libraryOnly) { if(libraryOnly) setCameraMode(atlasCameraModes.explore); dragRef.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); } };
  const onPointerMove = event => { if (!dragRef.current || !manifest || !camera) return; const next = panAtlasCamera(camera, event.clientX - dragRef.current.x, event.clientY - dragRef.current.y, viewportFor(canvasRef.current), manifest); dragRef.current = { x: event.clientX, y: event.clientY }; setExploreCamera(next); };
  const stopDragging = () => { dragRef.current = null; };
  const activateFallbackControl = (action, event) => {
    dispatchAtlasFallbackQueueAction(fallback, action, {
      previous: onPrevious,
      playPause: onTogglePlayback,
      next: onNext,
      openQueue: onOpenQueue
    }, event);
  };
  const startPreviewJourney = () => {
    setError('');
    try {
      atlasJourney.start();
    } catch (startError) {
      setError(startError.message || 'NaviMuse could not start this Journey.');
    }
  };
  const extendJourney = () => {
    setError('');
    atlasJourney.extend().catch(extensionFailure => {
      setError(extensionFailure?.atlas?.message || extensionFailure?.message || 'Sonic Atlas could not extend this Journey.');
    });
  };
  const stopJourney = () => {
    if (isPlaying) onTogglePlayback?.();
    atlasJourney.detach();
  };

  const retryMap = () => {
    evidenceContextLossObservedRef.current = false;
    evidenceContextLossRequestedRef.current = false;
    setRecoveryAttempt(value => value + 1);
  };

  if (libraryOnly) return <section className="atlas-overview sonic-library-map" aria-labelledby="library-map-title">
    <button className="sonic-map-back" type="button" onClick={onOpenJourneyTools}><ArrowLeft size={18}/> Back to Sonic</button>
    <header className="atlas-map-heading"><div><p className="eyebrow">YOUR LIBRARY, BY SOUND</p><h2 id="library-map-title">Library map</h2><p>Nearby points represent similar sounds. Drag to explore.</p></div></header>
    <p role="status">{status === 'ready' ? `${population?.loadedCount.toLocaleString()} analyzed tracks` : status === 'failed' ? 'Map unavailable' : status === 'partial' ? 'Some of your map is missing' : 'Loading your library map…'}</p>
    {error && <div className="sonic-map-error" role="alert"><p>{error}</p><button type="button" onClick={retryMap}>Retry map</button></div>}
    <div className={`atlas-overview-stage is-explore${status === 'failed' ? ' is-failed' : ''}`}>{status !== 'failed' && <canvas ref={canvasRef} aria-label="Visual map of your analyzed music library" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging}/>}</div>
    <div className="sonic-map-controls"><button type="button" disabled={status !== 'ready'} aria-label="Zoom in" onClick={()=>zoom(.72)}><ZoomIn size={18}/></button><button type="button" disabled={status !== 'ready'} aria-label="Zoom out" onClick={()=>zoom(1.38)}><ZoomOut size={18}/></button><button type="button" disabled={status !== 'ready'} onClick={()=>{setExploreCamera(null);setCameraMode(atlasCameraModes.overview);}}>Fit library</button></div>
  </section>;
  if (!journey) return null;
  return <section className="atlas-overview" aria-labelledby="atlas-overview-title">
    <div className="atlas-map-workspace">
      <header className="atlas-map-heading">
        <div><p className="eyebrow"><Route size={15}/> Sonic Atlas</p><h2 id="atlas-overview-title">{state.preview ? 'Journey Preview' : 'Active Journey'}</h2><p>The trail is ordered playback, shaped by similarity.</p></div>
        <span role="status">{status === 'loading' ? `Charting your library${population?.projectionCount ? ` · ${population.loadedCount.toLocaleString()}/${population.projectionCount.toLocaleString()}` : '...'}` : status === 'partial' ? 'Partial map · retry required' : status === 'failed' ? 'Map unavailable' : `${cameraMode} camera · ${population?.loadedCount.toLocaleString()} points`}</span>
      </header>
      <div className={`atlas-overview-stage is-${cameraMode}`}>
        {status !== 'failed' && <canvas
          ref={canvasRef}
          aria-label="Sonic Atlas point-cloud overview"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        />}
        {status === 'ready' && routePath && <svg className={`atlas-route-overlay${routeSpan.diagonal < 18 ? ' is-condensed' : ''}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="atlas-route-signal" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#5798ff"/><stop offset=".28" stopColor="#a7e7ff"/><stop offset=".52" stopColor="#fff1d7"/><stop offset=".72" stopColor="#d783e9"/><stop offset="1" stopColor="#ff644d"/></linearGradient></defs>
          <path className="atlas-route-haze" pathLength="100" d={routePath}/>
          <path className="atlas-route-glow" pathLength="100" d={routePath}/>
          <path className="atlas-route-core" pathLength="100" d={routePath}/>
          <path className="atlas-route-pulse" pathLength="100" d={routePath}/>
        </svg>}
        {status === 'ready' && [currentStop, destinationStop].filter((stop, index, values) => stop && values.findIndex(candidate => candidate.stopId === stop.stopId) === index).map(stop => {
          const position = stopPosition(stop);
          return position && <button
            className={`atlas-map-stop is-${stop.state}`}
            key={stop.stopId}
            style={position}
            type="button"
            onClick={() => { setSelectedStopId(stop.stopId); selectMode(atlasCameraModes.explore); }}
          ><span aria-hidden="true"/><strong>{stop.title}</strong><small>{stop.artist}</small></button>;
        })}
        {status === 'ready' && cameraMode === atlasCameraModes.explore && selectedStop && <aside className="atlas-track-popover" aria-label={`Selected track: ${selectedStop.title}`}>
          <div><span>{selectedStop.state === 'current' ? 'Now playing' : selectedStop.waypoint ? 'Journey waypoint' : 'Journey stop'}</span><h3>{selectedStop.title}</h3><p>{selectedStop.artist}</p></div>
          <button type="button" onClick={onOpenQueue}>Open in queue</button>
          <button type="button" onClick={() => selectMode(atlasCameraModes.follow)}>Follow playback</button>
          <span id="atlas-queue-action-reason" className="sr-only">Journey order is locked. Detach the Journey before adding tracks.</span>
          <button type="button" disabled aria-describedby="atlas-queue-action-reason">Play next</button>
          <button type="button" disabled aria-describedby="atlas-queue-action-reason">Add to queue</button>
        </aside>}
        <div className="atlas-camera-toolbar" aria-label="Atlas camera mode">
          <button type="button" className={cameraMode === atlasCameraModes.follow ? 'active' : ''} aria-pressed={cameraMode === atlasCameraModes.follow} onClick={() => selectMode(atlasCameraModes.follow)}><LocateFixed size={17}/>Follow</button>
          <button type="button" className={cameraMode === atlasCameraModes.overview ? 'active' : ''} aria-pressed={cameraMode === atlasCameraModes.overview} onClick={() => selectMode(atlasCameraModes.overview)}><Map size={17}/>Overview</button>
          <button type="button" className={cameraMode === atlasCameraModes.explore ? 'active' : ''} aria-pressed={cameraMode === atlasCameraModes.explore} onClick={() => selectMode(atlasCameraModes.explore)}><Move size={17}/>Explore</button>
          <span className="atlas-camera-zoom">
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={status !== 'ready'} onClick={() => zoom(.72)}><ZoomIn size={18}/></button>
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={status !== 'ready'} onClick={() => zoom(1.38)}><ZoomOut size={18}/></button>
          </span>
        </div>
        {onOpenJourneyTools && <button className="atlas-return-tools" type="button" onClick={onOpenJourneyTools}><ArrowLeft size={17}/> Journey tools</button>}
        {error && <div className="atlas-journey-error" role="alert"><p>{error} Playback and the ordered Journey remain available.</p>{['failed', 'partial'].includes(status) && <button type="button" onClick={retryMap}>Retry map</button>}</div>}
        {transition && ['starting', 'transitioning'].includes(transition.status) && <div className="atlas-transition-strip" role="status"><Route size={16}/><strong>{transition.mode === 'fixed-crossfade' ? 'Crossfade' : transition.mode === 'smart-blend' ? 'Smart Blend' : transition.mode === 'authored-gapless' ? 'Authored handoff' : 'Standard transition'}</strong><span>Transitioning to {transition.nextTitle}</span></div>}
        {manifest && <details className="atlas-map-diagnostics">
          <summary>Map diagnostics</summary>
          <dl>
            <div><dt>Projection</dt><dd>{population?.projectionCount?.toLocaleString() || manifest.pointCount.toLocaleString()}</dd></div>
            <div><dt>Loaded unique</dt><dd>{population?.loadedCount?.toLocaleString() || 0}</dd></div>
            <div><dt>Drawn</dt><dd>{rendererDiagnostics.drawnCount.toLocaleString()}</dd></div>
            <div><dt>Detail policy</dt><dd>Full population · LOD {population?.lod ?? '—'}</dd></div>
            <div><dt>Tiles</dt><dd>{population?.loadedTileCount || 0}/{population?.populatedTileCount || 0} populated · {population?.indexedTileCount || 0} indexed</dd></div>
            <div><dt>Pixel ratio</dt><dd>{rendererDiagnostics.devicePixelRatio.toFixed(2)}×</dd></div>
            <div><dt>Renderer</dt><dd>{status === 'failed' ? 'Degraded' : status === 'partial' ? 'Partial' : status === 'ready' ? 'Complete' : 'Loading'}</dd></div>
          </dl>
        </details>}
      </div>
    </div>
    {fallback && <section className="atlas-overview-fallback" aria-labelledby="atlas-fallback-title" aria-describedby="atlas-fallback-description atlas-fallback-state">
      <div className="atlas-fallback-heading">
        <div><h3 id="atlas-fallback-title">{fallback.title}</h3><p id="atlas-fallback-description">{fallback.description}</p></div>
        <span id="atlas-fallback-state" role="status">{state.status === 'extending' ? 'Extending Journey runway' : fallback.queueAttached ? 'Attached to current queue' : state.preview ? 'Preview ready' : 'Detached from current queue'}</span>
        {state.preview && <button className="atlas-start-journey" type="button" onClick={startPreviewJourney}><Play size={17} aria-hidden="true"/>Start Journey</button>}
      </div>
      <div className="atlas-fallback-controls" role="group" aria-label="Journey playback controls">
        <button type="button" disabled={!fallback.controls.previous || !onPrevious} onClick={event => activateFallbackControl('previous', event)}><SkipBack size={17} aria-hidden="true"/>Previous</button>
        <button type="button" disabled={!fallback.controls.playPause || !onTogglePlayback} onClick={event => activateFallbackControl('playPause', event)}>{isPlaying ? <Pause size={17} aria-hidden="true"/> : <Play size={17} aria-hidden="true"/>}{isPlaying ? 'Pause' : 'Play'}</button>
        <button type="button" disabled={!fallback.controls.next || !onNext} onClick={event => activateFallbackControl('next', event)}><SkipForward size={17} aria-hidden="true"/>Next</button>
        <button type="button" disabled={!fallback.controls.openQueue || !onOpenQueue} onClick={event => activateFallbackControl('openQueue', event)}><ListMusic size={17} aria-hidden="true"/>Open queue</button>
      </div>
      {atFinalCommittedStop && <div className="atlas-final-stop-actions" aria-labelledby="atlas-final-stop-title">
        <div><strong id="atlas-final-stop-title">Final committed stop</strong><span>{state.extensionError || 'Choose what NaviMuse should do next.'}</span></div>
        {state.extensionError && <button type="button" disabled={state.status === 'extending'} onClick={extendJourney}>Retry</button>}
        <button type="button" disabled={state.status === 'extending'} onClick={onOpenJourneyTools}>Change destination</button>
        <button type="button" disabled={state.status === 'extending'} onClick={extendJourney}>Continue similar music</button>
        <button type="button" onClick={stopJourney}>Stop</button>
      </div>}
      <ol>{fallback.stops.map(stop => <li key={stop.stopId} className={`is-${stop.state}`} aria-current={stop.state === 'current' ? 'step' : undefined}><span aria-hidden="true">{stop.index + 1}</span><strong>{stop.title}</strong><small>{stop.artist}</small><span className="sr-only">{stop.state === 'current' ? 'Current stop.' : stop.state === 'played' ? 'Played.' : stop.state === 'skipped' ? 'Skipped.' : stop.state === 'completed' ? 'Completed destination.' : stop.state === 'upcoming' ? 'Upcoming.' : 'Queue attachment unknown.'}{stop.waypoint ? ' Waypoint.' : ''}</span></li>)}</ol>
    </section>}
  </section>;
}
