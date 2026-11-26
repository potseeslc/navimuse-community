// Navidrome 0.63.2 native administration API. Never expose its JWT or passwords.
export function createNavidromeProvisioner({configuration, libraryIds, disabledLibraryId}) {
  if (!Array.isArray(libraryIds) || !libraryIds.length || libraryIds.some(x => !Number.isSafeInteger(x) || x < 1)) throw Error('Provisioning library IDs are required');
  if (!Number.isSafeInteger(disabledLibraryId) || disabledLibraryId < 1 || libraryIds.includes(disabledLibraryId)) throw Error('A separate empty library is required for disabled users');
  let auth;
  async function request(path, {method = 'GET', body, token, missing = false} = {}) {
    const config = configuration();
    const base = new URL(config.url);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw Error('Invalid provisioning server');
    const response = await fetch(new URL(base.pathname.replace(/\/$/, '') + path, base), {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {'content-type': 'application/json', ...(token ? {'x-nd-authorization': 'Bearer ' + token} : {})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    if (missing && response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); const e = Error('Navidrome provisioning request failed'); e.status = response.status; throw e; }
    let bytes = 0; const chunks = [];
    for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 1048576) throw Error('Provisioning response too large'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  async function login(username, password) { return request('/auth/login', {method: 'POST', body: {username, password}}); }
  async function admin(path, options = {}) {
    const config = configuration(), binding = JSON.stringify([String(config.url), config.username, config.password]);
    if (!auth || auth.binding !== binding || auth.expires < Date.now()) {
      const result = await login(config.username, config.password);
      if (!result.isAdmin || !result.token) throw Error('Navidrome administrator required for provisioning');
      auth = {binding, token: result.token, expires: Date.now() + 120000};
    }
    try { return await request(path, {...options, token: auth.token}); }
    catch (e) { auth = null; throw e; }
  }
  return {
    // Only deployment-owned seed mappings may adopt existing users. Verify the
    // existing password, never match arbitrary accounts by email or username.
    async identify({username, password, owner}) {
      const user = await login(username, password);
      if (!user.id || Boolean(user.isAdmin) !== Boolean(owner)) throw Error('Seed account role mismatch');
      return user.id;
    },
    async reconcile(record) {
      if (record.owner) return; // Never rewrite the deployment administrator.
      const path = '/api/user/' + encodeURIComponent(record.navidromeId);
      let existing = await admin(path, {missing: true});
      if (existing && (existing.userName !== record.navidromeUsername || existing.isAdmin)) throw Error('Provisioned account identity conflict');
      if (!existing) {
        if (!record.active) return;
        // The stable ID is persisted before POST, so an ambiguous response can be
        // retried without creating a second account or adopting a name collision.
        await admin('/api/user', {method: 'POST', body: {id: record.navidromeId, userName: record.navidromeUsername, name: record.displayName, email: record.email, isAdmin: false, password: record.password}});
        existing = await admin(path);
        if (existing.id !== record.navidromeId || existing.userName !== record.navidromeUsername || existing.isAdmin) throw Error('Provisioned account identity conflict');
      }
      // Revoke libraries first when disabled. Never delete history or playlists.
      if (!record.active) {
        const empty = await admin('/api/library/' + disabledLibraryId);
        if (empty.totalSongs !== 0 || empty.defaultNewUsers !== false) throw Error('Disabled-user library must remain empty and excluded from defaults');
        await admin(path + '/library', {method: 'PUT', body: {libraryIds: [disabledLibraryId]}});
      }
      await admin(path, {method: 'PUT', body: {...existing, userName: record.navidromeUsername, name: record.displayName, email: record.email, isAdmin: false, password: record.password}});
      if (record.active) await admin(path + '/library', {method: 'PUT', body: {libraryIds}});
    }
  };
}
