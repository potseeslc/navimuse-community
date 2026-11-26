export async function sendPlaybackReport(fetchFn, songId, submission, event) {
  const response = await fetchFn(`/api/navidrome/scrobble/${encodeURIComponent(songId)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'NaviMuse'
    },
    body: JSON.stringify({ submission: Boolean(submission), ...(submission&&event?{event}:{}) })
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    const error = new Error(message || `Playback report failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response;
}
