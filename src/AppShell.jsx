import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { SurfaceRecoveryBoundary } from './SurfaceRecoveryBoundary.jsx';
import { Home, Library, RadioTower, ChartNoAxesCombined, Search, PanelRight, Settings, Waves } from 'lucide-react';

const tabs = [
  { key: 'home', label: 'Discover', icon: Home },
  { key: 'library', label: 'Library', icon: Library, requiresUnlockedSession: true },
  { key: 'listenbrainz', label: 'Listening', icon: ChartNoAxesCombined, requiresUnlockedSession: true },
  { key: 'sonic', label: 'Sonic', icon: Waves, requiresUnlockedSession: true },
  { key: 'settings', label: 'Settings', icon: Settings }
];

export function AppShell({
  searchSheet, onOpenSearch,
  offline = false,
  outputPicker,
  activeTab,
  expandedPlayerOpen = false,
  albumDetail,
  bindAudioDeck,
  desktopQueuePanel,
  miniPlayer,
  onTabSelect,
  playerSheet,
  playlistPicker,
  phoneFrameClass,
  sessionLocked,
  surfaces
}) {
  const surfaceRef = useRef(null);
  const [queueCollapsed,setQueueCollapsed]=useState(false);
  useLayoutEffect(() => {
    const node = surfaceRef.current?.querySelector('.home-surface, .screen-surface') || surfaceRef.current;
    if (!node?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const motion = node.animate([{opacity:.5, transform:'translateY(5px)'},{opacity:1, transform:'none'}],
      {duration:parseFloat(getComputedStyle(node).getPropertyValue('--nm-motion-content')) || 220, easing:'cubic-bezier(.2,.8,.2,1)'});
    return () => motion.cancel();
  }, [activeTab]);
  const bindPrimaryAudio = useCallback((node) => bindAudioDeck(0, node), [bindAudioDeck]);
  const bindStandbyAudio = useCallback((node) => bindAudioDeck(1, node), [bindAudioDeck]);
  const hasInspector = desktopQueuePanel != null && !queueCollapsed;
  const hasPlayer = miniPlayer != null;
  const queueToggle = desktopQueuePanel && <button type="button" className={`desktop-queue-toggle${queueCollapsed?' queue-reopen':''}`} aria-label={hasInspector?'Hide queue':'Show queue'} title={hasInspector?'Hide queue':'Show queue'} aria-expanded={hasInspector} onClick={()=>{setQueueCollapsed(value=>!value);window.requestAnimationFrame(()=>document.querySelector('.desktop-queue-toggle')?.focus());}}><PanelRight size={20}/></button>;
  const desktopShellClass = [
    'native-desktop-shell',
    hasInspector && 'has-inspector',
    hasPlayer && 'has-player'
  ].filter(Boolean).join(' ');
  return (
    <main className="app-shell">
      {searchSheet}
      {outputPicker}
      <audio ref={bindPrimaryAudio} preload="none" />
      <audio ref={bindStandbyAudio} preload="auto" />
      <section className={phoneFrameClass} data-expanded-player={expandedPlayerOpen || undefined}>
        <div
          className={desktopShellClass}
          data-active-surface={activeTab}
          data-has-inspector={String(hasInspector)}
        >
          <aside className="desktop-rail" aria-label="NaviMuse">
            <header className="desktop-brand">
              <span className="desktop-brand-mark" aria-hidden="true"><RadioTower aria-hidden="true" focusable="false" size={24} strokeWidth={1.7} /></span>
              <span className="desktop-brand-copy" aria-hidden="true">
                <h1>NaviMuse</h1>
                <small>Your signal</small>
              </span>
            </header>
            <PrimaryNavigation
              offline={offline}
              activeTab={activeTab}
              onTabSelect={onTabSelect}
              sessionLocked={sessionLocked}
            />

          </aside>
          <section ref={surfaceRef} className="desktop-surface" inert={expandedPlayerOpen} aria-hidden={expandedPlayerOpen ? true : undefined} aria-label={`${surfaceLabel(activeTab)} surface`}>
            {!hasInspector && queueToggle}
            {!offline && !sessionLocked && !albumDetail && ['home','library'].includes(activeTab) && <button className="surface-search-trigger" type="button" onClick={onOpenSearch} aria-label="Search your library"><Search size={20}/><span>Search music</span></button>}
            <SurfaceRecoveryBoundary key={activeTab}><div style={{ display: albumDetail ? 'none' : 'contents' }}>{surfaces?.[activeTab] || null}</div>{albumDetail}</SurfaceRecoveryBoundary>
          </section>
          {hasInspector && (
            <aside id="desktop-playback-queue" className="desktop-inspector" inert={expandedPlayerOpen} aria-hidden={expandedPlayerOpen ? true : undefined} aria-label="Playback queue inspector" role="complementary">
              <SurfaceRecoveryBoundary>{React.cloneElement(desktopQueuePanel,{headerControl:queueToggle})}</SurfaceRecoveryBoundary>
            </aside>
          )}
          {miniPlayer && (
            <footer className="desktop-player-zone" aria-label="Now playing controls" role="region">
              <SurfaceRecoveryBoundary>{miniPlayer}</SurfaceRecoveryBoundary>
            </footer>
          )}
        </div>
        <SurfaceRecoveryBoundary>{playerSheet}</SurfaceRecoveryBoundary>
        <SurfaceRecoveryBoundary>{playlistPicker}</SurfaceRecoveryBoundary>
      </section>
    </main>
  );
}

function PrimaryNavigation({ offline, activeTab, onTabSelect, sessionLocked }) {
  return (
    <nav className="tabbar" aria-label="Primary">
      {(offline?tabs.filter(tab=>tab.key==='library'):tabs).map((tab) => {
        const Icon = tab.icon;
        return (
          <TabButton
            activeTab={activeTab}
            disabled={tab.requiresUnlockedSession && sessionLocked}
            icon={<Icon aria-hidden="true" focusable="false" size={24} />}
            key={tab.key}
            label={offline?'Downloads':tab.label}
            onSelect={onTabSelect}
            tab={tab.key}
          />
        );
      })}
    </nav>
  );
}

function TabButton({ activeTab, disabled = false, tab, label, icon, onSelect }) {
  return (
    <button
      type="button"
      className={`primary-nav-button${activeTab === tab ? ' active' : ''}`}
      disabled={disabled}
      aria-label={label}
      title={disabled ? 'Unlock NaviMuse in Settings to open this section' : undefined}
      aria-current={activeTab === tab ? 'page' : undefined}
      onClick={() => onSelect(tab)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function surfaceLabel(activeTab) {
  return activeTab==='listenbrainz'?'Listening':tabs.find((tab) => tab.key === activeTab)?.label || 'Current';
}
