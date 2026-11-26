export const continuationCapabilities = Object.freeze({
  sonicJourneyExtension: true,
  atlasJourneyExtension: true,
  ordinaryAutoplay: true
});

export const defaultContinuationPreferences = Object.freeze({
  continueThroughQueue: true,
  extendJourneysAutomatically: true,
  autoplayAfterQueue: false
});

export const transitionStyles = Object.freeze({
  SMART: 'smart',
  PRESERVE: 'preserve',
  CROSSFADE: 'crossfade'
});

export const defaultTransitionPreferences = Object.freeze({
  transitionStyle: transitionStyles.SMART,
  gaplessAlbums: false,
  smartBlendSeconds: 4
});

function booleanPreference(input, key, fallback) {
  return typeof input?.[key] === 'boolean' ? input[key] : fallback;
}

export function normalizeContinuationPreferences(input = {}) {
  const legacyContinue = typeof input?.continuousQueue === 'boolean'
    ? input.continuousQueue
    : defaultContinuationPreferences.continueThroughQueue;
  return {
    continueThroughQueue: booleanPreference(input, 'continueThroughQueue', legacyContinue),
    extendJourneysAutomatically: booleanPreference(
      input,
      'extendJourneysAutomatically',
      defaultContinuationPreferences.extendJourneysAutomatically
    ),
    autoplayAfterQueue: continuationCapabilities.ordinaryAutoplay
      ? booleanPreference(input, 'autoplayAfterQueue', defaultContinuationPreferences.autoplayAfterQueue)
      : false
  };
}

export function journeyExtensionEnabled(preferences = {}) {
  return normalizeContinuationPreferences(preferences?.playback || preferences)
    .extendJourneysAutomatically;
}

export function normalizeTransitionPreferences(input = {}) {
  const legacyStyle = input?.gapless === false
    ? transitionStyles.PRESERVE
    : defaultTransitionPreferences.transitionStyle;
  const transitionStyle = Object.values(transitionStyles).includes(input?.transitionStyle)
    ? input.transitionStyle
    : legacyStyle;
  const requestedSeconds = Number(input?.smartBlendSeconds);
  return {
    transitionStyle,
    gaplessAlbums: booleanPreference(input, 'gaplessAlbums', false),
    smartBlendSeconds: Number.isFinite(requestedSeconds)
      ? Math.max(1, Math.min(12, Math.round(requestedSeconds)))
      : defaultTransitionPreferences.smartBlendSeconds
  };
}
