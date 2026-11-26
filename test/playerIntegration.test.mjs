import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const appShellSource = await readFile(new URL('../src/AppShell.jsx', import.meta.url), 'utf8');
const playerChromeSource = await readFile(new URL('../src/playerChrome.jsx', import.meta.url), 'utf8');
const homeSurfaceSource = await readFile(new URL('../src/homeSurface.jsx', import.meta.url), 'utf8');
const librarySearchSource = await readFile(new URL('../src/librarySearchSurfaces.jsx', import.meta.url), 'utf8');
const sonicSettingsSource = await readFile(new URL('../src/sonicSettingsSurfaces.jsx', import.meta.url), 'utf8');
import {defaultAppSettings} from '../src/appSettings.js';
const apiClientSource = await readFile(new URL('../src/services/apiClient.js', import.meta.url), 'utf8');
const navidromeServiceSource = await readFile(new URL('../src/services/navidromeService.js', import.meta.url), 'utf8');
const settingsServiceSource = await readFile(new URL('../src/services/settingsService.js', import.meta.url), 'utf8');
const navigationStateSource = await readFile(new URL('../src/navigationState.js', import.meta.url), 'utf8');
const playerQueueSource = await readFile(new URL('../src/playerQueueState.js', import.meta.url), 'utf8');
const audioEngineSource = await readFile(new URL('../src/useAudioEngine.js', import.meta.url), 'utf8');
const queueOverlaySource = await readFile(new URL('../src/QueueOverlay.jsx', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('playback persistence flushes the final audio position when the page is hidden', () => {
  assert.match(mainSource, /window\.addEventListener\('pagehide', flushPlaybackPosition\)/);
  assert.match(mainSource, /positionForPersistence\(Number\(audioRef\.current\?\.currentTime/);
  assert.match(mainSource, /persistPlayerQueue\(position\)/);
  assert.match(mainSource, /persistPlayerQueue\(0\)/);
  assert.match(mainSource, /window\.removeEventListener\('pagehide', flushPlaybackPosition\)/);
});

test('partial bootstrap payloads cannot crash active-library selection', () => {
  assert.match(mainSource, /Array\.isArray\(navidrome\.musicFolders\) \? navidrome\.musicFolders : \[\]/);
});

test('main player orchestration keeps native ended events on stable callback chain', () => {
  assert.match(mainSource, /function useEventCallback\(callback\)/);
  assert.match(mainSource, /const playTrackEvent = useEventCallback\(playTrack\)/);
  assert.match(mainSource, /const advanceQueueEvent = useEventCallback\(advanceQueue\)/);
  assert.match(mainSource, /const advanceQueueEventRef = useRef\(\(\) => false\)/);
  assert.match(mainSource, /advanceQueueEventRef\.current = advanceQueueEvent;/);
  assert.match(mainSource, /if \(!advanceQueueEventRef\.current\('next', \{ fromEnded: true \}\)\)/);
  assert.match(mainSource, /playTrackEvent\(item\.song, item\.album, \{/);
  assert.doesNotMatch(mainSource, /playTrackRef/);
  assert.doesNotMatch(mainSource, /advanceQueueRef/);
});

test('pause after current owns the natural boundary without consuming manual navigation or repeat', () => {
  const pauseBranch = mainSource.match(/const pauseBoundary = pauseAfterCurrentBoundary\([\s\S]*?if \(endedAction === 'repeat'\)/)?.[0] || '';
  assert.match(pauseBranch, /naturalEnd: true/);
  assert.match(pauseBranch, /updatePlayerControls\(pauseBoundary\.controls\)/);
  assert.match(pauseBranch, /advanceQueueEventRef\.current\('next', \{ fromEnded: true, startPaused: true \}\)/);
  assert.match(pauseBranch, /dispatchTransport\(\{ type: 'pause-after-current'/);
  assert.match(pauseBranch, /return;/);
  assert.match(mainSource, /const startPaused = queueOptions\.startPaused === true;/);
  assert.match(mainSource, /if \(startPaused\) \{[\s\S]*?type: 'pause-after-current'[\s\S]*?return;/);
  assert.match(mainSource, /playTrackEvent\(plan\.item\.song, plan\.item\.album, \{[\s\S]*?startPaused: options\.startPaused === true/);
  assert.match(mainSource, /if \(playerControlsRef\.current\.pauseAfterCurrent \|\| !shouldAutoAdvanceQueue\(settingsRef\.current\)\) \{\n\s+cancelPreparedTransition\(\);\n\s+return false;/);
  assert.match(mainSource, /if \(playerControls\.pauseAfterCurrent \|\| !shouldAutoAdvanceQueue\(settingsRef\.current\)\) \{\n\s+cancelPreparedTransition\(\);\n\s+return;/);
});

test('manual Atlas skips and dislikes record queue-bound Journey events', () => {
  assert.match(mainSource, /atlasJourneyEventTypes\.skip, previousItem\.queueItemId, 'manual-next'/);
  assert.match(mainSource, /atlasJourneyEventTypes\.skip, skipped\.queueItemId, 'queue-selection'/);
  assert.match(mainSource, /atlasJourneyEventTypes\.dislike, item\.queueItemId, 'player-action'/);
  assert.match(mainSource, /advanceQueue\('next', \{ recordJourneySkip: false \}\)/);
  assert.match(mainSource, /options\.recordJourneySkip !== false/);
  assert.match(playerChromeSource, /Dislike and skip this Journey stop/);
  assert.match(playerChromeSource, /atlasJourneyActive &&/);
});
test('natural end of the final Atlas queue item records completion without blocking playback shutdown', () => {
  assert.match(mainSource, /endedItem\?\.atlas && endedQueue\.index === endedQueue\.items\.length - 1/);
  assert.match(mainSource, /completeAtlasJourneyRef\.current\(endedItem\.queueItemId\)/);
  assert.match(mainSource, /atlasJourneyActions\.complete\(queueItemId\)/);
  assert.match(mainSource, /Journey finished, but its completion could not be saved/);
});

test('main player source-change guard suppresses stale ended events without permanent lockout', () => {
  assert.match(mainSource, /shouldSuppressEndedEvent\(\{/);
  assert.match(mainSource, /skipNextEndedRequestRef\.current = queueOptions\.preparedTransition \? 0 : playRequestId/);
  assert.match(mainSource, /Safety net only: normal paths clear this on metadata, playing, or error/);
  assert.match(mainSource, /}, 120000\);/);
  assert.doesNotMatch(mainSource, /suppressEndedUntilRef/);
  assert.match(mainSource, /skipNextEndedTimerRef\.current = 0;/);
  assert.match(mainSource, /if \(endedAction === 'ignore'\) \{\n\s+skipNextEndedRequestRef\.current = 0;\n\s+return;/);
  assert.match(mainSource, /if \(endedAction === 'source-changed'\) \{[\s\S]*?dispatchTransport\(\{ type: 'error', requestId: playRequestRef\.current/);
  assert.match(mainSource, /const onPlaying = \(\) => \{\n\s+if \(audioRef\.current !== audio\) return;\n\s+if \(skipNextEndedRequestRef\.current === playRequestRef\.current\) \{\n\s+skipNextEndedRequestRef\.current = 0;/);
  assert.match(mainSource, /const onLoadedMetadata = \(\) => \{\n\s+if \(audioRef\.current !== audio\) return;\n\s+if \(skipNextEndedRequestRef\.current === playRequestRef\.current\) \{/);
  assert.match(mainSource, /const onError = \(\) => \{[\s\S]*?if \(audioRef\.current !== audio\) \{[\s\S]*?return;\n\s+\}\n\s+skipNextEndedRequestRef\.current = 0;/);
});

test('restored playback has a dedicated revision and one-action resume state', () => {
  assert.match(mainSource, /const restoreRequestId = playRequestRef\.current \+ 1;/);
  assert.match(mainSource, /dispatchTransport\(\{ type: 'restore', requestId: restoreRequestId \}\);/);
  assert.match(mainSource, /pendingRestorePositionRef\.current = restoredPosition;/);
  assert.match(mainSource, /dispatchTransport\(\{ type: 'request-play', requestId: playRequestRef\.current \}\);/);
  assert.match(mainSource, /dispatchTransport\(\{ type: 'playing', requestId: playRequestRef\.current \}\);/);
  assert.doesNotMatch(mainSource, /Queue restored\. Tap Play to continue\./);
});

test('main scroll handling is owned by app surfaces for mini-player compaction', () => {
  assert.match(mainSource, /const syncMiniPlayerForSurface = useCallback/);
  assert.match(mainSource, /const miniPlayerCompactScrollTop = 72;/);
  assert.match(mainSource, /const miniPlayerScrollDelta = 8;/);
  assert.match(mainSource, /const nextScrollTop = Math\.max\(0, surface\.scrollTop\);/);
  assert.match(mainSource, /if \(Math\.abs\(scrollDelta\) < miniPlayerScrollDelta\) return;/);
  assert.match(mainSource, /if \(nextScrollTop < miniPlayerCompactScrollTop \|\| scrollDelta < 0\) \{\n\s+setMiniPlayerCompact\(false\);/);
  assert.match(mainSource, /setMiniPlayerCompact\(true\);/);
  assert.match(mainSource, /const handleSurfaceScroll = useCallback/);
  assert.match(mainSource, /onSurfaceScroll=\{handleSurfaceScroll\}/);
  assert.doesNotMatch(mainSource, /miniPlayerScrollTimerRef/);
  assert.doesNotMatch(mainSource, /setTimeout\(\(\) => \{\n\s+setMiniPlayerCompact\(false\);/);
  assert.doesNotMatch(mainSource, /onScrollCapture=\{handleSurfaceScroll\}/);
  assert.doesNotMatch(mainSource, /querySelectorAll\('\\.home-surface, \\.screen-surface'\)/);
});

test('mobile shell reserves safe-area room for bottom controls', () => {
  const tabbarBlock = stylesSource.match(/\.tabbar \{[\s\S]*?\n\}/)?.[0] || '';
  const landscapePhoneFrameBlock = stylesSource.match(/@media \(orientation: landscape\) and \(max-height: 620px\) \{[\s\S]*?\.phone-frame \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(stylesSource, /--nm-tabbar-bottom: max\(12px, env\(safe-area-inset-bottom\)\);/);
  assert.match(stylesSource, /--nm-tabbar-height: 70px;/);
  assert.match(stylesSource, /--nm-mini-player-bottom: calc\(var\(--nm-tabbar-bottom\) \+ var\(--nm-tabbar-height\) \+ 12px\);/);
  assert.match(landscapePhoneFrameBlock, /--nm-tabbar-height: 62px;/);
  assert.match(tabbarBlock, /bottom: var\(--nm-tabbar-bottom\);/);
  assert.match(tabbarBlock, /height: var\(--nm-tabbar-height\);/);
  assert.match(tabbarBlock, /padding: 6px 0 8px;/);
  assert.match(stylesSource, /bottom: var\(--nm-mini-player-bottom\);/);
  assert.doesNotMatch(tabbarBlock, /bottom: 8px;/);
});

test('application shell adapts navigation and content grids for desktop and tablet', () => {
  assert.doesNotMatch(stylesSource, /--(?!nm-)[a-z][a-z0-9-]*/, 'all NaviMuse CSS custom properties use the M8 namespace');
  assert.match(appShellSource, /export function AppShell\(/);
  assert.match(appShellSource, /const tabs = \[/);
  assert.match(appShellSource, /\{ key: 'home', label: 'Home', icon: Home \}/);
  assert.match(appShellSource, /\{ key: 'library', label: 'Library', icon: Library, requiresUnlockedSession: true \}/);
  assert.match(appShellSource, /const desktopShellClass = \[[\s\S]*?'native-desktop-shell'[\s\S]*?hasInspector && 'has-inspector'[\s\S]*?hasPlayer && 'has-player'[\s\S]*?\.filter\(Boolean\)\.join\(' '\);/);
  assert.match(appShellSource, /className=\{desktopShellClass\}/);
  assert.match(appShellSource, /className="desktop-rail"/);
  assert.match(appShellSource, /className="desktop-surface"/);
  assert.match(appShellSource, /className="desktop-player-zone"/);
  assert.match(appShellSource, /className="desktop-inspector"/);
  assert.match(appShellSource, /surfaces\?\.\[activeTab\] \|\| null/);
  assert.match(appShellSource, /<nav className="tabbar" aria-label="Primary">/);
  assert.match(appShellSource, /className=\{`primary-nav-button\$\{activeTab === tab \? ' active' : ''\}`\}/);
  assert.match(appShellSource, /aria-label=\{label\}/);
  assert.doesNotMatch(mainSource, /<nav className="tabbar" aria-label="Primary">/);
  assert.match(stylesSource, /@media \(min-width: 900px\)/);
  assert.match(stylesSource, /--nm-desktop-rail-width: 76px;/);
  assert.match(stylesSource, /--nm-desktop-inspector-width: 336px;/);
  assert.match(stylesSource, /grid-template-areas: "rail surface" "transport transport";/);
  assert.match(stylesSource, /grid-template-columns: var\(--nm-desktop-rail-width\) minmax\(0, 1fr\);/);
  assert.match(stylesSource, /\.desktop-player-zone \.mini-player/);
  assert.match(stylesSource, /\.desktop-rail \.tabbar button:focus-visible \{[\s\S]*?outline: 3px solid var\(--nm-focus\);/);
  assert.match(stylesSource, /\.desktop-rail \.primary-nav-button:focus-visible \{[\s\S]*?outline: 3px solid var\(--nm-focus\);/);
  assert.match(stylesSource, /grid-auto-rows: 44px;/);
  assert.match(stylesSource, /repeat\(auto-fill, minmax\(180px, 1fr\)\)/);
  assert.match(stylesSource, /@media \(min-width: 600px\) and \(max-width: 899px\)/);
  assert.match(stylesSource, /repeat\(auto-fill, minmax\(160px, 1fr\)\)/);
  assert.match(stylesSource, /repeat\(auto-fill, minmax\(150px, 1fr\)\)/);
});

test('M8 stylesheet custom properties use one namespace', () => {
  const customProperties = [...stylesSource.matchAll(/--[a-z][a-z0-9-]*/g)].map(([property]) => property);
  assert.ok(customProperties.length > 0);
  assert.deepEqual(customProperties.filter((property) => !property.startsWith('--nm-')), []);
});

test('desktop shell keeps a contextual queue inspector separate from now playing', () => {
  assert.match(mainSource, /import \{ DesktopQueuePanel \} from '\.\/QueueOverlay\.jsx';/);
  assert.match(mainSource, /desktopQueuePanel=\{visibleQueue\.items\?\.length \? \(/);
  assert.match(mainSource, /<DesktopQueuePanel[\s\S]*?onQueueSelect=\{playQueueIndex\}[\s\S]*?queue=\{visibleQueue\}/);
  assert.match(appShellSource, /desktopQueuePanel/);
  assert.match(appShellSource, /<aside className="desktop-inspector"[^>]*aria-label="Playback queue inspector" role="complementary">[\s\S]*?\{desktopQueuePanel\}/);
  assert.match(appShellSource, /<footer className="desktop-player-zone" aria-label="Now playing controls" role="region">[\s\S]*?\{miniPlayer\}/);
  assert.match(stylesSource, /\.native-desktop-shell\.has-inspector[\s\S]*?grid-template-areas: "rail surface inspector" "transport transport transport";/);
  assert.match(queueOverlaySource, /export function DesktopQueuePanel\(/);
  assert.match(queueOverlaySource, /queueOverlayItems\(queue, controls\.shuffle, showPlayed\)/);
  assert.match(queueOverlaySource, /onQueueSelect\?\.\(itemIndex, queue, \{ recordHistory: true \}\)/);
  assert.match(stylesSource, /\.desktop-queue-panel \{/);
  assert.match(stylesSource, /\.desktop-queue-list \{/);
});

test('Home surface is extracted behind the app shell boundary', () => {
  assert.match(mainSource, /import \{ HomeSurface \} from '\.\/homeSurface\.jsx';/);
  assert.doesNotMatch(mainSource, /function HomeSurface\(/);
  assert.match(homeSurfaceSource, /export function HomeSurface\(/);
  assert.match(homeSurfaceSource, /function ShelfRow\(/);
  assert.doesNotMatch(homeSurfaceSource, /function ContinueListening\(/);
  assert.doesNotMatch(homeSurfaceSource, /className="continue-listening"/);
  assert.match(homeSurfaceSource, /onOpenQueue/);
  assert.match(homeSurfaceSource, /onTogglePlayback/);
  assert.match(homeSurfaceSource, /\[playlistRevision\]/);
  assert.match(mainSource, /<HomeSurface[\s\S]*?onOpenQueue=\{openQueue\}[\s\S]*?onTogglePlayback=\{togglePlayback\}[\s\S]*?playQueue=\{visibleQueue\}/);
  assert.match(mainSource, /<HomeSurface[\s\S]*?onSurfaceScroll=\{handleSurfaceScroll\}/);
});

test('Library and Search surfaces are extracted behind the app shell boundary', () => {
  assert.match(mainSource, /import \{ LibrarySurface, SearchSurface \} from '\.\/librarySearchSurfaces\.jsx';/);
  assert.doesNotMatch(mainSource, /function LibrarySurface\(/);
  assert.doesNotMatch(mainSource, /function SearchSurface\(/);
  assert.match(librarySearchSource, /export function LibrarySurface\(/);
  assert.match(librarySearchSource, /export function SearchSurface\(/);
  assert.match(librarySearchSource, /const searchInputRef = useRef\(null\)/);
  assert.match(librarySearchSource, /event\.key === '\/'/);
  assert.match(librarySearchSource, /event\.key === 'Escape'/);
  assert.match(librarySearchSource, /<kbd>\/<\/kbd>/);
  assert.match(stylesSource, /\.library-filter-bar,[\s\S]*?\.library-view-tools,[\s\S]*?\.search-box \{[\s\S]*?position: sticky;/);
  assert.match(mainSource, /<LibrarySurface[\s\S]*?protectedApiFetch=\{protectedApiFetch\}[\s\S]*?onSurfaceScroll=\{handleSurfaceScroll\}/);
  assert.match(mainSource, /<SearchSurface[\s\S]*?onSurfaceScroll=\{handleSurfaceScroll\}/);
});

test('Sonic and Settings surfaces are extracted behind the app shell boundary', () => {
  assert.match(mainSource, /import \{ SettingsSurface, SonicSurface \} from '\.\/sonicSettingsSurfaces\.jsx';/);
  assert.doesNotMatch(mainSource, /function SonicSurface\(/);
  assert.doesNotMatch(mainSource, /function SettingsSurface\(/);
  assert.match(sonicSettingsSource, /export function SonicSurface\(/);
  assert.match(sonicSettingsSource, /export function SettingsSurface\(/);
  assert.match(sonicSettingsSource, /function DiscoveryResults\(/);
  assert.match(mainSource, /<SonicSurface[\s\S]*?onSurfaceScroll=\{handleSurfaceScroll\}/);
  assert.match(mainSource, /<SettingsSurface[\s\S]*?onSurfaceScroll=\{handleSurfaceScroll\}/);
  assert.match(mainSource, /transitionDiagnostic=\{transitionDiagnostic\}/);
  assert.match(sonicSettingsSource, /Playback adapter[\s\S]*?Web prepared handoff/);
  assert.match(sonicSettingsSource, /Authored gapless[\s\S]*?Unverified · standard boundary/);
  assert.match(sonicSettingsSource, /transitionDiagnostic\.queueRevision/);
  assert.match(stylesSource, /\.transition-diagnostic/);
});

test('app navigation state is deterministic and deep-linkable', () => {
  assert.match(mainSource, /import \{ navigationUrl, readBrowserNavigationState, saveAlbumSortPreference \} from '\.\/navigationState\.js';/);
  assert.match(navigationStateSource, /export const primarySurfaceKeys = \['home', 'library', 'search', 'sonic', 'settings', 'listenbrainz'\]/);
  assert.match(mainSource, /const initialNavigationState = useMemo\(\(\) => readBrowserNavigationState\(accountStorage\), \[accountStorage\]\)/);
  assert.match(mainSource, /const \[activeTab, setActiveTab\] = useState\(offline\?'library':initialNavigationState\.activeTab\)/);
  assert.match(mainSource, /window\.addEventListener\('popstate', handlePopState\)/);
  assert.match(mainSource, /const nextUrl = navigationUrl\(window\.location\.href, \{/);
  assert.match(mainSource, /window\.history\.replaceState\(window\.history\.state, '', nextUrl\)/);
  assert.match(navigationStateSource, /url\.searchParams\.set\('view', activeTab\)/);
  assert.match(navigationStateSource, /url\.searchParams\.delete\('tab'\)/);
});

test('library browse results use incremental rendering with a persistent keyboard control', () => {
  assert.match(librarySearchSource, /function LibraryBrowseList\(\{ emptyLabel, items, kind, onOpen, page, loadingMore, pageError, onLoadMore, resultIdentity \}\)/);
  assert.match(librarySearchSource, /const \[visibleCount, setVisibleCount\] = useState\(libraryBrowsePageSize\)/);
  assert.match(librarySearchSource, /const visibleItems = visibleLibraryItems\(items, visibleCount\)/);
  assert.match(librarySearchSource, /Showing \{visibleItems\.length\} of \{items\.length\}/);
  assert.match(librarySearchSource, /className="library-browse-more"/);
  assert.match(librarySearchSource, /nextVisibleLibraryCount\(current, items\.length\)/);
  assert.match(stylesSource, /\.library-browse-more:focus-visible/);
});

test('Library is one filtered surface with complete album browse and album-only view controls', () => {
  assert.match(mainSource, /const \[libraryBrowseKey, setLibraryBrowseKey\] = useState\(initialNavigationState\.libraryBrowseKey\)/);
  assert.match(librarySearchSource, /\{ key: 'artists', label: 'Artists' \}[\s\S]*?\{ key: 'albums', label: 'Albums' \}[\s\S]*?\{ key: 'playlists', label: 'Playlists' \}[\s\S]*?\{ key: 'genres', label: 'Genres' \}/);
  assert.match(librarySearchSource, /browseKey === 'albums'[\s\S]*?library-view-tools/);
  assert.match(librarySearchSource, /if \(browseKey === 'albums'\) params\.sort = albumSort;/);
  assert.match(librarySearchSource, /navidromeLibraryBrowse\(browseKey, params, \{ signal: controller\.signal \}\)/);
  assert.match(librarySearchSource, /const albums = useMemo\([\s\S]*?normalizedAlbums\(browseData\.albums, \[\], settings\?\.library\?\.artworkSize\)[\s\S]*?\[browseData\.albums, settings\?\.library\?\.artworkSize\]/);
  assert.match(librarySearchSource, /visibleLibraryItems\(albums, visibleCount\)/);
  assert.match(librarySearchSource, /aria-pressed=\{browseKey === filter\.key\}/);
  assert.doesNotMatch(librarySearchSource, /key: 'songs', label: 'Songs'/);
});

test('main player share payload includes a track-specific deep link', () => {
  assert.match(mainSource, /const shareUrl = new URL\(window\.location\.href\)/);
  assert.match(mainSource, /shareUrl\.searchParams\.set\('track', nowPlaying\.id\)/);
  assert.match(mainSource, /const sharedTrackId = new URL\(window\.location\.href\)\.searchParams\.get\('track'\)/);
  assert.match(mainSource, /navidromeSong\(sharedTrackId\)/);
  assert.match(navidromeServiceSource, /\/api\/navidrome\/songs\/\$\{encodeURIComponent\(songId\)\}/);
  assert.match(mainSource, /playTrackEvent\(payload\.song, albumFromSong\(payload\.song\), \{ queueSongs: \[payload\.song\], queueIndex: 0 \}\)/);
  assert.match(mainSource, /restoredUrl\.searchParams\.delete\('track'\)/);
  assert.match(mainSource, /const shareText = `\$\{nowPlaying\.title\} by \$\{nowPlaying\.artist\} from \$\{nowPlaying\.album\} in NaviMuse\.`/);
  assert.match(mainSource, /await shareTrackDetails\(/);
  assert.match(mainSource, /copy:copyTextToClipboard,isCurrent/);
  assert.match(mainSource, /url: shareUrl\.href/);
});

test('now-playing metadata retains a stable artist identity for Artist DJ actions', () => {
  assert.match(mainSource, /artistId: song\.artistId \|\| song\.albumArtistId \|\| album\?\.artistId \|\| album\?\.albumArtistId \|\| ''/);
  assert.match(mainSource, /const startCurrentArtistDj = useCallback/);
  assert.match(mainSource, /startArtistDj\(\{ id: artistId, name: artistName \}, `\$\{artistName\} Artist DJ`\)/);
});

test('main player callbacks use current refs and direct control patches', () => {
  assert.match(mainSource, /const settingsRef = useRef\(defaultSettingsState\.preferences\)/);
  assert.match(mainSource, /useLayoutEffect\(\(\) => \{\n\s+settingsRef\.current = settingsState\.preferences;/);
  assert.match(mainSource, /Each deck listener is stable\. Standby events stay silent until promotion/);
  assert.match(mainSource, /const preferences = settingsRef\.current \|\| defaultAppSettings/);
  assert.match(mainSource, /settingsRef is synchronized in a layout effect so playback uses fresh settings/);
  assert.match(mainSource, /if \(playQueueRef\.current !== queue\) return false;/);
  assert.match(mainSource, /\.filter\(\(queueSong\) => queueSong\?\.id\)\n\s+\.map\(\(queueSong\) => queueItem\(queueSong, albumFromSong\(queueSong\)\)\)/);
  assert.doesNotMatch(mainSource, /settingsState\.preferences \|\| settingsRef\.current/);
  assert.match(mainSource, /updatePlayerControls\(\{ panel: '' \}\);/);
  assert.match(mainSource, /}, \[activeLibrary\?\.name, dispatchTransport, replaceQueue, settleDeckGains, updatePlayerControls\]\);/);
  assert.match(mainSource, /\} = usePlayerQueueState\(defaultPlayerControls, \{storage: accountStorage\}\);/);
  assert.doesNotMatch(mainSource, /const \[playQueue, setPlayQueue\] = useState/);
  assert.doesNotMatch(mainSource, /const \[playerControls, setPlayerControls\] = useState/);
  assert.match(playerChromeSource, /const setControlState = \(patch\) => onControlsChange\?\.\(patch\);/);
});

test('queue Escape and selection dismiss only the queue layer', () => {
  assert.match(playerChromeSource, /if \(inspectorOpen\) return;\n\s+event\.preventDefault\(\);\n\s+closeSheet\(\);/);
  assert.match(playerChromeSource, /const selectQueueItem = useCallback/);
  assert.match(playerChromeSource, /preservePlayer: true/);
  assert.match(playerChromeSource, /onQueueSelect=\{selectQueueItem\}/);
  assert.doesNotMatch(queueOverlaySource, /onQueueSelect\?\.\([\s\S]*?\);\n\s+onClose\(\);/);
});

test('Sonic Radio playlist saves use the protected write boundary', () => {
  assert.match(mainSource, /saveSonicRadioPlaylist\(protectedApiFetch, name, songIds\)/);
  assert.doesNotMatch(mainSource, /saveSonicRadioPlaylist\(protectedWriteFetch, name, songIds\)/);
});

test('playback reporting uses the protected scrobble transport', () => {
  assert.match(mainSource, /import \{ sendPlaybackReport \} from '\.\/playbackReports\.js';/);
  assert.match(mainSource, /sendPlaybackReport\(protectedApiFetch, id, false\)/);
  assert.match(mainSource, /sendPlaybackReport\(protectedApiFetch, id, true\)/);
  assert.doesNotMatch(mainSource, /protectedWriteFetch/);
});

test('player queue ownership is extracted while main keeps audio orchestration', () => {
  assert.match(mainSource, /import \{ usePlayerQueueState \} from '\.\/playerQueueState\.js';/);
  assert.match(mainSource, /const plan = advancePlayerQueue\(direction, options\);/);
  assert.match(mainSource, /playTrackEvent\(plan\.item\.song, plan\.item\.album, \{/);
  assert.match(playerQueueSource, /export function usePlayerQueueState\(defaultControls, options = \{\}\)/);
  assert.match(playerQueueSource, /const replaceQueue = useCallback/);
  assert.match(playerQueueSource, /const updateControls = useCallback/);
  assert.match(playerQueueSource, /const selectQueueIndex = useCallback/);
  assert.match(playerQueueSource, /const advanceQueue = useCallback/);
  assert.match(playerQueueSource, /queueAdvancePlan\(sourceQueue, controlsRef\.current/);
  assert.match(playerQueueSource, /queueSelectionHistory\(sourceQueue, index, historyRef\.current/);
  assert.match(playerQueueSource, /queueSelectionShufflePool\(/);
  assert.doesNotMatch(mainSource, /const playHistoryRef = useRef/);
  assert.doesNotMatch(mainSource, /const shufflePoolRef = useRef/);
  assert.match(mainSource, /const journeyExtensionAllowed = journeyExtensionEnabled\(settingsRef\.current\);[\s\S]*?const journeyMayResume = journeyExtensionAllowed[\s\S]*?&& sonicState\.status === 'replenishing';/);
  assert.match(mainSource, /resumeAfterSonicAppendRef\.current = journeyMayResume[\s\S]*?\? Date\.now\(\)[\s\S]*?: 0;/);
  assert.match(mainSource, /trackFeedbackSaveTimerRef\.current = window\.setTimeout\(\(\) => \{\n\s+trackFeedbackSaveTimerRef\.current = 0;/);
  assert.match(mainSource, /const feedbackState = nextTrackFeedbackState\(/);
  assert.match(mainSource, /Keep the ref as the immediate source of truth so rapid feedback taps compose/);
  assert.match(mainSource, /const advanceQueueEvent = useEventCallback\(advanceQueue\);/);
  assert.match(mainSource, /const playTrackEvent = useEventCallback\(playTrack\);/);
  assert.match(mainSource, /activeRadioProgressIds\(playQueueRef\.current, getSonicRadioState\(\), nowPlaying\.id\)/);
});

test('main player feedback sync and waveform disable behavior are explicit', () => {
  assert.match(mainSource, /Track feedback is cached locally for responsiveness and synced to Navidrome/);
  assert.match(mainSource, /const trackFeedbackSyncRequestRef = useRef\(0\)/);
  assert.match(mainSource, /const trackFeedbackSyncAbortRef = useRef\(null\)/);
  assert.match(mainSource, /const previousTrackFeedback = trackFeedbackLatestRef\.current;/);
  assert.match(mainSource, /trackFeedbackSyncAbortRef\.current\?\.abort\(\);/);
  assert.match(mainSource, /await syncTrackFeedback\(songId, nextFeedback, syncController\.signal\);/);
  assert.match(mainSource, /if \(error\.name === 'AbortError'\) return;/);
  assert.match(mainSource, /trackFeedbackLatestRef\.current = previousTrackFeedback;\n\s+setTrackFeedback\(previousTrackFeedback\);/);
  assert.doesNotMatch(mainSource, /Track rating cleared and synced with Navidrome/);
  assert.match(mainSource, /Track feedback sync failed; restored previous feedback/);
  assert.doesNotMatch(mainSource, /Radio feedback is saved locally in this browser/);
  assert.match(mainSource, /saveRadioFeedback : navidromeFeedback/);
  assert.doesNotMatch(mainSource, /Favorites and ratings sync with Navidrome for library tracks/);
  assert.match(mainSource, /function canSyncTrackFeedback\(songId\)/);
  assert.match(mainSource, /function syncTrackFeedback\(songId, feedback, signal\)/);
  assert.match(mainSource, /const trackFeedbackStorageWarningRef = useRef\(false\)/);
  assert.match(stylesSource, /\.wave-row\.no-waveform \.progress-rail \{\n\s+height: 44px;/);
  assert.doesNotMatch(playerChromeSource, /fallback="line"/);
  assert.match(mainSource, /const trackFeedbackSaveTimerRef = useRef\(0\)/);
  assert.match(mainSource, /trackFeedbackSaveTimerRef\.current = window\.setTimeout/);
  assert.match(mainSource, /if \(saveTrackFeedback\(trackFeedbackLatestRef\.current, accountStorage\)\) \{\n\s+trackFeedbackStorageWarningRef\.current = false;/);
  assert.match(mainSource, /} else if \(!trackFeedbackStorageWarningRef\.current\) \{/);
  assert.match(playerChromeSource, /const disabledRef = useRef\(disabled\)/);
  assert.match(playerChromeSource, /disabledRef\.current = disabled/);
  assert.match(playerChromeSource, /if \(!disabled\) return;\n\s+scrubProgressRef\.current = null;/);
  assert.match(playerChromeSource, /seekEnabledRef\.current && !disabledRef\.current/);
});

test('protected BFF and expired media sessions route the browser back to the unlock screen', () => {
  assert.match(mainSource, /const protectedApiFetch = apiFetch;/);
  assert.match(apiClientSource, /response\.status === 401/);
  assert.match(mainSource, /function sessionNeedsUnlock\(payload\)/);
  assert.match(mainSource, /Boolean\(payload\?\.adminConfigured\) && !payload\?\.authenticated/);
  assert.match(apiClientSource, /new CustomEvent\(sessionRequiredEvent\)/);
  assert.match(mainSource, /window\.addEventListener\('navimuse:session-required', showUnlock\)/);
  assert.match(mainSource, /setActiveTab\('settings'\)/);
  assert.match(mainSource, /const onError = \(\) => \{[\s\S]*?setPlaybackMessage\('This track could not be loaded\. Check your connection and try again\.'\);[\s\S]*?settingsService\.settingsSession\(\)/);
  assert.match(mainSource, /if \(sessionNeedsUnlock\(session\)\) \{/);
  assert.match(mainSource, /import \{ AppShell \} from '\.\/AppShell\.jsx';/);
  assert.match(appShellSource, /const bindPrimaryAudio = useCallback\(\(node\) => bindAudioDeck\(0, node\), \[bindAudioDeck\]\)/);
  assert.match(appShellSource, /const bindStandbyAudio = useCallback\(\(node\) => bindAudioDeck\(1, node\), \[bindAudioDeck\]\)/);
  assert.match(appShellSource, /<audio ref=\{bindPrimaryAudio\} preload="none" \/>/);
  assert.match(appShellSource, /<audio ref=\{bindStandbyAudio\} preload="auto" \/>/);
  assert.doesNotMatch(appShellSource, /<audio[^>]*onError=/);
});

test('audio listeners attach when authenticated shell decks mount after bootstrap', () => {
  assert.match(audioEngineSource, /const \[audioDeckNodes, setAudioDeckNodes\] = useState\(\[null, null\]\)/);
  assert.match(audioEngineSource, /setAudioDeckNodes\(\(current\) => \{/);
  assert.match(mainSource, /const detachListeners = audioDeckNodes\.map\(\(audio\) => attachAudioListeners\(audio\)\)/);
  assert.match(mainSource, /\}, \[audioDeckNodes, dispatchTransport\]\);/);
});

test('Pocket ID sessions replace password controls and expose passkey sign-in and local sign-out', () => {
  assert.match(mainSource, /authMode: payload\.authMode === 'oidc' \? 'oidc' : 'password'/);
  assert.match(mainSource, /window\.location\.assign\(apiNavigationUrl\(settingsSession\.loginUrl \|\| '\/api\/auth\/login'\)\)/);
  assert.match(mainSource, /import \{ apiFetch, apiNavigationUrl, nativeFirstPartyBffRedirectTarget \} from '\.\/services\/apiClient\.js';/);
  assert.match(mainSource, /settingsService\.logoutAdmin\(settingsSession\.authMode\)/);
  assert.match(settingsServiceSource, /authMode === 'oidc' \? '\/api\/auth\/logout' : '\/api\/settings\/logout'/);
  assert.match(sonicSettingsSource, /oidcMode \? 'Sign In with Pocket ID'/);
  assert.match(sonicSettingsSource, /oidcMode \? 'Sign Out' : 'Lock Settings'/);
  assert.match(sonicSettingsSource, /!oidcMode && !settingsSession\.adminConfigured/);
  assert.match(sonicSettingsSource, /!oidcMode && <label className="settings-field">/);
  assert.match(mainSource, /currentUrl\.searchParams\.get\('auth_error'\)/);
});

test('the PWA registers a versioned service worker so edge caches cannot pin stale app logic', () => {
  assert.match(mainSource, /navigator\.serviceWorker\.register\('\/sw-v4\.js', \{ updateViaCache: 'none' \}\)/);
  assert.doesNotMatch(mainSource, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
});

test('player quality row does not include the decorative rating star', () => {
  const qualityRow = playerChromeSource.match(/<div className="quality-row">[\s\S]*?<\/div>/)?.[0] || '';
  assert.doesNotMatch(qualityRow, /Source|requested|sourceSignal|streamRequest/);
  assert.match(qualityRow, /receivedStreamSummary\(remoteOutput \? nowPlaying\.delivery : playbackState\?\.delivery\)/);
  assert.doesNotMatch(qualityRow, /nowPlaying\.quality/);
  assert.doesNotMatch(qualityRow, /<Star/);
});

test('shelf drag suppresses accidental card clicks on touch movement', () => {
  assert.match(homeSurfaceSource, /drag\.locked = Math\.abs\(deltaX\) > Math\.abs\(deltaY\) \? 'x' : 'y';\n\s+drag\.dragging = true;\n\s+suppressClickRef\.current = true;/);
  assert.match(homeSurfaceSource, /if \(drag\.locked === 'x'\) \{\n\s+shelf\.setPointerCapture\?\.\(event\.pointerId\);/);
  assert.match(homeSurfaceSource, /if \(drag\.locked === 'x'\) \{\n\s+shelf\?\.releasePointerCapture\?\.\(event\.pointerId\);/);
});

test('discovery result replacement avoids smooth scroll jank on mobile', () => {
  assert.doesNotMatch(mainSource, /scrollIntoView/);
});

test('playback seek state prefers browser seekable ranges when available', () => {
  assert.match(mainSource, /let seekableWindow = null;/);
  assert.match(mainSource, /const syncDuration = seekableWindow\?\.duration \|\| knownDuration;/);
  assert.match(mainSource, /const syncCurrentTime = seekableWindow/);
  assert.match(mainSource, /seekableWindow \? 0 : audio\.duration/);
  assert.match(audioEngineSource, /audio\?\.seekable\?\.length > 0 \? 0 : audio\?\.duration/);
  assert.match(audioEngineSource, /displayCurrentTime = Math\.max\(0, seekState\.currentTime - audio\.seekable\.start\(0\)\)/);
  assert.match(audioEngineSource, /currentTime: displayCurrentTime/);
});

test('repeat checks seek support before rewinding the current stream', () => {
  assert.match(mainSource, /const repeatSeekState = seekTimeFromRatio\(0, audio\.duration, expectedDurationRef\.current, audio\.seekable\);/);
  assert.match(mainSource, /if \(!canSeekWithState\(repeatSeekState, audio\)\) \{/);
  assert.match(mainSource, /audio\.currentTime = repeatSeekState\.currentTime;/);
});

test('manual replay clears stale ended suppression before audio play', () => {
  assert.match(mainSource, /const resumePlayback = \(\) => \{[\s\S]*?if \(transportRef\.current\.status === 'restored' \|\| !audio\.currentSrc \|\| audio\.readyState === 0\) \{[\s\S]*?const currentItem = playQueueRef\.current\.items\?\.\[playQueueRef\.current\.index\];[\s\S]*?const restoredStreamPath = playbackStreamForCurrentQueueItem\(currentItem, streamUrl\(nowPlaying\.id, preferences\.streaming\)\);[\s\S]*?audio\.src = restoredStreamPath;[\s\S]*?skipNextEndedRequestRef\.current = 0;\n\s+if \(skipNextEndedTimerRef\.current\) \{/);
});

test('waveform pointer seek commits once through the window cleanup path', () => {
  const endSeekBlock = playerChromeSource.match(/const endSeek = \(event\) => \{[\s\S]*?\n  \};\n  const keySeek/)?.[0] || '';
  assert.match(playerChromeSource, /const commitPointerSeek = \(finalProgress, event\) => \{/);
  assert.match(endSeekBlock, /commitPointerSeek\(nextProgress, event\);/);
  assert.doesNotMatch(endSeekBlock, /seekHandlerRef\.current\?\./);
});

test('waveform keyboard seek batches repeated key presses', () => {
  assert.match(playerChromeSource, /const scheduleKeyboardSeek = \(nextProgress\) => \{/);
  assert.match(playerChromeSource, /keyboardSeekTimerRef\.current = window\.setTimeout/);
  const keySeekBlock = playerChromeSource.match(/const keySeek = \(event\) => \{[\s\S]*?\n  \};\n  const content/)?.[0] || '';
  assert.match(keySeekBlock, /scheduleKeyboardSeek\(nextProgress\);/);
  assert.doesNotMatch(keySeekBlock, /onSeek\(nextProgress\);/);
});

test('full-card queue preserves complete queue indices and a now-playing row', () => {
  assert.match(mainSource, /shufflePoolCount,/);
  assert.match(playerQueueSource, /const \[shufflePoolCount, setShufflePoolCount\] = useState\(shufflePoolRef\.current\.length\)/);
  assert.match(playerChromeSource, /controlState\.shuffle \? queueItems\.length > 1/);
  assert.match(queueOverlaySource, /controls\.shuffle \? 'Shuffling from' : 'Playing from'/);
  assert.match(queueOverlaySource, /source\.label/);
  assert.match(queueOverlaySource, /\.map\(\(item, itemIndex\) => \(\{ item, itemIndex, current: itemIndex === index \}\)\)/);
  assert.match(queueOverlaySource, /itemIndex >= index/);
  assert.match(queueOverlaySource, /Show'\} \{playedCount\} played/);
  assert.doesNotMatch(queueOverlaySource, /\.slice\(index \+ 1, index \+ 6\)/);
  assert.match(queueOverlaySource, /current: true/);
  assert.match(queueOverlaySource, /className=\{current \? 'current' : ''\}/);
  assert.match(queueOverlaySource, /onQueueSelect\?\.\(itemIndex, queue, \{ recordHistory: true \}\)/);
  assert.match(queueOverlaySource, /aria-current=\{current \? 'true' : undefined\}/);
  assert.match(queueOverlaySource, /disabled=\{current\}/);
});

test('player inspectors retain compact modal semantics and desktop access with deterministic focus', () => {
  assert.match(playerChromeSource, /className="player-content" inert=\{\(inspectorOpen && !desktopInspector\) \|\| \(actionsOpen/);
  assert.match(queueOverlaySource, /className="queue-overlay"/);
  assert.match(queueOverlaySource, /role=\{modal \? 'dialog' : 'region'\}/);
  assert.match(queueOverlaySource, /aria-modal=\{modal \? true : undefined\}/);
  assert.match(queueOverlaySource, /closeRef\.current\?\.focus\(\)/);
  assert.match(playerChromeSource, /setQueueEntry\(queueEntryRef, actionTriggerRef\.current\)/);
  assert.match(playerChromeSource, /setQueueEntry\(queueEntryRef, queueTriggerRef\.current\)/);
  assert.match(mainSource, /setQueueEntry\(queueEntryRef, event\?\.currentTarget \|\| document\.activeElement, !playerOpen\)/);
  assert.match(playerChromeSource, /finishQueueEntry\(queueEntryRef, \{/);
  assert.match(queueOverlaySource, /if \(event\.key !== 'Escape'\) return;/);
  assert.match(queueOverlaySource, /if \(!modal \|\| event\.key !== 'Tab'\) return;/);
  assert.match(queueOverlaySource, /document\.activeElement === first/);
  assert.match(queueOverlaySource, /document\.activeElement === last/);
  assert.match(stylesSource, /\.queue-overlay \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?grid-template-rows: auto auto minmax\(0, 1fr\) auto;/);
  assert.match(stylesSource, /\.queue-overlay-list \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/);
});

test('track actions use an anchored accessible menu with complete dismissal behavior', () => {
  assert.match(playerChromeSource, /className="player-actions-anchor"/);
  assert.match(playerChromeSource, /aria-haspopup="menu"/);
  assert.match(playerChromeSource, /aria-expanded=\{actionsOpen\}/);
  assert.match(playerChromeSource, /role="menu"/);
  assert.match(playerChromeSource, /role="menuitem"/);
  assert.match(playerChromeSource, /className="player-notice" role="status" aria-live="polite"/);
  assert.doesNotMatch(playerChromeSource, /Start a Journey/);
  assert.match(playerChromeSource, /<button type="button" role="menuitem" onClick=\{startJourneyFromActions\}><Sparkles size=\{19\}\/>Start Track Journey<\/button>/);
  assert.match(playerChromeSource, /nowPlaying\.artistId && <button type="button" role="menuitem" onClick=\{startArtistDjFromActions\}><Sparkles size=\{19\}\/>Start Artist DJ from this artist<\/button>/);
  assert.match(playerChromeSource, /<button type="button" role="menuitem" onClick=\{showQueueFromActions\}><ListMusic size=\{19\}\/>Open Queue<\/button>/);
  assert.match(playerChromeSource, /<button type="button" role="menuitem" onClick=\{stopJourneyFromActions\}><Pause size=\{19\}\/>Stop Journey<\/button>/);
  assert.match(playerChromeSource, /Save Journey as Playlist/);
  assert.match(playerChromeSource, /Dismiss Journey/);
  assert.doesNotMatch(playerChromeSource, /className="sonic-radio-controls"/);
  assert.doesNotMatch(stylesSource, /\.sonic-radio-controls/);
  assert.match(playerChromeSource, /document\.addEventListener\('pointerdown', dismissOutside, true\)/);
  assert.match(playerChromeSource, /document\.addEventListener\('keydown', dismissWithEscape, true\)/);
  assert.match(playerChromeSource, /if \(event\.key !== 'Escape'\) return;/);
  assert.match(playerChromeSource, /event\.stopImmediatePropagation\(\);/);
  assert.match(playerChromeSource, /actionTriggerRef\.current\?\.focus\(\)/);
  assert.match(playerChromeSource, /setQueueEntry\(queueEntryRef, actionTriggerRef\.current\)/);
  assert.match(playerChromeSource, /const \[actionsOpen, setActionsOpen\] = useState\(false\)/);
  assert.doesNotMatch(playerChromeSource, /controlState\.panel === 'actions'/);
  assert.match(playerChromeSource, /if \(event\.key === 'ArrowDown'\)/);
  assert.match(playerChromeSource, /if \(event\.key === 'ArrowUp'\)/);
  assert.match(playerChromeSource, /inert=\{!active\}/);
  assert.match(playerChromeSource, /actionsPresent && createPortal/);
  assert.match(playerChromeSource, /onScroll=\{\(\) => actionsOpen && closeActionMenu\(actionMenuRef\.current\?\.contains\(document\.activeElement\)\)\}/);
  assert.match(playerChromeSource, /document\.addEventListener\('keydown', closeWithEscape\)/);
  assert.match(stylesSource, /\.player-action-panel\.actions \{[\s\S]*?position: absolute;/);
  assert.match(stylesSource, /\.player-action-panel\.actions\.opens-below \{[\s\S]*?top: calc\(100% \+ 8px\);[\s\S]*?bottom: auto;/);
});

test('player stop and decorative waveform states avoid stale progress', () => {
  assert.match(mainSource, /dispatchTransport\(\{ type: 'ended', requestId: playRequestRef\.current \}\);[\s\S]*?if \(!shouldAutoAdvanceQueue\(settingsRef\.current\)\) \{\n\s+expectedDurationRef\.current = 0;/);
  assert.match(mainSource, /if \(!advanceQueueEventRef\.current\('next', \{ fromEnded: true \}\)\) \{[\s\S]*?expectedDurationRef\.current = 0;/);
  assert.doesNotMatch(mainSource, /setIsPlaying\(/);
  assert.doesNotMatch(sonicSettingsSource, /<Waveform/);
  assert.doesNotMatch(sonicSettingsSource, /<Waveform progress=\{0\.42\} \/>/);
});

test('search renders artist results and only advertises supported result types', () => {
  assert.match(librarySearchSource, /const artistResults = results\.artists \|\| \[\];/);
  assert.match(librarySearchSource, /placeholder="Songs, albums, artists"/);
  assert.doesNotMatch(librarySearchSource, /placeholder="Songs, albums, artists, radios"/);
  assert.match(librarySearchSource, /artistResults\.map\(\(artist\) => \{/);
  assert.match(librarySearchSource, /key=\{`artist-\$\{artist\.id \|\| name\}`\}/);
  assert.match(librarySearchSource, /setArtistSelection\(\{kind: 'artist', value: artist\.id, name\}\)/);
  assert.match(librarySearchSource, /backLabel="Back to Search"/);
  assert.match(librarySearchSource, /artistResults\.length === 0 && albumResults\.length === 0 && \(results\.songs \|\| \[\]\)\.length === 0/);
});

test('home top shelf is artist-Journey driven from frequent listening', () => {
  assert.match(homeSurfaceSource, /homeArtistRadios: true/);
  assert.match(mainSource, /frequentAlbums: \[\]/);
  assert.match(homeSurfaceSource, /const frequentAlbums = normalizedAlbums\(navidrome\.frequentAlbums, \[\], artworkSize\);/);
  assert.match(homeSurfaceSource, /artistRadioSeedsFromAlbums\(\n\s+frequentAlbums,\n\s+\[\.\.\.randomAlbums, \.\.\.newestAlbums\],/);
  assert.match(homeSurfaceSource, /discovery\.homeArtistRadios &&/);
  assert.match(homeSurfaceSource, /<SectionHeader title="Artist Journeys" \/>/);
  assert.match(homeSurfaceSource, /artistRadioSeeds\.length \? \(/);
  assert.match(homeSurfaceSource, /Artist Journeys will appear after Navidrome reports frequent albums\./);
  assert.match(homeSurfaceSource, /className="mix-grid shelf-row artist-radio-row"/);
  assert.match(homeSurfaceSource, /className=\{`mix-card artist-radio-card/);
  assert.match(homeSurfaceSource, /aria-label=\{`Start \$\{seed\.artist\} Journey`\}/);
  assert.match(homeSurfaceSource, /onStartArtistJourney\?\.\(\{ id: seed\.artistId, name: seed\.artist \}, seed\.title\)/);
  assert.doesNotMatch(homeSurfaceSource, /className="artist-dj"/);
  assert.match(sonicSettingsSource, /<SettingsToggle label="Artist Journeys"/);
  assert.doesNotMatch(homeSurfaceSource, /<SectionHeader title="Sonic Mixes" \/>/);
});

test('locked sessions show an honest unlock state instead of fabricated library content', () => {
  assert.doesNotMatch(mainSource, /mock-seven-psalms|mock-foreign-tongues|mock-wow-signal|mock-carbon|mock-radiohead/);
  assert.match(homeSurfaceSource, /<h2 id="locked-library-title">Unlock your music library<\/h2>/);
  assert.match(homeSurfaceSource, /Your Navidrome connection is configured\. Unlock NaviMuse to browse and play your real library\./);
  assert.match(mainSource, /sessionLocked=\{sessionLocked\}/);
  assert.match(appShellSource, /disabled=\{tab\.requiresUnlockedSession && sessionLocked\}/);
  assert.match(homeSurfaceSource, /<LibraryPicker[^\n]*disabled=\{sessionLocked \|\| librarySaving\}/);
});

test('desktop shell uses :not(.shelf-row) guards to prevent grid collision', () => {
  assert.match(stylesSource, /\.mix-grid:not\(\.shelf-row\)/);
  assert.match(stylesSource, /\.smart-grid:not\(\.shelf-row\)/);
  assert.match(stylesSource, /\.radio-grid:not\(\.shelf-row\)/);
  assert.match(stylesSource, /\.album-row:not\(\.shelf-row\)/);
});

test('desktop transport bar is full-width, not a floating pill', () => {
  assert.match(stylesSource, /--nm-transport-height: 88px;/);
  assert.match(stylesSource, /\.mini-player,\n\s+\.phone-frame\.mini-player-compact \.mini-player \{[\s\S]*?bottom: 0;/);
  assert.match(stylesSource, /width: 100%;/);
  assert.match(stylesSource, /border-radius: 0;/);
});

test('desktop transport exposes complete playback controls and keeps playback in place', () => {
  assert.match(playerChromeSource, /className="mini-transport" role="group" aria-label="Playback controls"/);
  assert.match(playerChromeSource, /aria-label="Previous track"/);
  assert.match(playerChromeSource, /aria-label="Next track"/);
  assert.match(playerChromeSource, /className="mini-time"/);
  assert.match(playerChromeSource, /className=\{`transport-state transport-state-\$\{transportStatus\}`\}/);
  assert.match(playerChromeSource, /className=\{`player-transport-state transport-state-\$\{transportStatus\}`\}/);
  assert.match(playerChromeSource, /aria-label="Volume"/);
  assert.match(playerChromeSource, /className="mini-queue"[^>]*aria-label="Open queue"/);
  assert.match(playerChromeSource, /className="mini-secondary-controls" role="group" aria-label="Playback options"/);
  assert.match(playerChromeSource, /onControlsChange\?\.\(\{ shuffle: !controls\?\.shuffle \}\)/);
  assert.match(playerChromeSource, /onControlsChange\?\.\(nextRepeatControls\(controls\)\)/);
  assert.match(playerChromeSource, /onTrackFeedbackChange\?\.\(favoriteFeedbackPatch\(\)\)/);
  assert.match(playerChromeSource, /const title = nowPlaying\.title \|\| 'Unknown title';/);
  assert.match(playerChromeSource, /const artist = nowPlaying\.artist \|\| 'Unknown artist';/);
  assert.match(playerChromeSource, /const accessibleTitle = title\.length > 120 \? `\$\{title\.slice\(0, 119\)\}…` : title;/);
  assert.match(playerChromeSource, /aria-label=\{`Open now playing: \$\{accessibleTitle\} by \$\{accessibleArtist\}`\}/);
  assert.match(playerChromeSource, /<strong title=\{title\}>\{title\}<\/strong>/);
  assert.match(playerChromeSource, /<span title=\{artist\}>\{artist\}<\/span>/);
  assert.match(mainSource, /onSeek={seekPlayback}/);
  assert.match(mainSource, /shouldOpenFullPlayerOnPlay\(preferences\.playback, queueOptions\) && !window\.matchMedia\('\(min-width: 900px\)'\)\.matches/);
  assert.match(stylesSource, /grid-template-columns: auto minmax\(64px, 1fr\) auto minmax\(92px, 120px\) 36px;/);
  assert.match(stylesSource, /grid-template-columns: minmax\(0, 0\.65fr\) auto minmax\(260px, 1\.35fr\);/);
  assert.match(stylesSource, /grid-template-columns: minmax\(0, 1fr\) auto minmax\(160px, 1fr\);/);
  const desktopStart = stylesSource.indexOf('@media (min-width: 900px)');
  const desktopBlock = stylesSource.slice(desktopStart, stylesSource.indexOf('@media (max-height:', desktopStart));
  assert.match(desktopBlock, /\.mini-transport \{[\s\S]*?display: flex;/);
  assert.match(desktopBlock, /\.mini-transport > button:not\(\.mini-pause\) \{[\s\S]*?display: grid;/);
  assert.match(desktopBlock, /\.mini-tools \{[\s\S]*?display: grid;/);
  assert.match(desktopBlock, /\.mini-hit \.mini-progress,[\s\S]*?display: none;/);
  assert.match(mainSource, /const \[volume, setVolume\] = useState\(\(\) => loadVolume\(accountStorage\)\)/);
  assert.match(mainSource, /\(storage === undefined \? window\.localStorage : storage\)\.setItem\(volumeStorageKey, String\(volume\)\)/);
  assert.match(mainSource, /const settleDeckGains = useCallback\(/);
  assert.match(mainSource, /setDeckGain\(deck, deck === audioRef\.current \? \(useGain \? 1 : transitionVolumeRef\.current\) : 0\)/);
  assert.match(mainSource, /if \(useGain\) setMasterVolume\(transitionVolumeRef\.current\);/);
});

test('daily-client playlist management wires every CRUD operation through protected adapters', () => {
  assert.match(mainSource, /import \{ createPlaylist, fetchPlaylists, saveSonicRadioPlaylist, updatePlaylist \} from '\.\/playlists\.js';/);
  assert.match(librarySearchSource, /import \{ createPlaylist, deletePlaylist, fetchPlaylistDetail, reorderPlaylist, updatePlaylist \} from '\.\/playlists\.js';/);
  assert.match(playerChromeSource, />Add to Playlist\.\.\.<\/button>/);
  assert.match(playerChromeSource, /role="dialog" aria-modal="true"/);
  assert.match(playerChromeSource, /event\.stopImmediatePropagation\(\)/);
  assert.match(playerChromeSource, /querySelectorAll\('button:not\(:disabled\), input:not\(:disabled\)'\)/);
  // Focus wrapping is exercised by playlistPickerViewport.test.mjs, including initial heading focus.
  assert.match(playerChromeSource, /if \(document\.querySelector\('\.playlist-dialog-layer'\)\) return;/);
  assert.match(mainSource, /const playlistPickerBusyRef = useRef\(false\)/);
  assert.match(mainSource, /if \(playlistPickerBusyRef\.current\) return;/);
  assert.match(mainSource, /updatePlaylist\(protectedApiFetch, playlist\.id, \{ addSongIdsIfMissing: \[nowPlaying\.id\] \}\)/);
  assert.match(mainSource, /createPlaylist\(protectedApiFetch, \{ name: trimmedName, songIds: \[nowPlaying\.id\] \}\)/);
  assert.match(mainSource, /const playlistPickerLoadRef = useRef\(null\)/);
  assert.match(librarySearchSource, /updatePlaylist\(protectedApiFetch, detail\.id, \{ name \}\)/);
  assert.match(librarySearchSource, /removeSongIndexes: \[trackIndex\]/);
  assert.match(librarySearchSource, /deletePlaylist\(protectedApiFetch, detail\.id\)/);
  assert.match(librarySearchSource, /className="playlist-delete-confirmation" role="group"/);
  assert.match(librarySearchSource, /deleteConfirmRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(librarySearchSource, /window\.confirm/);
  assert.match(mainSource, /setPlaylistRevision\(\(current\) => current \+ 1\)/);
});

test('playback settings expose truthful transition policy without claiming web gapless capability', () => {
  assert.doesNotMatch(sonicSettingsSource, /label="ReplayGain Mode"/);
  assert.doesNotMatch(sonicSettingsSource, /label="Gapless Playback"/);
  assert.doesNotMatch(sonicSettingsSource, /label="Smart Playlist Scope"/);
  assert.doesNotMatch(sonicSettingsSource, />Offline Cache Limit</);
  assert.match(sonicSettingsSource, /label="Autoplay after queue"/);
  assert.match(sonicSettingsSource, /checked=\{draftPreferences.playback.autoplayAfterQueue\}/);
  assert.match(sonicSettingsSource, /label="Automatic transitions"/);
  assert.match(sonicSettingsSource, /prepared handoff rather than claiming sample-accurate gapless playback/);
  assert.match(sonicSettingsSource, /Persistent cache-ahead is deferred\./);
  assert.match(sonicSettingsSource, /Delivered signal path[\s\S]*?Deferred · legacy stream/);
  assert.match(sonicSettingsSource, /Persistent cache-ahead[\s\S]*?Deferred · transition preload only/);
  assert.equal(defaultAppSettings.playback.replayGain, 'album');
  assert.equal(defaultAppSettings.playback.transitionStyle, 'smart');
  assert.equal(defaultAppSettings.discovery.smartPlaylistScope, 'music');
  assert.equal(Object.hasOwn(defaultAppSettings.streaming, 'offlineLimitGb'), false);
});

test('idle mobile surfaces reserve no phantom player clearance and narrow tablet tools cannot overflow', () => {
  assert.match(stylesSource, /--nm-surface-bottom-clearance: calc\(var\(--nm-tabbar-bottom\) \+ var\(--nm-tabbar-height\) \+ 16px\);/);
  assert.match(stylesSource, /@media \(min-width: 600px\) and \(max-width: 715px\) \{[\s\S]*?\.mini-time,[\s\S]*?\.mini-volume \{\n    display: none;/);
  assert.match(stylesSource, /\.mini-tools \{\n    grid-template-columns: minmax\(32px, 1fr\) auto 36px;/);
});

test('expanded desktop player preserves the shell and removes phone-only affordances', () => {
  assert.match(stylesSource, /@media \(min-width: 900px\) \{[\s\S]*?\.player-sheet \{[\s\S]*?left: var\(--nm-desktop-rail-width\);[\s\S]*?bottom: var\(--nm-transport-height\);/);
  assert.match(stylesSource, /\.player-panel \.grabber \{[\s\S]*?display: none;/);
  assert.match(stylesSource, /grid-template-columns: minmax\(220px, 0\.8fr\) minmax\(280px, 1fr\);/);
  assert.match(stylesSource, /column-gap: clamp\(24px, 4vw, 64px\);/);
  assert.match(stylesSource, /padding: 30px max\(24px, 3vw\) 36px;/);
  assert.doesNotMatch(stylesSource, /padding: 30px max\(44px, 6vw\) 36px calc\(var\(--nm-desktop-rail-width\)/);
});

test('primary player only reports playback-relevant degraded service state', () => {
  assert.match(playerChromeSource, /function PlaybackServiceWarning\(\{ health, isPlaying = false \}\)/);
  assert.match(playerChromeSource, /The last Navidrome connection check failed/);
  const playerBlock = playerChromeSource.match(/function Player\(\{[\s\S]*?\n\}\n\nexport function ProgressRail/)?.[0] || '';
  assert.match(playerBlock, /<PlaybackServiceWarning health=\{health\} isPlaying=\{isPlaying\} \/>/);
  assert.doesNotMatch(playerBlock, /<ServiceStatus/);
  assert.doesNotMatch(playerBlock, /Library-track feedback syncs with Navidrome/);
});

test('desktop sidebar is labeled with Settings pinned to bottom', () => {
  assert.match(stylesSource, /grid-template-columns: 28px 1fr;/);
  assert.match(stylesSource, /\.tabbar button:last-child \{[\s\S]*?margin-top: auto;/);
  assert.match(stylesSource, /\.tabbar span \{[\s\S]*?font-size: 14px;/);
});

test('artwork uses full-bleed square aspect ratio, not fixed 58px', () => {
  assert.match(stylesSource, /\.mix-image \{[\s\S]*?aspect-ratio: 1;/);
  assert.match(stylesSource, /\.mix-image img \{[\s\S]*?width: 100%;/);
  assert.doesNotMatch(stylesSource, /\.mix-image img \{[\s\S]*?width: 58px;/);
  assert.match(stylesSource, /\.mix-card \{[\s\S]*?padding: 0;/);
});

test('Home keeps service health out of the listening surface', () => {
  assert.doesNotMatch(homeSurfaceSource, /<LiveSummary/);
  assert.match(homeSurfaceSource, /<SectionHeader title="Recently Added" \/>/);
});

test('Home distinguishes shelf loading and failure states from an empty library', () => {
  assert.match(homeSurfaceSource, /Loading Home/);
  assert.match(homeSurfaceSource, /className="home-load-state error" role="alert"/);
  assert.match(homeSurfaceSource, /<button type="button" onClick=\{onRetry\}>Try again<\/button>/);
  assert.match(homeSurfaceSource, /navidrome\.hasSnapshot \|\| \(!navidrome\.loading && !navidrome\.error\)/);
});

test('smart playlist cards start playback directly after exact playlist matches', () => {
  const homeSmartBlock = homeSurfaceSource.match(/const openSmartPlaylist = async \(card\) => \{[\s\S]*?\n  \};/)?.[0] || '';
  assert.match(homeSmartBlock, /message: 'Starting smart playlist\.\.\.'/);
  assert.match(homeSmartBlock, /const songs = detail\.playlist\?\.entry \|\| \[\];/);
  assert.match(homeSmartBlock, /setDiscoveryPanel\(null\);/);
  assert.match(homeSmartBlock, /onPlaySong\(songs\[0\], \{ title: match\.name \|\| card\.label, artist: 'Smart Playlist', coverArt: match\.coverArt \}, songs\);/);
  assert.doesNotMatch(homeSmartBlock, /type: 'songs'/);
});

test('radio cards and station results play inside NaviMuse instead of opening external streams', () => {
  assert.match(mainSource, /const nextStreamPath = song\.streamUrl \|\| streamUrl\(song\.id, preferences\.streaming\);/);
  assert.match(sonicSettingsSource, /import \{ radioStationSong, shuffled \} from '\.\/discoveryPlayback\.js';/);
  assert.match(homeSurfaceSource, /import \{ radioStationSong, shuffled \} from '\.\/discoveryPlayback\.js';/);
  assert.match(homeSurfaceSource, /playRadioStations\(stations, 'SOMA FM'\);/);
  assert.match(homeSurfaceSource, /onStartTrackJourney\?\.\(\);/);
  assert.match(sonicSettingsSource, /onStartArtistJourney\?\.\(artist/);
  assert.match(sonicSettingsSource, /onStartGenreJourney\?\.\(genre/);
  assert.equal(((homeSurfaceSource + sonicSettingsSource).match(/disabled=\{radioActionKind\(radioLabel\) === 'song' && !nowPlaying\?\.id\}/g) || []).length, 2);
  assert.equal(((homeSurfaceSource + sonicSettingsSource).match(/Play a track before starting a Track Journey/g) || []).length, 2);
  assert.doesNotMatch(mainSource, /window\.open\(station\.streamUrl/);
  assert.doesNotMatch(homeSurfaceSource + sonicSettingsSource, /panel\.type === 'radios'/);
});

test('Atlas Journey foundation is wired through context and queue-owned transaction without Navidrome scrobble aliases', () => {
  assert.match(mainSource, /AtlasJourneyContext\.Provider value=\{atlasJourneyContextValue\}/);
  assert.match(mainSource, /createAtlasJourneyController\(\{/);
  assert.match(mainSource, /nowPlaying\?\.atlasOwned/);
  assert.match(mainSource, /restoredAtlasJourney/);
  assert.match(playerQueueSource, /commitAtlasTransaction/);
  assert.match(playerQueueSource, /loadAtlasQueueTransaction/);
});
