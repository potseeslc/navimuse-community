import { apiJson, jsonRequest } from './apiClient.js';

export function audiomuseWaveform(songId, init = {}) {
  return apiJson(`/api/audiomuse/waveform/${encodeURIComponent(songId)}`, init, 'NaviMuse could not load waveform data.');
}

export function audiomuseClapStats(init = {}) {
  return apiJson('/api/audiomuse/clap/stats', init, 'NaviMuse could not load AudioMuse status.');
}

export function audiomuseLyricsSearch(query, { limit = 12, signal } = {}) {
  return apiJson(
    '/api/audiomuse/lyrics/search',
    jsonRequest('POST', { query, limit }, {
      signal,
      headers: { 'x-requested-with': 'NaviMuse' }
    }),
    'NaviMuse could not search lyrics right now.'
  );
}

export function audiomuseMixPreview(body, {signal} = {}) {
  return apiJson('/api/audiomuse/mixes/preview', jsonRequest('POST', body, {signal}), 'NaviMuse could not create this mix. Try again.');
}
