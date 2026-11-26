export function activeLyricsLineIndex(lines = [], currentTimeSeconds = 0, offsetMs = 0) {
  if (!Array.isArray(lines) || !lines.length) return -1;
  const positionMs = Math.max(0, Number(currentTimeSeconds) || 0) * 1_000;
  const boundedOffset = Number.isFinite(Number(offsetMs)) ? Number(offsetMs) : 0;
  let activeIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const startMs = Number(lines[index]?.startMs);
    if (!Number.isFinite(startMs)) continue;
    if (startMs + boundedOffset > positionMs) break;
    activeIndex = index;
  }
  return activeIndex;
}

export function lyricsSeekRatio(line, durationSeconds = 0, offsetMs = 0) {
  const durationMs = Number(durationSeconds) * 1_000;
  if (line?.startMs === null || line?.startMs === undefined) return null;
  const startMs = Number(line?.startMs) + (Number(offsetMs) || 0);
  if (!Number.isFinite(startMs) || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.max(0, Math.min(1, startMs / durationMs));
}
