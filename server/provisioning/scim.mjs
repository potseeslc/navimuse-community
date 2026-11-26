import {createHash, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {mkdirSync, existsSync, lstatSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync} from 'node:fs';
import {join} from 'node:path';

const root = '/api/scim/v2';
const schema = kind => 'urn:ietf:params:scim:schemas:core:2.0:' + kind;
const errorSchema = 'urn:ietf:params:scim:api:messages:2.0:Error';
const epoch = '1970-01-01T00:00:00.000Z';
const fail = (status, detail) => { const e = Error(detail); e.scimStatus = status; throw e; };
const text = (v, max = 256) => typeof v === 'string' && v.trim() && v.length <= max && !/[\u0000-\u001f]/.test(v);
export function privateFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.mode & 0o077 || stat.size > 4194304) throw Error('Provisioning file must be private and regular');
  return readFileSync(path, 'utf8');
}

export async function openMusicProvisioning({directory, token, seeds, adapter, ownerSubject}) {
  if (!/^[A-Za-z0-9_-]{43,}$/.test(token)) throw Error('Provisioning token must contain at least 256 bits of random data');
  mkdirSync(directory, {recursive: true, mode: 0o700});
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.mode & 0o077) throw Error('Provisioning directory must be private');
  const file = join(directory, 'accounts.json');
  let state = existsSync(file) ? JSON.parse(privateFile(file)) : {version: 1, users: [], groups: []};
  if (state.version !== 1 || !Array.isArray(state.users) || !Array.isArray(state.groups)) throw Error('Invalid provisioning registry');
  const seen = new Set();
  for (const user of state.users) {
    if (!text(user.externalId) || seen.has(user.externalId) || !text(user.id) || !text(user.navidromeId) || !text(user.password) || typeof user.active !== 'boolean' || !Number.isSafeInteger(user.revision) || (user.owner && user.externalId !== ownerSubject)) throw Error('Invalid provisioning registry');
    seen.add(user.externalId);
  }
  // Persist a complete replacement before publishing any mapping in memory.
  function save(next) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(next)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, file);
    const parent = openSync(directory, 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
    state = next;
  }
  // Explicitly migrate the existing owner/listener mappings once. Subsequent
  // restarts never resurrect a disabled or deleted seed account.
  for (const seed of seeds) {
    if (state.users.some(u => u.externalId === seed.sub)) continue;
    const navidromeId = await adapter.identify(seed);
    const now = new Date().toISOString();
    save({...state, users: [...state.users, {id: randomUUID(), externalId: seed.sub, userName: seed.username, displayName: seed.username, email: '', active: true, deleted: false, ready: true, owner: Boolean(seed.owner), navidromeId, navidromeUsername: seed.username, password: seed.password, revision: 0, created: now, modified: epoch}]});
  }
  const bySubject = sub => state.users.find(u => u.externalId === sub);
  const publicUser = u => ({schemas: [schema('User')], id: u.id, externalId: u.externalId, userName: u.userName, displayName: u.displayName, active: u.active, emails: u.email ? [{value: u.email, primary: true}] : [], meta: {resourceType: 'User', created: u.created, lastModified: u.ready ? u.modified : epoch}});
  const publicGroup = g => ({schemas: [schema('Group')], id: g.id, externalId: g.externalId, displayName: g.displayName, members: g.members, meta: {resourceType: 'Group', created: g.created, lastModified: g.modified}});
  let queue = Promise.resolve();
  const serialize = fn => { const run = queue.then(fn); queue = run.catch(() => {}); return run; };
  function replaceUser(record) { save({...state, users: [...state.users.filter(u => u.id !== record.id), record]}); }
  function userInput(body) {
    if (!body || !body.schemas?.includes(schema('User')) || !text(body.externalId) || !text(body.userName) || typeof body.active !== 'boolean') fail(400, 'A User schema, externalId, userName and active flag are required');
    const displayName = body.displayName || [body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ') || body.userName;
    const email = body.emails?.find(e => e.primary)?.value || body.emails?.[0]?.value || '';
    if (!text(displayName) || (email && !text(email, 320))) fail(400, 'Invalid user profile');
    return {externalId: body.externalId, userName: body.userName, displayName, email, active: body.active};
  }
  async function putUser(body, id) {
    const input = userInput(body);
    let record = id ? state.users.find(u => u.id === id && !u.deleted) : bySubject(input.externalId);
    if (id && !record) fail(404, 'User not found');
    if (record && record.externalId !== input.externalId) fail(409, 'An external identity cannot be reassigned');
    if (state.users.some(u => u.id !== record?.id && u.userName.toLowerCase() === input.userName.toLowerCase())) fail(409, 'Username belongs to another identity');
    if (!record && state.users.length >= 1000) fail(409, 'Provisioning user limit reached');
    const now = new Date().toISOString();
    if (!record) record = {id: randomUUID(), owner: false, navidromeId: randomUUID(), navidromeUsername: input.userName, password: randomBytes(32).toString('base64url'), revision: 0, created: now};
    const revoke = record.active === true && input.active === false;
    record = {...record, ...input, deleted: false, ready: false, modified: now, revision: record.revision + (revoke ? 1 : 0), ...(revoke && !record.owner ? {password: randomBytes(32).toString('base64url')} : {})};
    replaceUser(record); // Deny access before upstream mutation; retryable on failure.
    await adapter.reconcile(record);
    record = {...record, ready: true}; replaceUser(record);
    return publicUser(record);
  }
  async function deleteUser(id) {
    let record = state.users.find(u => u.id === id);
    if (!record || record.deleted) return;
    record = {...record, active: false, ready: false, revision: record.revision + 1, modified: new Date().toISOString(), ...(!record.owner ? {password: randomBytes(32).toString('base64url')} : {})};
    replaceUser(record);
    await adapter.reconcile(record);
    replaceUser({...record, deleted: true, ready: true});
  }
  function putGroup(body, id) {
    if (!body?.schemas?.includes(schema('Group')) || !text(body.externalId) || !text(body.displayName) || !Array.isArray(body.members || []) || (body.members?.length || 0) > 1000) fail(400, 'Invalid Group');
    const members = (body.members || []).map(m => { if (!text(m.value) || !state.users.some(u => u.id === m.value && !u.deleted)) fail(400, 'Unknown group member'); return {value: m.value}; });
    const existing = id ? state.groups.find(g => g.id === id) : state.groups.find(g => g.externalId === body.externalId);
    if (id && !existing) fail(404, 'Group not found');
    if (existing && existing.externalId !== body.externalId) fail(409, 'An external identity cannot be reassigned');
    if (!existing && state.groups.length >= 1000) fail(409, 'Provisioning group limit reached');
    const now = new Date().toISOString();
    const group = {id: existing?.id || randomUUID(), externalId: body.externalId, displayName: body.displayName, members, created: existing?.created || now, modified: now};
    save({...state, groups: [...state.groups.filter(g => g.id !== group.id), group]}); return publicGroup(group);
  }
  const expected = createHash('sha256').update(token).digest();
  function send(res, status, body) { res.writeHead(status, {'content-type': 'application/scim+json', 'cache-control': 'no-store'}); res.end(body === undefined ? undefined : JSON.stringify(body)); }
  async function bodyFor(req) {
    let size = 0, chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 65536) fail(413, 'Request too large'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { fail(400, 'Invalid JSON'); }
  }
  return {
    ownerSubject,
    get(sub) { const u = bySubject(sub); return u?.active && u.ready && !u.deleted ? {owner: u.owner, username: u.navidromeUsername, password: u.password} : null; },
    revision(sub) { return bySubject(sub)?.revision || 0; },
    async handle(req, res) {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== root && !url.pathname.startsWith(root + '/')) return false;
      const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
      if (!req.headers.authorization?.startsWith('Bearer ') || !timingSafeEqual(expected, createHash('sha256').update(supplied).digest())) { send(res, 401, {schemas: [errorSchema], status: '401', detail: 'Provisioning authorization required'}); return true; }
      try {
        const match = url.pathname.match(/^\/api\/scim\/v2\/(Users|Groups)(?:\/([A-Za-z0-9-]+))?\/?$/);
        if (!match) fail(404, 'Resource not found');
        const [, kind, id] = match, users = kind === 'Users';
        if (req.method === 'GET') {
          let resources = users ? state.users.filter(u => !u.deleted).map(publicUser) : state.groups.map(publicGroup);
          if (id) { const r = resources.find(r => r.id === id); if (!r) fail(404, 'Resource not found'); send(res, 200, r); }
          else {
            if (url.searchParams.has('filter')) {
              const filter = url.searchParams.get('filter').match(/^(externalId|userName) eq "([^"\\]+)"$/);
              if (!filter) fail(400, 'Unsupported filter'); resources = resources.filter(r => r[filter[1]] === filter[2]);
            }
            const start = Number(url.searchParams.get('startIndex') || 1), count = Number(url.searchParams.get('count') ?? 100);
            if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(count) || count < 0 || count > 1000) fail(400, 'Invalid pagination');
            const page = resources.slice(start - 1, start - 1 + count);
            send(res, 200, {schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: resources.length, startIndex: start, itemsPerPage: page.length, Resources: page});
          }
        } else if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id)) {
          const body = await bodyFor(req);
          const result = await serialize(() => users ? putUser(body, id) : putGroup(body, id));
          send(res, req.method === 'POST' ? 201 : 200, result);
        } else if (req.method === 'DELETE' && id) {
          await serialize(() => users ? deleteUser(id) : save({...state, groups: state.groups.filter(g => g.id !== id)})); send(res, 204);
        } else fail(405, 'Method not supported');
      } catch (e) { send(res, e.scimStatus || 503, {schemas: [errorSchema], status: String(e.scimStatus || 503), detail: e.scimStatus ? e.message : 'Provisioning is incomplete; synchronization can retry safely'}); }
      return true;
    }
  };
}
