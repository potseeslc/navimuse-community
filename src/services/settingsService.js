import { apiJson, jsonRequest } from './apiClient.js';

export function health() {
  return apiJson('/api/health', {}, 'NaviMuse health check failed.');
}

export function settings() {
  return apiJson('/api/settings', {}, 'Could not load NaviMuse settings.');
}

export async function settingsSession({timeoutMs=15000}={}) {
  const controller=new AbortController();let timer;
  try {
    return await Promise.race([
      apiJson('/api/settings/session', {signal:controller.signal}, 'Could not load NaviMuse session.'),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Could not load NaviMuse session.'));},timeoutMs);})
    ]);
  } finally {clearTimeout(timer);}
}

export function savePreferences(preferences) {
  return apiJson('/api/settings', jsonRequest('POST', { preferences }), 'Unlock Settings to save changes.');
}

export function setupAdmin(password, setupToken) {
  return apiJson('/api/settings/admin', jsonRequest('POST', { password, setupToken }), 'Could not create NaviMuse admin.');
}

export function loginAdmin(password) {
  return apiJson('/api/settings/login', jsonRequest('POST', { password }), 'Could not unlock Settings.');
}

export function logoutAdmin(authMode) {
  return apiJson(authMode === 'oidc' ? '/api/auth/logout' : '/api/settings/logout', { method: 'POST', headers: { 'x-requested-with': 'NaviMuse' } }, 'Could not sign out.');
}

export function testNavidrome(credentials) {
  return apiJson('/api/settings/navidrome/test', jsonRequest('POST', credentials), 'Navidrome login failed.');
}

export function saveNavidrome(credentials) {
  return apiJson('/api/settings/navidrome', jsonRequest('POST', credentials), 'Could not save Navidrome settings.');
}

export function clearNavidrome() {
  return apiJson('/api/settings/navidrome', { method: 'DELETE' }, 'Could not clear Navidrome settings.');
}

export function testAudiomuse(credentials) {
  return apiJson('/api/settings/audiomuse/test', jsonRequest('POST', credentials), 'AudioMuse health check failed.');
}

export function saveAudiomuse(credentials) {
  return apiJson('/api/settings/audiomuse', jsonRequest('POST', credentials), 'Could not save AudioMuse settings.');
}

export function clearAudiomuse() {
  return apiJson('/api/settings/audiomuse', { method: 'DELETE' }, 'Could not clear AudioMuse settings.');
}
