export const ATLAS_EXTENSION_MIN_UPCOMING_STOPS = 2;
export const ATLAS_EXTENSION_RUNWAY_SECONDS = 10 * 60;
export const ATLAS_EXTENSION_TARGET_TRACKS = 10;

export function atlasJourneyRunway(queue = {}) {
  const items = Array.isArray(queue.items) ? queue.items : [];
  const index = Number.isInteger(queue.index) ? queue.index : -1;
  if (index < 0 || index >= items.length) {
    return Object.freeze({ upcomingStops: 0, upcomingDurationSeconds: 0, needsExtension: false, atFinalStop: false });
  }
  const upcoming = items.slice(index + 1);
  const upcomingDurationSeconds = upcoming.reduce((total, item) => {
    const duration = Number(item?.song?.duration);
    return total + (Number.isFinite(duration) && duration > 0 ? duration : 0);
  }, 0);
  return Object.freeze({
    upcomingStops: upcoming.length,
    upcomingDurationSeconds,
    needsExtension: upcoming.length <= ATLAS_EXTENSION_MIN_UPCOMING_STOPS
      || (upcomingDurationSeconds > 0 && upcomingDurationSeconds <= ATLAS_EXTENSION_RUNWAY_SECONDS),
    atFinalStop: index === items.length - 1
  });
}
