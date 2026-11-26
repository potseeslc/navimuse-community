// Keep iPhone/iPad music on the media element's native output while Web Audio
// startup, pause and background behavior lack accepted device evidence.
export function usesDirectMediaAudio(navigatorLike=globalThis.navigator) {
  return /iPad|iPhone|iPod/.test(navigatorLike?.userAgent || '') ||
    (navigatorLike?.platform==='MacIntel' && navigatorLike?.maxTouchPoints>1);
}
export function audioTransitionCapabilities(navigatorLike=globalThis.navigator) {
  const blend=!usesDirectMediaAudio(navigatorLike);
  return {authoredGapless:false,smartBlend:blend,fixedCrossfade:blend};
}
