import {ACCOUNT_PREFERENCES_VERSION,defaultAccountPreferences,parseAccountPreferences,parseAccountPreferenceChange} from '../shared/accountPreferences.js';
export function initializeAccountPreferences(db) {
 db.exec(`CREATE TABLE account_preferences (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id),
  revision INTEGER NOT NULL CHECK(revision>0), preferences TEXT NOT NULL, updated_at INTEGER NOT NULL
 ) STRICT; PRAGMA user_version=6;`);
}
// Called only within the session store's transaction, after authentication.
export function accountPreferenceOperations(db,now) {
 const read=accountId=>{
  const row=db.prepare('SELECT revision,preferences FROM account_preferences WHERE account_id=?').get(accountId);
  return {version:ACCOUNT_PREFERENCES_VERSION,accountId,revision:row?.revision??0,preferences:row?parseAccountPreferences(JSON.parse(row.preferences)):defaultAccountPreferences()};
 };
 return {read,write(accountId,input){
  const {expectedAccountId,expectedRevision,preferences}=parseAccountPreferenceChange(input);
  if(expectedAccountId!==accountId)return {ok:false,code:'ACCOUNT_SCOPE_CHANGED'};
  const current=read(accountId);
  if(expectedRevision!==current.revision)return {ok:false,code:'PREFERENCES_CHANGED',current};
  if(!Object.hasOwn(input.preferences.playback,'gaplessAlbums'))preferences.playback.gaplessAlbums=current.preferences.playback.gaplessAlbums;
  if(!Object.hasOwn(input.preferences,'appearance'))preferences.appearance=current.preferences.appearance;
  if(!Object.hasOwn(input.preferences.library,'selectedFolders'))preferences.library.selectedFolders=current.preferences.library.selectedFolders;
  const revision=expectedRevision+1;
  db.prepare('INSERT INTO account_preferences(account_id,revision,preferences,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision,preferences=excluded.preferences,updated_at=excluded.updated_at').run(accountId,revision,JSON.stringify(preferences),now());
  return {ok:true,...read(accountId)};
 }};
}

// Build 14 and earlier validate this response with an exact v1 schema. Expanded
// fields are opt-in so a cached client can still open its library after deploy.
export function preferenceResponseForClient(snapshot,expanded=false) {
 if(!snapshot || typeof snapshot!=='object')return snapshot;
 const result={...snapshot};
 if(snapshot.preferences){
  let preferences={...snapshot.preferences};
  if(expanded!==3){const {gaplessAlbums,...playback}=preferences.playback;preferences.playback=playback;}
  if(!expanded){const {appearance,...legacy}=preferences;const {selectedFolders,...library}=legacy.library;preferences={...legacy,library};}
  result.preferences=preferences;
 }
 if(snapshot.current)result.current=preferenceResponseForClient(snapshot.current,expanded);
 return result;
}
