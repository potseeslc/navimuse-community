import {openRecoverableJson} from './server/recoverableJson.mjs';
import {createPlexSource} from './server/plex/source.mjs';
import {startPlexReceiver} from './server/plex/receiver.mjs';
import {createNowPlayingAPNs,startNowPlayingDelivery} from './server/wiim/nowPlayingPush.mjs';
import {openNowPlayingService,createNowPlayingHandler} from './server/wiim/nowPlaying.mjs';
import {openListeningHistory} from './server/listeningHistory.mjs';
import {createHlsService} from './server/hls/service.mjs';
import {createListeningReceipts} from './server/listeningReceipts.mjs';
import { searchLibrary } from './server/librarySearch.js';
import {openMusicProvisioning,privateFile} from './server/provisioning/scim.mjs';
import {createNavidromeProvisioner} from './server/provisioning/navidrome.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {loadOidcMusicAccounts} from './server/oidcMusicAccounts.mjs';
import {createListenBrainzClient} from './server/listenbrainz/client.mjs';
import {createListenBrainzIntegration,matchListeningLibraryItem} from './server/listenbrainz/integration.mjs';
import {createInternetRadioSource} from './server/wiim/radioSource.mjs';
import {internetRadioStationId} from './shared/wiim/internetRadio.js';
import {createPersonalizedMixStore} from './server/personalizedMix.mjs';
import {navidromeSongForReference,usesCanonicalNavidromeIds} from './server/navidromeIds.mjs';
import {createJourneySource} from './server/wiim/journeySource.mjs';
import { sonicMixRequest } from './server/sonicMixRequest.mjs';
import {normalizeAppearance} from './shared/appearance.js';
import {artistProfile} from './server/artistProfile.mjs';
import {offlineAccessSnapshot} from './server/offlineAccess.mjs';
import {createRadioFeedbackStore} from './server/radioFeedback.mjs';
import {createIcyDecoder,radioArtworkProxyPath} from './server/icyMetadata.mjs';
import {openRemoteCoordinator} from './server/wiim/coordinator.mjs';
import {createWiiMDevice} from './server/wiim/device.mjs';
import {createBridgeDevice} from './server/wiim/hostBridge.mjs';
import {createWiiMHttpHandler} from './server/wiim/http.mjs';
import {PlaybackError} from './shared/wiim/contract.js';
import {requestFailureLog} from './server/requestFailureLog.mjs';
import {openLocalAccountRuntime} from './server/accountRuntime.mjs';
import {createNavidromeRequestContext} from './server/navidromeRequestContext.mjs';
import {createNavidromeClient,navidromeEndpointFor} from './server/navidromeClient.mjs';
import { inspectAtlasPoint } from './server/atlasPointInspectionService.js';
import { createCipheriv, createDecipheriv, createHash, createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { once } from 'node:events';
import { chmodSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as oidc from 'openid-client';
import { libraryDetailAlbums, libraryGenres } from './server/libraryDetailAlbums.js';
import { createAtlasMapService, atlasPublicError } from './server/atlasMapService.js';
import { AtlasJourneyServiceError, createAtlasJourneyService } from './server/atlasJourneyService.js';
import { parseAtlasTrackRef } from './server/atlasTrackRef.js';
import { createPublicResolutionError, parseJourneyExtensionRequest, parseJourneyRevalidationRequest, parseOrderedWaypointPlanRequest } from './shared/sonic-atlas/index.js';
import { normalizeContinuationPreferences, normalizeTransitionPreferences } from './shared/playbackPreferences.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(root, 'dist');
const port = Number(process.env.PORT || 8099);
const defaultNavidromeUrl = serviceUrl(process.env.NAVIDROME_URL || 'http://navidrome:4533', 'NAVIDROME_URL');
const defaultAudiomuseUrl = serviceUrl(process.env.AUDIOMUSE_URL || 'http://audiomuse-ai-flask-app:8000', 'AUDIOMUSE_URL');
const envAudiomuseToken = secretFromEnvOrFile('AUDIOMUSE_API_TOKEN', 'AUDIOMUSE_API_TOKEN_FILE', { optionalFile: true });
const envNavidromeUsername = process.env.NAVIDROME_USERNAME || '';
const envNavidromePassword = process.env.NAVIDROME_PASSWORD || '';
const allowAnyNavidromeUrl = process.env.NAVIMUSE_ALLOW_ANY_NAVIDROME_URL === 'true';
const allowAnyAudiomuseUrl = process.env.NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL === 'true';
const allowPrivateRadioStreams = process.env.NAVIMUSE_ALLOW_PRIVATE_RADIO_STREAMS === 'true';
const navidromeAllowedHosts = allowedNavidromeHosts();
const audiomuseAllowedHosts = allowedAudiomuseHosts();
const dataDir = resolve(process.env.NAVIMUSE_DATA_DIR || '/data');
const listeningHistory=openListeningHistory(join(dataDir,'listening-history'));
const submitListeningReceipt=createListeningReceipts(join(dataDir,'listening-receipts'));
const radioFeedbackStore=createRadioFeedbackStore(join(dataDir,'radio-feedback'));
const personalizedMixStore=createPersonalizedMixStore(join(dataDir,'personalized-mixes'));
const listenBrainz=createListenBrainzIntegration({directory:join(dataDir,'listenbrainz'),client:createListenBrainzClient()});
const settingsFile = resolve(dataDir, 'settings.json');
const settingsKeyFile = resolve(dataDir, 'settings.key');
const setupTokenFile = resolve(dataDir, 'setup-token');
const oidcIssuer = optionalHttpsUrl(process.env.NAVIMUSE_OIDC_ISSUER, 'NAVIMUSE_OIDC_ISSUER');
const oidcClientId = String(process.env.NAVIMUSE_OIDC_CLIENT_ID || '').trim();
const oidcClientSecret = secretFromEnvOrFile('NAVIMUSE_OIDC_CLIENT_SECRET', 'NAVIMUSE_OIDC_CLIENT_SECRET_FILE');
const oidcRedirectUrl = optionalHttpsUrl(process.env.NAVIMUSE_OIDC_REDIRECT_URI, 'NAVIMUSE_OIDC_REDIRECT_URI');
const oidcRedirectUri = oidcRedirectUrl?.href || '';
const oidcEnabled = Boolean(oidcIssuer && oidcClientId && oidcClientSecret && oidcRedirectUrl);
let oidcMusicAccounts=loadOidcMusicAccounts(process.env.NAVIMUSE_OIDC_MUSIC_ACCOUNTS_FILE);
if(oidcMusicAccounts&&!oidcEnabled)throw new Error('OIDC music accounts require configured Pocket ID');
const oidcMusicScope=new AsyncLocalStorage();
let oidcConfigurationPromise = null;
let storedSettings = ensureAdminSessionSecret(readSettingsFile());
let settingsVersion = 0;
let settingsWriteQueue = Promise.resolve(storedSettings);
let cachedSettingsKey = null;
let cachedNavidromeConfig = null;
let cachedAudiomuseConfig = null;
let lastAudioMuseSimilarity = { ok: null, status: 0, count: 0, message: '', checkedAt: null };
let adminSetupInProgress = false;
const loginAttempts = new Map();
// Pocket ID authenticates the user once; NaviMuse owns the remembered session.
// Keep the legacy password-only admin unlock policy separate.
const sessionMaxAgeSeconds = oidcEnabled ? 90 * 24 * 60 * 60 : 12 * 60 * 60;
const setupToken = setupTokenValue();
let musicProvisioning = null;
if (process.env.NAVIMUSE_SCIM_TOKEN_FILE) {
  if (!oidcMusicAccounts || !oidcEnabled || (process.env.NAVIMUSE_ACCOUNT_MODE || 'legacy') !== 'legacy') throw new Error('SCIM requires Pocket ID music account mappings');
  const base = baseNavidromeConfig();
  const seeds = oidcMusicAccounts.entries().map(entry => entry.owner ? {...entry, username: base.username, password: base.password} : entry);
  const libraryIds = JSON.parse(process.env.NAVIMUSE_SCIM_LIBRARY_IDS || '[]');
  musicProvisioning = await openMusicProvisioning({directory: join(dataDir, 'provisioning'), token: privateFile(process.env.NAVIMUSE_SCIM_TOKEN_FILE).trim(), seeds, ownerSubject: oidcMusicAccounts.ownerSubject, adapter: createNavidromeProvisioner({configuration: baseNavidromeConfig, libraryIds, disabledLibraryId: Number(process.env.NAVIMUSE_SCIM_DISABLED_LIBRARY_ID)})});
  oidcMusicAccounts = musicProvisioning;
}
const accountMode=process.env.NAVIMUSE_ACCOUNT_MODE || 'legacy';
if (!['legacy','local'].includes(accountMode)) throw new Error('Unsupported account runtime mode');
const accountNativeOrigins=accountMode==='local'?JSON.parse(process.env.NAVIMUSE_ACCOUNT_NATIVE_ORIGINS || '[]'):[];
const accountRuntime=accountMode==='local'?await openLocalAccountRuntime({
  directory:join(dataDir,'accounts'),initialize:process.env.NAVIMUSE_ACCOUNT_INITIALIZE==='true',legacyConfigured:adminConfigured(),
  navidromeRegistryFile:process.env.NAVIMUSE_ACCOUNT_NAVIDROME_REGISTRY_FILE,
  passkeyEnabled:process.env.NAVIMUSE_ACCOUNT_PASSKEYS==='true',
  passkeyUsernameFirstEnabled:process.env.NAVIMUSE_ACCOUNT_PASSKEY_USERNAME_FIRST==='true',
  assertAllowedNavidromeUrl,verifySetupToken,
  boundaryOptions:{canonicalOrigin:process.env.NAVIMUSE_ACCOUNT_ORIGIN,
    developmentLoopback:process.env.NAVIMUSE_ACCOUNT_DEVELOPMENT_LOOPBACK==='true',
    trustedProxyPeers:JSON.parse(process.env.NAVIMUSE_ACCOUNT_TRUSTED_PROXY_PEERS || '[]'),
    proxyAddressHeader:process.env.NAVIMUSE_ACCOUNT_PROXY_ADDRESS_HEADER || 'x-forwarded-for',nativeOrigins:accountNativeOrigins},
}):null;
const atlasMapService = createAtlasMapService({
  fetchMap: fetchAudioMuseMap,
  aliasKey: () => createHmac('sha256', deriveSettingsSubkey('navimuse:atlas-point-alias:v1')).update('atlas-map-v1').digest()
});
const atlasJourneyService = createAtlasJourneyService({
  mapService: atlasMapService,
  aliasKey: () => createHmac('sha256', deriveSettingsSubkey('navimuse:atlas-journey-alias:v1')).update('journey-v1').digest(),
  trackRefKey: () => deriveSettingsSubkey('navimuse:atlas-track-ref:v1'),
  planSegment: fetchAudioMusePath,
  findSimilar: async ({ seedRawId, count, signal }) => {
    const candidates = await fetchAudioMuseSimilar(seedRawId, count, { signal });
    if (!candidates) throw new AtlasJourneyServiceError('UPSTREAM_UNAVAILABLE', {}, { status: 503, retryable: true });
    return candidates.map(audioMuseCandidateId).filter(Boolean);
  },
  resolveSong: async (rawId, { signal } = {}) => (await navidromeSong(rawId, { preserveNotFound: true, signal })).song,
  now: () => new Date().toISOString()
});

if (process.env.NODE_ENV !== 'test' && !adminConfigured()) {
  console.log(`NaviMuse first-run setup token is available in ${setupTokenFile} or NAVIMUSE_SETUP_TOKEN.`);
}

if (process.env.NODE_ENV !== 'test' && !navidromeCredentialsPresent()) {
  console.warn('NaviMuse Navidrome credentials are not configured. Save them in Settings or set NAVIDROME_USERNAME and NAVIDROME_PASSWORD.');
}

if (process.env.NODE_ENV !== 'test' && allowAnyNavidromeUrl) {
  console.warn('NAVIMUSE_ALLOW_ANY_NAVIDROME_URL is true; NaviMuse Navidrome URL SSRF protection is disabled.');
}

if (process.env.NODE_ENV !== 'test' && allowAnyAudiomuseUrl) {
  console.warn('NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL is true; NaviMuse AudioMuse URL SSRF protection is disabled.');
}

if (process.env.NODE_ENV !== 'test' && allowPrivateRadioStreams) {
  console.warn('NAVIMUSE_ALLOW_PRIVATE_RADIO_STREAMS is true; NaviMuse internet radio SSRF protection is disabled.');
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const navidromeRequestContext=createNavidromeRequestContext();
const wiimConfigurationFile=process.env.NAVIMUSE_WIIM_DEVICES_FILE;
const wiimEnabled=process.env.NAVIMUSE_WIIM_DIRECT==='true';
if(wiimEnabled&&!wiimConfigurationFile)throw new Error('WiiM Direct requires approved device configuration');
const wiimConfiguration=wiimConfigurationFile?JSON.parse(readFileSync(wiimConfigurationFile,'utf8')):null;
const wiimDevice=process.env.NAVIMUSE_WIIM_BRIDGE_URL?configuration=>createBridgeDevice(configuration,{origin:process.env.NAVIMUSE_WIIM_BRIDGE_URL,key:readFileSync(process.env.NAVIMUSE_WIIM_BRIDGE_KEY_FILE,'utf8').trim()}):createWiiMDevice;
if(wiimConfiguration&&(!Array.isArray(wiimConfiguration.devices)||wiimConfiguration.devices.length>16))throw new Error('Invalid WiiM configuration');
const wiimRadioSource=createInternetRadioSource({
  stationFor:async(principal,id)=>{
    const body=await parseNavidromeResponse(await wiimRequestFor(principal,'/rest/getInternetRadioStations.view'));
    return asArray(body.internetRadioStations?.internetRadioStation).find(station=>String(station.id)===id);
  },
  safeUrl:safeInternetRadioStreamUrl,fetchStream:fetchInternetRadioStream,
  artworkFor:(principal,station)=>{
    const entry=radioMetadata.get(radioMetadataScopeKey(principal.scope,String(station.id),station.streamUrl));
    return entry&&Date.now()-entry.updatedAt<900000&&entry.artwork||radioArtworkUrl(station.imageUrl||station.logoUrl||station.coverArtUrl);
  },
  onMetadata:(principal,station,values)=>storeRadioMetadata(radioMetadataScopeKey(principal.scope,String(station.id),station.streamUrl),values)
});
const plexDiscoveryFile=join(dataDir,'plex-discovery-credentials.json');
const plexCredentialStore=process.env.NAVIMUSE_PLEX_RECEIVERS_FILE?await openRecoverableJson(plexDiscoveryFile,{initial:{},validate:v=>Boolean(v&&typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(r=>r&&typeof r.ownerScope==='string'&&typeof r.token==='string'))}):null;
const plexSource=process.env.NAVIMUSE_PLEX_RECEIVERS_FILE?createPlexSource(JSON.parse(readFileSync(process.env.NAVIMUSE_PLEX_RECEIVERS_FILE,'utf8')),{
 discoveryCredentials:plexCredentialStore.value,saveDiscoveryCredentials:credentials=>plexCredentialStore.save(credentials)
}):null;
// Migrate pre-hardening credentials using the durable discovery registry before
// coordinator polling can mistake a temporarily absent receiver for a revoked one.
if(plexSource?.config.autoDiscover&&process.env.NAVIMUSE_WIIM_DISCOVERY_FILE){
 try{const registry=JSON.parse(readFileSync(process.env.NAVIMUSE_WIIM_DISCOVERY_FILE,'utf8'));
  if(!Array.isArray(registry.devices)||registry.devices.length>16)throw Error('Invalid registry');
  plexSource.syncOutputs(registry.devices.map(d=>({...d,id:wiimConfiguration.devices.find(saved=>saved.uuid===d.uuid)?.id||d.id,available:true})));
 }catch{console.error('Plex discovery registry unavailable at startup; saved identities retained');}
}
if(plexSource&&!wiimEnabled)throw new Error('Plex speaker receivers require WiiM Direct');
const wiimCoordinator=wiimConfiguration?await openRemoteCoordinator({
  directory:join(dataDir,'wiim'),baseUrl:wiimConfiguration.mediaBaseUrl,
  devices:wiimConfiguration.devices.map(wiimDevice),enabled:wiimEnabled,
  gaplessEnabled:process.env.NAVIMUSE_WIIM_GAPLESS==='true',
  discoverDevices:process.env.NAVIMUSE_WIIM_DISCOVERY_FILE?async()=>{
    try{const registry=JSON.parse(readFileSync(process.env.NAVIMUSE_WIIM_DISCOVERY_FILE,'utf8'));
      if(!Array.isArray(registry.devices)||registry.devices.length>16)throw Error('Invalid speaker registry');
      return registry.devices.map(device=>wiimDevice({...device,id:wiimConfiguration.devices.find(saved=>saved.uuid===device.uuid)?.id||device.id}));
    }catch(error){if(error.code==='ENOENT')return [];throw error;}
  }:undefined,
  authorize:async principal=>{if(principal.kind==='plex')return Boolean(plexSource&&await plexSource.authorize(principal));try {await wiimRequestFor(principal);return true;}catch{return false;}},
  songFor:async(principal,id)=>{
    if(principal.kind==='plex'){if(!plexSource)throw new PlaybackError('Plex receiver disabled',403);return plexSource.songFor(principal,id);}
    if(internetRadioStationId(id))return wiimRadioSource.songFor(principal,id);
    const response=await wiimRequestFor(principal,'/rest/getSong.view',{id});
    const body=await parseNavidromeResponse(response);return navidromeSongForReference(body,id);
  },
  similarFor:createJourneySource({
    isAccountMode:()=>Boolean(accountRuntime),authorize:principal=>wiimRequestFor(principal),
    configuration:()=>{const config=activeAudiomuseConfig();return {url:serviceEndpoint(config.url,'/api/similar_tracks'),headers:authHeaders(config)};},
    resolveSong:async(principal,id,signal)=>{const body=await parseNavidromeResponse(await wiimRequestFor(principal,'/rest/getSong.view',{id},{signal}),{preserveNotFound:true,preserveAuthorizationFailure:true});return navidromeSongForReference(body,id);},
    readJson:readBoundedJsonResponse
  }),
  report:async(principal,id,submission,event,song)=>{
    if(principal.kind==='plex'){if(plexSource)await plexSource.report(principal,id,submission);return;}
    if(submission&&event){listeningHistory.record(principal.scope,event,song);await submitListeningReceipt(principal.scope,event,()=>wiimRequestFor(principal,'/rest/scrobble.view',{id,submission,time:event.time}));}
    else await wiimRequestFor(principal,'/rest/scrobble.view',{id,submission});
  },
}):null;
const handleWiiMRequest=createWiiMHttpHandler({coordinator:wiimCoordinator,principalFor:wiimPrincipalFor,requestFor:wiimRequestFor,radioMediaFor:wiimRadioSource.mediaFor,externalMediaFor:plexSource?.mediaFor,readBody:req=>readJsonBody(req,250000)});
const plexControllerStore=plexSource?await openRecoverableJson(join(dataDir,'plex-controller-grants.json'),{initial:{},validate:v=>Boolean(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=256&&Object.entries(v).every(([key,expiry])=>/^[a-f0-9]{64}$/.test(key)&&Number.isFinite(expiry)))}):null;
const plexReceiver=plexSource&&process.env.NODE_ENV!=='test'?startPlexReceiver({source:plexSource,coordinator:wiimCoordinator,controllerStore:plexControllerStore}):null;
const nowPlayingService=process.env.NAVIMUSE_IOS27_REMOTE_NOW_PLAYING==='true'&&wiimCoordinator?await openNowPlayingService({directory:join(dataDir,'now-playing'),coordinator:wiimCoordinator,authorize:principal=>wiimRequestFor(principal)}):null;
if(nowPlayingService&&!process.env.NAVIMUSE_APNS_KEY_FILE)throw new Error('iOS 27 remote player requires APNs configuration before enablement');
const nowPlayingDelivery=nowPlayingService?startNowPlayingDelivery({service:nowPlayingService,send:createNowPlayingAPNs({key:readFileSync(process.env.NAVIMUSE_APNS_KEY_FILE),keyID:process.env.NAVIMUSE_APNS_KEY_ID,teamID:process.env.NAVIMUSE_APNS_TEAM_ID,environment:process.env.NAVIMUSE_APNS_ENVIRONMENT||'production'})}):null;
const handleNowPlaying=createNowPlayingHandler({service:nowPlayingService,principalFor:wiimPrincipalFor,requestFor:wiimRequestFor,radioMediaFor:wiimRadioSource.mediaFor,readBody:req=>readJsonBody(req,4096)});
const hlsService=createHlsService({enabled:process.env.NAVIMUSE_HLS_ENABLED==='true',workerUrl:process.env.NAVIMUSE_HLS_WORKER_URL,
  token:secretFromEnvOrFile('NAVIMUSE_HLS_WORKER_TOKEN','NAVIMUSE_HLS_WORKER_TOKEN_FILE'),
  allowScopes:JSON.parse(process.env.NAVIMUSE_HLS_ALLOW_SCOPES||'[]'),requestFor:wiimRequestFor,
  songFor:async(principal,id)=>navidromeSongForReference(await parseNavidromeResponse(await wiimRequestFor(principal,'/rest/getSong.view',{id}),{preserveAuthorizationFailure:true,preserveNotFound:true}),id)
});
const server = createServer((req, res) => oidcMusicScope.run(verifiedSession(req)?.sub,()=>navidromeRequestContext.run(async () => {
  if(musicProvisioning && await musicProvisioning.handle(req,res))return;
  const incomingUrl=new URL(req.url || '/', 'http://localhost');
  if(incomingUrl.pathname.startsWith('/api/playback/wiim')&&applyNativeApiCors(req,res,incomingUrl))return;
  if(await handleNowPlaying(req,res))return;
  if(await handleWiiMRequest(req,res))return;
  if(wiimCoordinator&&req.method==='POST'&&['/api/auth/logout','/api/settings/logout','/api/auth/v1/logout','/api/auth/v1/logout-everywhere'].includes(incomingUrl.pathname)){
    // Resolve the authenticated principal before the normal logout clears it.
    try{const principal=await wiimPrincipalFor(req,res,incomingUrl);if(principal){await nowPlayingService?.revokePrincipal(principal);await wiimCoordinator.logout(principal);}else return;}catch{if(!res.headersSent)sendJson(res,{ok:false,error:'Remote logout could not be completed'},503);return;}
  }
  if (!accountRuntime) return handleAppRequest(req,res);
  try {
    if (await accountRuntime.handleAccountRequest(req,res)) return;
    const url=new URL(req.url || '/', 'http://localhost');
    if (accountNativeOrigins.includes(req.headers.origin) && applyNativeApiCors(req,res,url)) return;
    if (url.pathname==='/api/config' && req.method==='GET') {
      return sendJson(res,{app:'NaviMuse',accountApi:'navimuse-account/v1',accountMode:'local',services:{}},200,{'cache-control':'no-store'});
    }
    if (url.pathname.startsWith('/api/navidrome/')) {
      const result=await accountRuntime.withUpstreamRequest(req,async(request,identity,withPersonalizedCredentials)=>{
        const scopes=url.searchParams.getAll('accountScope');
        if (scopes.length!==1 || !/^queue-scope-v2:[a-f0-9]{64}$/.test(scopes[0])) {
          sendJson(res,{ok:false,code:'ACCOUNT_SCOPE_REQUIRED'},400,{'cache-control':'no-store'});return;
        }
        if (scopes[0]!==identity.queueScope) {
          sendJson(res,{ok:false,code:'ACCOUNT_SCOPE_CHANGED'},409,{'cache-control':'no-store'});return;
        }
        navidromeRequestContext.bind(()=>({request,withPersonalizedCredentials}));
        await handleAppRequest(req,res,true,identity.queueScope);
      });
      if (!result.ok && !res.headersSent) {
        const status=result.code==='SIGN_IN_REQUIRED'?401:['REQUEST_DENIED','UPSTREAM_UNASSIGNED'].includes(result.code)?403:503;
        sendJson(res,{ok:false,code:result.code},status,{'cache-control':'no-store'});
      }
      return;
    }
    // Local mode never reaches legacy owner, provider, health or global discovery
    // handlers. Their account-scoped adapters must be mounted explicitly.
    if (url.pathname.startsWith('/api/')) {
      return sendJson(res,{ok:false,code:'ACCOUNT_ROUTE_UNAVAILABLE'},503,{'cache-control':'no-store'});
    }
    return handleAppRequest(req,res);
  } catch {
    if (!res.headersSent) sendJson(res,{ok:false,code:'ACCOUNT_UNAVAILABLE'},503,{'cache-control':'no-store'});
    else res.destroy();
  }
})));
server.on('close',()=>{void plexReceiver?.close();listeningHistory.close();void nowPlayingDelivery?.close();void nowPlayingService?.close();void hlsService.close();void wiimCoordinator?.close();if(accountRuntime) void accountRuntime.close().catch(()=>console.error('Account runtime close failed'));});

// WiiM principals are server snapshots. No account IDs, credentials or arbitrary
// upstream URLs are accepted from playback request bodies or speaker grants.
function legacyWiiMBinding(config=activeNavidromeConfig()){return createHmac('sha256',deriveSettingsSubkey('navimuse:wiim-binding:v1')).update(JSON.stringify([config.url.href,config.username,config.password])).digest('hex');}
async function wiimPrincipalFor(req,res,url){
  if(accountRuntime){
    const result=await accountRuntime.withUpstreamRequest(req,async(_,identity)=>({id:`account:${identity.accountId}`,scope:identity.queueScope,mode:'account',...identity}));
    if(!result.ok){sendJson(res,{ok:false,error:'Sign in with an approved music connection'},result.code==='SIGN_IN_REQUIRED'?401:403);return null;}
    if(url.pathname.startsWith('/api/playback/')&&url.searchParams.get('accountScope')!==result.value.scope)throw new PlaybackError('Account scope changed',409);
    return result.value;
  }
  if(!authenticated(req)){sendJson(res,{ok:false,error:'Sign in required'},401);return null;}
  if(!['GET','HEAD'].includes(req.method)&&!requireWriteOrigin(req,res))return null;
  const session=verifiedSession(req),scope=sessionStatus(req).queueScope;
  return {id:scope,scope,mode:'legacy',generation:session.gen||0,binding:legacyWiiMBinding(),...(oidcMusicAccounts?{oidcSubject:session.sub,musicRevision:musicProvisioning?.revision(session.sub)||0}:{})};
}
async function wiimRequestFor(principal,path,params={},options={}){
  const dispatch=request=>path?request(path,params,{...options,signal:options.signal||AbortSignal.timeout(8000)}):true;
  if(principal.mode==='account'&&accountRuntime){
    const result=await accountRuntime.withPrincipal(principal,dispatch);
    if(!result.ok)throw new PlaybackError('Playback authorization expired',403);return result.value;
  }
  const legacyOwner=oidcMusicAccounts?.ownerSubject;
  const subject=principal.oidcSubject||(legacyOwner&&principal.id===principal.scope&&principal.scope===queueScopeForSubject(legacyOwner)?legacyOwner:null);
  if(oidcMusicAccounts&&!oidcMusicAccounts.get(subject))throw new PlaybackError('Playback authorization expired',403);
  if(musicProvisioning && (principal.musicRevision||0)!==musicProvisioning.revision(subject))throw new PlaybackError('Playback authorization expired',403);
  const config=oidcMusicAccounts?navidromeConfigForSubject(subject):activeNavidromeConfig();
  if(principal.mode!=='legacy'||accountRuntime||principal.generation!==sessionGeneration(subject)||principal.binding!==legacyWiiMBinding(config))throw new PlaybackError('Playback authorization expired',403);
  return dispatch(navidromeClientFromConfig(config).request);
}

async function handleAppRequest(req,res,accountAuthorized=false,verifiedAccountScope=null) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (applyNativeApiCors(req, res, url)) return;

    if (url.pathname === '/api/auth/login' && req.method === 'GET') {
      if (!oidcEnabled) return sendJson(res, { ok: false, error: 'Pocket ID is not configured' }, 503);
      const configuration = await pocketIdConfiguration();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
      const transaction = signedOidcTransaction({ state, nonce, codeVerifier, exp: Date.now() + 10 * 60 * 1000 });
      res.setHeader('set-cookie', oidcTransactionCookie(req, transaction));
      const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: oidcRedirectUri,
        scope: 'openid profile email',
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce
      });
      res.writeHead(302, { location: authorizationUrl.href, 'cache-control': 'no-store' });
      res.end();
      return;
    }

    if (url.pathname === '/api/auth/callback' && req.method === 'GET') {
      if (!oidcEnabled) return sendJson(res, { ok: false, error: 'Pocket ID is not configured' }, 503);
      const throttle = loginThrottle(req);
      if (throttle.blocked) return redirectWithAuthError(res, 'Too many sign-in attempts. Try again shortly.');
      const transaction = verifyOidcTransaction(cookies(req).navimuse_oidc);
      if (!transaction) {
        recordFailedLogin(req);
        return redirectWithAuthError(res, 'The sign-in request expired. Please try again.');
      }
      try {
        const configuration = await pocketIdConfiguration();
        const currentUrl = new URL(oidcRedirectUri);
        currentUrl.search = url.search;
        const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, {
          pkceCodeVerifier: transaction.codeVerifier,
          expectedState: transaction.state,
          expectedNonce: transaction.nonce,
          idTokenExpected: true
        });
        const claims = tokens.claims();
        if (!claims?.sub) throw new Error('Pocket ID did not return a subject claim');
        if(oidcMusicAccounts&&!oidcMusicAccounts.get(String(claims.sub))){
          clearFailedLogin(req);
          res.setHeader('set-cookie', oidcTransactionCookie(req, '', {maxAge: 0}));
          redirectWithAuthError(res, 'Your music account is awaiting administrator provisioning. Please try again after synchronization.');
          return;
        }
        clearFailedLogin(req);
        res.setHeader('set-cookie', [
          sessionCookie(req, signedSessionToken({
            issuer: oidcIssuer.href.replace(/\/$/, ''),
            sub: String(claims.sub),
            name: String(claims.name || claims.preferred_username || claims.email || 'Pocket ID user'),
            email: String(claims.email || '')
          })),
          oidcTransactionCookie(req, '', { maxAge: 0 })
        ]);
        res.writeHead(302, { location: '/', 'cache-control': 'no-store' });
        res.end();
      } catch (error) {
        recordFailedLogin(req);
        console.warn('Pocket ID callback failed.');
        res.setHeader('set-cookie', oidcTransactionCookie(req, '', { maxAge: 0 }));
        redirectWithAuthError(res, 'Pocket ID sign-in could not be completed.');
      }
      return;
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      if(oidcMusicAccounts&&!requireWriteOrigin(req,res))return;
      if (oidcEnabled && authenticated(req)) {
        const subject=verifiedSession(req).sub;
        if(oidcMusicAccounts){await updateSettings(current=>({...current,security:{...current.security,subjectGenerations:{...current.security?.subjectGenerations,[subject]:sessionGeneration(subject)+1}}}));}
        else await updateSettings((current) => ({
          ...current,
          security: {
            ...(current.security || {}),
            sessionGeneration: Number(current.security?.sessionGeneration || 0) + 1
          }
        }));
      }
      res.setHeader('set-cookie', sessionCookie(req, '', { maxAge: 0 }));
      return sendJson(res, { ok: true, authenticated: false });
    }

    if (url.pathname === '/api/config') {
      const navidromeUrl = currentNavidromeUrl();
      const audiomuse = activeAudiomuseConfig();
      return sendJson(res, {
        app: 'NaviMuse',
        services: {
          navidrome: publicServiceUrl(navidromeUrl.href),
          audiomuse: publicServiceUrl(audiomuse.url.href)
        }
      });
    }

    if (url.pathname === '/api/health') {
      const navidromeUrl = currentNavidromeUrl();
      const audiomuseConfig = activeAudiomuseConfig();
      const [navidrome, audiomuse] = await Promise.all([
        checkService('navidrome', serviceEndpoint(navidromeUrl, '/app/')),
        checkService('audiomuse', serviceEndpoint(audiomuseConfig.url, '/api/health'), authHeaders(audiomuseConfig))
      ]);

      return sendJson(res, {
        ok: navidrome.ok && audiomuse.ok,
        checkedAt: new Date().toISOString(),
        services: { navidrome, audiomuse },
        ...(lastAudioMuseSimilarity.checkedAt
          ? { audioMuseSimilarity: publicAudioMuseSimilarityStatus() }
          : {})
      });
    }

    if (url.pathname === '/api/settings') {
      if (req.method === 'GET') {
        return sendJson(res, publicSettings(req));
      }

      if (req.method === 'POST') {
        if (!requireSettingsAuth(req, res)) return;
        const payload = await readJsonBody(req);
        const preferences = payload.preferences || {};
        await updateSettings((current) => ({
          ...current,
          ...(oidcMusicAccounts&&!oidcMusicAccounts.get(verifiedSession(req)?.sub)?.owner?{subjectPreferences:{...current.subjectPreferences,[verifiedSession(req).sub]:sanitizePreferences(preferences)}}:{preferences:sanitizePreferences(preferences)})
        }));
        return sendJson(res, publicSettings(req));
      }

      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    if (url.pathname === '/api/settings/session') {
      if (req.method === 'GET') {
        // Upgrade an unexpired pre-90-day session once, without extending new
        // sessions forever or reviving a logged-out/deprovisioned identity.
        const session = verifiedSession(req);
        if (oidcEnabled && session && !session.issuedAt) {
          const {sub, issuer, name, email} = session;
          res.setHeader('set-cookie', sessionCookie(req, signedSessionToken({sub, issuer, name, email})));
        }
        return sendJson(res, sessionStatus(req));
      }

      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    if (url.pathname === '/api/settings/admin' && req.method === 'POST') {
      if (oidcEnabled) return sendJson(res, { ok: false, error: 'Administrator password setup is disabled when Pocket ID is configured' }, 409);
      if (adminConfigured()) {
        return sendJson(res, { ok: false, error: 'NaviMuse admin is already configured' }, 409);
      }

      if (adminSetupInProgress) {
        return sendJson(res, { ok: false, error: 'NaviMuse admin setup is already in progress' }, 409);
      }

      if (loginThrottle(req).blocked) {
        return sendJson(res, { ok: false, error: 'Too many setup attempts. Try again shortly.' }, 429);
      }

      const payload = await readLoginJsonBody(req);
      if (!verifySetupToken(payload.setupToken)) {
        console.warn(`Rejected NaviMuse admin setup token attempt from ${clientKey(req)}.`);
        recordFailedLogin(req);
        return sendJson(res, { ok: false, error: 'NaviMuse setup token is required' }, 401);
      }
      const password = String(payload.password || '');
      if (password.length < 12) {
        return sendJson(res, { ok: false, error: 'Admin password must be at least 12 characters' }, 400);
      }
      adminSetupInProgress = true;
      try {
        const passwordHash = await hashPassword(password);
        await updateSettings((current) => {
          if (current.admin?.passwordHash) {
            const error = new Error('NaviMuse admin is already configured');
            error.status = 409;
            throw error;
          }
          return {
            ...current,
            admin: {
              passwordHash,
              sessionSecret: randomBytes(32).toString('base64url')
            }
          };
        });
        clearFailedLogin(req);
        removeSetupTokenFile();
        setSessionCookie(req, res);
        return sendJson(res, sessionStatus(req, true));
      } finally {
        adminSetupInProgress = false;
      }
    }

    if (url.pathname === '/api/settings/login' && req.method === 'POST') {
      if (oidcEnabled) return sendJson(res, { ok: false, error: 'Password login is disabled when Pocket ID is configured' }, 409);
      const throttle = loginThrottle(req);
      if (throttle.blocked) {
        return sendJson(res, { ok: false, error: 'Too many login attempts. Try again shortly.' }, 429);
      }

      const payload = await readLoginJsonBody(req);
      const password = String(payload.password || '');
      if (!await verifyAdminPassword(password)) {
        recordFailedLogin(req);
        return sendJson(res, { ok: false, error: 'Invalid NaviMuse admin password' }, 401);
      }

      clearFailedLogin(req);
      setSessionCookie(req, res);
      return sendJson(res, sessionStatus(req, true));
    }

    if (url.pathname === '/api/settings/logout' && req.method === 'POST') {
      if (oidcEnabled) {
        return sendJson(res, { ok: false, error: 'Use /api/auth/logout to sign out of Pocket ID mode' }, 409);
      }
      if (!requireSettingsAuth(req, res)) return;
      await updateSettings((current) => ({
        ...current,
        security: {
          ...(current.security || {}),
          sessionGeneration: Number(current.security?.sessionGeneration || 0) + 1
        }
      }));
      res.setHeader('set-cookie', sessionCookie(req, '', { maxAge: 0 }));
      return sendJson(res, { ok: true, adminConfigured: adminConfigured(), authenticated: false });
    }

    if (url.pathname === '/api/settings/navidrome/test' && req.method === 'POST') {
      if (!requireSettingsAuth(req, res)) return;
      const payload = await readJsonBody(req);
      const overrides = safeNavidromeOverrides(payload);
      if (!overrides.ok) return sendJson(res, { ok: false, error: overrides.error }, 400);
      return sendJson(res, await testNavidromeConfig(overrides.value));
    }

    if (url.pathname === '/api/settings/navidrome') {
      if (req.method === 'POST') {
        if (!requireSettingsAuth(req, res)) return;
        const payload = await readJsonBody(req);
        const overrides = safeNavidromeOverrides(payload);
        if (!overrides.ok) return sendJson(res, { ok: false, error: overrides.error }, 400);
        const loginTest = await testNavidromeConfig(overrides.value);
        if (!loginTest.ok) return sendJson(res, loginTest, 400);
        await updateSettings((current) => ({
          ...current,
          services: {
            ...(current.services || {}),
            navidrome: {
              ...(current.services?.navidrome || {}),
              ...overrides.value
            }
          }
        }));
        return sendJson(res, publicSettings(req));
      }

      if (req.method === 'DELETE') {
        if (!requireSettingsAuth(req, res)) return;
        await updateSettings((current) => {
          const nextServices = { ...(current.services || {}) };
          delete nextServices.navidrome;
          return {
            ...current,
            services: nextServices
          };
        });
        return sendJson(res, publicSettings(req));
      }

      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    if (url.pathname === '/api/settings/audiomuse/test' && req.method === 'POST') {
      if (!requireSettingsAuth(req, res)) return;
      const payload = await readJsonBody(req);
      const overrides = safeAudiomuseOverrides(payload);
      if (!overrides.ok) return sendJson(res, { ok: false, error: overrides.error }, 400);
      return sendJson(res, await testAudiomuseConfig(overrides.value));
    }

    if (url.pathname === '/api/settings/audiomuse') {
      if (req.method === 'POST') {
        if (!requireSettingsAuth(req, res)) return;
        const payload = await readJsonBody(req);
        const overrides = safeAudiomuseOverrides(payload);
        if (!overrides.ok) return sendJson(res, { ok: false, error: overrides.error }, 400);
        const healthTest = await testAudiomuseConfig(overrides.value);
        if (!healthTest.ok) return sendJson(res, healthTest, 400);
        await updateSettings((current) => ({
          ...current,
          services: {
            ...(current.services || {}),
            audiomuse: {
              ...(current.services?.audiomuse || {}),
              ...overrides.value
            }
          }
        }));
        return sendJson(res, publicSettings(req));
      }

      if (req.method === 'DELETE') {
        if (!requireSettingsAuth(req, res)) return;
        await updateSettings((current) => {
          const nextServices = { ...(current.services || {}) };
          delete nextServices.audiomuse;
          return {
            ...current,
            services: nextServices
          };
        });
        return sendJson(res, publicSettings(req));
      }

      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    // NaviMuse is a single-tenant appliance: one authenticated browser session
    // authorizes all BFF access to the administrator's upstream credentials.
    // Keep this check ahead of every service-specific route so new media or
    // discovery routes cannot accidentally become public.
    if (url.pathname.startsWith('/api/navidrome/') || url.pathname.startsWith('/api/audiomuse/') || url.pathname.startsWith('/api/atlas/')) {
      if (!accountAuthorized) {
        if (!requireAppAuth(req, res)) return;
        const requestConfig={...activeNavidromeConfig()};
        navidromeRequestContext.bind(()=>({...navidromeClientFromConfig(requestConfig),withPersonalizedCredentials:operation=>operation(requestConfig)}));
      }
    }

    if(url.pathname.startsWith('/api/navidrome/hls/')) {
      const principal=await wiimPrincipalFor(req,res,url);if(!principal)return;
      if(url.searchParams.getAll('accountScope').length!==1||url.searchParams.get('accountScope')!==principal.scope)return sendJson(res,{code:'ACCOUNT_SCOPE_CHANGED'},409);
      if(url.pathname==='/api/navidrome/hls/capabilities'&&req.method==='GET')return sendJson(res,{enabled:hlsService.enabledFor(principal)},200,{'cache-control':'no-store'});
      if(url.pathname==='/api/navidrome/hls/sessions'&&req.method==='POST'){
        if(!requireWriteOrigin(req,res))return;
        try {const payload=await readJsonBody(req,2048);const result=await hlsService.prepare(principal,payload.songId);return sendJson(res,result,result.state==='ready'?200:202,{'cache-control':'no-store'});}
        catch{return sendJson(res,{state:'unavailable'},503,{'cache-control':'no-store'});}
      }
      const match=url.pathname.match(/^\/api\/navidrome\/hls\/sessions\/([a-f0-9]{48})\/(.+)$/);
      if(match&&req.method==='GET'){
        try {const media=await hlsService.media(principal,match[1],match[2]);if(!media)return sendJson(res,{error:'HLS session unavailable'},404,{'cache-control':'no-store'});
          res.writeHead(200,{'content-type':media.type,'content-length':media.body.length,'cache-control':'private, no-store'});res.end(media.body);return;
        }catch{return sendJson(res,{error:'HLS unavailable'},503,{'cache-control':'no-store'});}
      }
      return sendJson(res,{error:'HLS route unavailable'},404);
    }

    if(url.pathname.startsWith('/api/navidrome/listening-history/')) {
      if(req.method!=='GET')return methodNotAllowed(res);
      const principal=await wiimPrincipalFor(req,res,url);if(!principal)return;
      if(url.searchParams.get('accountScope')!==principal.scope)return sendJson(res,{code:'ACCOUNT_SCOPE_CHANGED'},409);
      try{return sendJson(res,listeningHistory.section(principal.scope,url.pathname.slice('/api/navidrome/listening-history/'.length),url.searchParams.get('range')||'this_month'),200,{'cache-control':'private, no-store'});}
      catch(error){return sendJson(res,{error:error.publicMessage||'Listening history unavailable'},error.status||503,{'cache-control':'private, no-store'});}
    }

    if(url.pathname.startsWith('/api/navidrome/listenbrainz/')) {
      const scope=accountAuthorized?verifiedAccountScope:sessionStatus(req).queueScope;
      if(!scope)return sendJson(res,{error:'Sign in first.'},401);
      const expected=url.searchParams.get('accountScope');
      if(expected!==scope)return sendJson(res,{code:'ACCOUNT_SCOPE_CHANGED'},409);
      const action=url.pathname.slice('/api/navidrome/listenbrainz/'.length);
      try {
        if(action==='connection'){
          if(req.method==='GET')return sendJson(res,await listenBrainz.connection(scope),200,{'cache-control':'private, no-store'});
          if(req.method!=='POST')return methodNotAllowed(res,'GET, POST');
          if(!requireWriteOrigin(req,res))return;
          return sendJson(res,await listenBrainz.save(scope,await readJsonBody(req,2048)),200,{'cache-control':'private, no-store'});
        }
        if(req.method!=='GET')return methodNotAllowed(res);
        if(!['mixes','playlist'].includes(action))return sendJson(res,listeningHistory.section(scope,action,url.searchParams.get('range')||'this_month'),200,{'cache-control':'private, no-store'});
        const result=action==='playlist'?await listenBrainz.playlist(scope,url.searchParams.get('id'),async track=>{const result=await fetchNavidrome('/rest/search3.view',{query:track.title+' '+track.artist,artistCount:'0',albumCount:'0',songCount:'100'},{signal:AbortSignal.timeout(5000)});return result.searchResult3?.song||[];}):await listenBrainz.section(scope,action,url.searchParams.get('range')||'this_month',async (item,kind)=>{const field=kind==='artists'?'artist':kind==='release-groups'?'album':'song';const result=await fetchNavidrome('/rest/search3.view',{query:item.title+' '+(item.artist||''),artistCount:field==='artist'?'20':'0',albumCount:field==='album'?'20':'0',songCount:field==='song'?'20':'0'},{signal:AbortSignal.timeout(2500)});return matchListeningLibraryItem(item,field,result.searchResult3?.[field]||[]);});
        return sendJson(res,result,200,{'cache-control':'private, no-store'});
      }catch(error){return sendJson(res,{error:error.status?error.message:'ListenBrainz could not load. Try again.'},error.status||503,{'cache-control':'private, no-store'});}
    }

    if(url.pathname==='/api/navidrome/personalized-mix') {
      if(!['GET','POST'].includes(req.method))return methodNotAllowed(res,'GET, POST');
      if(req.method==='POST'&&!accountAuthorized&&!requireWriteOrigin(req,res))return;
      const scope=accountAuthorized?verifiedAccountScope:sessionStatus(req).queueScope;
      if(!scope)return sendJson(res,{ok:false,error:'Sign in to your music connection.'},401);
      const cacheScope=scope+':'+(accountAuthorized?'bound':legacyWiiMBinding());
      if(req.method==='GET')return sendJson(res,{ok:true,mix:await personalizedMixStore.read(cacheScope)},200,{'cache-control':'private, no-store'});
      const input=await readJsonBody(req);
      if(!input||Array.isArray(input)||Object.keys(input).length)return sendJson(res,{ok:false,error:'Invalid mix request'},400);
      const client=navidromeRequestContext.client();
      if(!client.withPersonalizedCredentials)return sendJson(res,{ok:false,error:'Connect your Navidrome account to create your mix.'},403);
      try {
        const result=await personalizedMixStore.refresh(cacheScope,()=>client.withPersonalizedCredentials(async credentials=>{
          // This installation's analysis belongs to its configured music server.
          // A different server requires an explicit analysis connection, never a default-account fallback.
          if(!credentials.username||!credentials.password)throw new Error('Personal credentials required');
          if(String(credentials.url).replace(/\/$/,'')!==String(activeNavidromeConfig().url).replace(/\/$/,''))throw new Error('Music connection mismatch');
          await fetchNavidrome('/rest/ping.view',{}, {preserveAuthorizationFailure:true});
          const config=activeAudiomuseConfig();
          const response=await fetch(serviceEndpoint(config.url,'/api/sonic_fingerprint/generate'),{
            method:'POST',headers:{...authHeaders(config),accept:'application/json','content-type':'application/json'},
            body:JSON.stringify({n:100,navidrome_user:credentials.username,navidrome_password:credentials.password}),
            redirect:'manual',signal:AbortSignal.timeout(60000)
          });
          if(!response.ok){await response.body?.cancel();throw new Error('Analysis unavailable');}
          const candidates=normalizeAudioMuseCandidates(await readBoundedJsonResponse(response,2*1024*1024)).slice(0,100);
          // Spread selections across familiar seeds and neighbors, rather than taking only the seed prefix.
          const spread=candidates.length<=30?candidates:Array.from({length:30},(_,i)=>candidates[Math.floor(i*(candidates.length-1)/29)]);
          const resolution=await resolveAudioMuseCandidates(spread,{limit:30});
          if(resolution.timedOut||resolution.transientFailureCount)throw new Error('Track verification incomplete');
          return resolution.tracks;
        }));
        return sendJson(res,{ok:true,...result},200,{'cache-control':'private, no-store'});
      }catch{return sendJson(res,{ok:false,error:'Your mix could not refresh. Your previous mix is still available. Check your music connection and try again.'},503,{'cache-control':'private, no-store'});}
    }

    if(url.pathname==='/api/navidrome/offline-access') {
      if(req.method!=='GET')return methodNotAllowed(res);
      if([...url.searchParams.keys()].some(key=>key!=='accountScope'))return sendJson(res,{ok:false,error:'Invalid offline access request'},400);
      const scope=accountAuthorized?verifiedAccountScope:sessionStatus(req).queueScope;
      const requestedScopes=url.searchParams.getAll('accountScope');
      if(requestedScopes.length>1)return sendJson(res,{ok:false,code:'ACCOUNT_SCOPE_REQUIRED'},400);
      if(requestedScopes.length===1 && requestedScopes[0]!==scope)return sendJson(res,{ok:false,code:'ACCOUNT_SCOPE_CHANGED'},409);
      // Reachability is insufficient: renew only after the scoped music identity
      // actually authenticates upstream. No caller-defined lifetime or identity.
      const upstream=await fetchNavidrome('/rest/ping.view', {}, {preserveAuthorizationFailure:true});
      return sendJson(res,{...offlineAccessSnapshot(scope),navidromeIdFormat:usesCanonicalNavidromeIds(upstream)?'canonical-v1':'legacy'},200,{'cache-control':'private, no-store'});
    }

    const atlasStreamMatch = url.pathname.match(/^\/api\/atlas\/tracks\/([^/]+)\/stream$/);
    if (atlasStreamMatch) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res);
      const reference = parseAtlasTrackRef(decodePathParam(atlasStreamMatch[1]), deriveSettingsSubkey('navimuse:atlas-track-ref:v1'));
      if (!reference) return sendJson(res, createPublicResolutionError({ requestId: atlasRequestId(req), code: 'INVALID_REQUEST' }), 400);
      return proxyNavidromeMedia(req, res, '/rest/stream.view', streamParams(reference.rawId, url.searchParams));
    }

    if (url.pathname === '/api/atlas/points/inspect') {
      if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
      if (!requireWriteOrigin(req, res)) return;
      const origin = req.headers.origin;
      if (origin) {
        const expectedOrigin = `${requestIsSecure(req) ? 'https' : 'http'}://${req.headers.host}`;
        const nativeOrigins = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);
        if (origin !== expectedOrigin && !nativeOrigins.has(origin)) return sendJson(res, {ok:false,error:'Origin is not allowed'}, 403, {'cache-control':'no-store'});
      }
      let requestId = atlasRequestId(req);
      const controller = new AbortController();
      const disconnected = () => controller.abort(new DOMException('Client disconnected', 'AbortError'));
      req.once('aborted', disconnected);
      const responseClosed = () => { if (!res.writableEnded) disconnected(); };
      res.once('close', responseClosed);
      const deadline = setTimeout(() => controller.abort(new DOMException('Inspection deadline exceeded', 'TimeoutError')), 15_000);
      try {
        const body = await readJsonBody(req);
        if (!req.headers['x-request-id'] && typeof body.requestId === 'string' && /^[A-Za-z0-9._~-]{1,128}$/.test(body.requestId)) requestId = body.requestId;
        if (req.headers['x-request-id'] && body.requestId !== requestId) return sendJson(res, createPublicResolutionError({requestId,code:'INVALID_REQUEST'}), 400);
        const result = await inspectAtlasPoint(body, {
          mapService: atlasMapService,
          resolveSong: async (id, options) => (await navidromeSong(id, {...options,preserveNotFound:true})).song,
          trackRefKey: deriveSettingsSubkey('navimuse:atlas-track-ref:v1'), signal: controller.signal
        });
        return sendJson(res, result, 200, {'cache-control':'no-store'});
      } catch (error) {
        const code = error?.atlasCode || (error?.name === 'AtlasContractValidationError' || [400,413,415].includes(error?.status) ? 'INVALID_REQUEST' : 'UPSTREAM_UNAVAILABLE');
        return sendJson(res, createPublicResolutionError({requestId,code,incidentId:`incident-${randomBytes(10).toString('hex')}`}), error?.status || atlasErrorStatus(code), {'cache-control':'no-store'});
      } finally {
        clearTimeout(deadline);
        req.removeListener('aborted', disconnected);
        res.removeListener('close', responseClosed);
      }
    }

    if (url.pathname === '/api/atlas/points/resolve') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end('Method Not Allowed'); return; }
      if (!requireWriteOrigin(req, res)) return;
      const requestId = atlasRequestId(req);
      try {
        const body = await readJsonBody(req);
        if (!Array.isArray(body.trackIds) || body.trackIds.length < 1 || body.trackIds.length > 20 || Object.keys(body).some(key => key !== 'trackIds')) throw Object.assign(new Error('Invalid Atlas point request'), { status: 400, atlasCode: 'INVALID_REQUEST' });
        const trackIds = body.trackIds.map((id, index) => validNavidromeId(id, `trackIds[${index}]`));
        if (new Set(trackIds).size !== trackIds.length) throw Object.assign(new Error('Duplicate Atlas point request'), { status: 400, atlasCode: 'INVALID_REQUEST' });
        const lease = await atlasMapService.lease();
        const points = await mapWithConcurrency(trackIds, 6, async (trackId, index) => {
          try { await navidromeSong(trackId, { preserveNotFound: true }); } catch (error) { throw Object.assign(error, { atlasLocation: { waypointIndex: index }, atlasCode: error.status === 404 ? 'WAYPOINT_NOT_FOUND' : 'UPSTREAM_UNAVAILABLE' }); }
          const resolved = lease.resolveRawId(trackId);
          if (!resolved) throw Object.assign(new Error('Track is not in Atlas projection'), { status: 404, atlasCode: 'WAYPOINT_NOT_FOUND', atlasLocation: { waypointIndex: index } });
          return { index, pointId: resolved.pointId, coordinate: { x: resolved.coordinate.x, y: resolved.coordinate.y } };
        });
        return sendJson(res, { contractVersion: 'sonic-atlas/v1', kind: 'atlas-point-resolution', requestId, identity: { projectionId: lease.manifest.projectionId, projectionVersion: lease.manifest.projectionVersion, projectionDigest: lease.manifest.projectionDigest }, points });
      } catch (error) {
        const code = error.atlasCode || ([400, 413, 415].includes(error.status) ? 'INVALID_REQUEST' : 'UPSTREAM_UNAVAILABLE');
        return sendJson(res, createPublicResolutionError({ requestId, code, location: error.atlasLocation, incidentId: `incident-${randomBytes(10).toString('hex')}` }), error.status || atlasErrorStatus(code));
      }
    }

    if (url.pathname === '/api/atlas/journeys/plan') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end('Method Not Allowed'); return; }
      if (!requireWriteOrigin(req, res)) return;
      let requestId = atlasRequestId(req), controller;
      try {
        const body = await readJsonBody(req);
        if (!req.headers['x-request-id'] && typeof body.requestId === 'string' && /^[A-Za-z0-9._~-]{1,128}$/.test(body.requestId)) requestId = body.requestId;
        const request = parseOrderedWaypointPlanRequest(body);
        if (request.requestId !== requestId && req.headers['x-request-id']) throw new AtlasJourneyServiceError('INVALID_REQUEST', {}, { status: 400 });
        controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(new DOMException('Journey deadline exceeded', 'TimeoutError')), 45_000);
        req.once('aborted', () => controller.abort(new DOMException('Client disconnected', 'AbortError')));
        try { return sendJson(res, await atlasJourneyService.plan(request, { signal: controller.signal })); } finally { clearTimeout(deadline); }
      } catch (error) {
        const code = error instanceof AtlasJourneyServiceError ? error.atlasCode : error?.atlasCode || (error?.name === 'AtlasContractValidationError' || [400, 413, 415].includes(error?.status) ? 'INVALID_REQUEST' : error?.name === 'TimeoutError' ? 'RESOLUTION_TIMEOUT' : 'UPSTREAM_UNAVAILABLE');
        const location = error?.location && Object.keys(error.location).length ? error.location : undefined;
        const body = createPublicResolutionError({ requestId, code, location, incidentId: `incident-${randomBytes(10).toString('hex')}` });
        return sendJson(res, body, error?.status || atlasErrorStatus(code));
      }
    }

    if (url.pathname === '/api/atlas/journeys/extend') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end('Method Not Allowed'); return; }
      if (!requireWriteOrigin(req, res)) return;
      let requestId = atlasRequestId(req), controller;
      try {
        const body = await readJsonBody(req);
        const request = parseJourneyExtensionRequest(body);
        const headerRequestId = req.headers['x-request-id'];
        if (headerRequestId !== undefined) {
          const exactHeaderRequestId = Array.isArray(headerRequestId) ? '' : String(headerRequestId).trim();
          if (!/^[A-Za-z0-9._~-]{1,128}$/.test(exactHeaderRequestId) || request.requestId !== exactHeaderRequestId) throw new AtlasJourneyServiceError('INVALID_REQUEST', {}, { status: 400 });
          requestId = exactHeaderRequestId;
        } else {
          requestId = request.requestId;
        }
        controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(new DOMException('Journey extension deadline exceeded', 'TimeoutError')), 45_000);
        req.once('aborted', () => controller.abort(new DOMException('Client disconnected', 'AbortError')));
        try { return sendJson(res, await atlasJourneyService.extend(request, { signal: controller.signal })); } finally { clearTimeout(deadline); }
      } catch (error) {
        const code = error instanceof AtlasJourneyServiceError ? error.atlasCode : error?.atlasCode || (error?.name === 'AtlasContractValidationError' || [400, 413, 415].includes(error?.status) ? 'INVALID_REQUEST' : error?.name === 'TimeoutError' ? 'RESOLUTION_TIMEOUT' : 'UPSTREAM_UNAVAILABLE');
        const location = error?.location && Object.keys(error.location).length ? error.location : undefined;
        return sendJson(res, createPublicResolutionError({ requestId, code, location, incidentId: `incident-${randomBytes(10).toString('hex')}` }), error?.status || atlasErrorStatus(code));
      }
    }

    if (url.pathname === '/api/atlas/journeys/revalidate') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end('Method Not Allowed'); return; }
      if (!requireWriteOrigin(req, res)) return;
      let requestId = atlasRequestId(req), controller;
      try {
        const body = await readJsonBody(req);
        if (!req.headers['x-request-id'] && typeof body?.requestId === 'string' && /^[A-Za-z0-9._~-]{1,128}$/.test(body.requestId)) requestId = body.requestId;
        const request = parseJourneyRevalidationRequest(body);
        if (request.requestId !== requestId && req.headers['x-request-id']) throw new AtlasJourneyServiceError('INVALID_REQUEST', {}, { status: 400 });
        controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(new DOMException('Journey revalidation deadline exceeded', 'TimeoutError')), 20_000);
        req.once('aborted', () => controller.abort(new DOMException('Client disconnected', 'AbortError')));
        try { return sendJson(res, await atlasJourneyService.revalidate(request, { signal: controller.signal })); } finally { clearTimeout(deadline); }
      } catch (error) {
        const code = error instanceof AtlasJourneyServiceError ? error.atlasCode : error?.atlasCode || (error?.name === 'AtlasContractValidationError' || [400, 413, 415].includes(error?.status) ? 'INVALID_REQUEST' : error?.name === 'TimeoutError' ? 'RESOLUTION_TIMEOUT' : 'UPSTREAM_UNAVAILABLE');
        const location = error?.location && Object.keys(error.location).length ? error.location : undefined;
        const body = createPublicResolutionError({ requestId, code, location, incidentId: `incident-${randomBytes(10).toString('hex')}` });
        return sendJson(res, body, error?.status || atlasErrorStatus(code));
      }
    }

    if (url.pathname === '/api/atlas/projection') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res);
      try {
        const manifest = await atlasMapService.manifest();
        const etag = `\"${manifest.manifestDigest}\"`;
        if (etagMatches(req.headers['if-none-match'], etag)) return notModified(res, etag);
        return sendJson(res, manifest, 200, { etag }, req.method === 'HEAD');
      } catch (error) {
        const body = atlasPublicError(error, atlasRequestId(req));
        return sendJson(res, body, atlasErrorStatus(body.code));
      }
    }

    const atlasTileMatch = url.pathname.match(/^\/api\/atlas\/tiles\/(\d+)\/(\d+)\/(\d+)$/);
    if (url.pathname.startsWith('/api/atlas/tiles/') && !atlasTileMatch) {
      const body = atlasPublicError(Object.assign(new Error('Invalid Atlas tile address'), { atlasCode: 'INVALID_REQUEST' }), atlasRequestId(req));
      return sendJson(res, body, 400);
    }
    if (atlasTileMatch) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res);
      try {
        const [lod, tileX, tileY] = atlasTileMatch.slice(1).map(Number);
        if (![lod, tileX, tileY].every(Number.isSafeInteger)) throw Object.assign(new Error('Invalid Atlas tile address'), { atlasCode: 'INVALID_REQUEST', status: 400 });
        const tile = await atlasMapService.tile(lod, tileX, tileY);
        const etag = `\"${tile.tileDigest}\"`;
        if (etagMatches(req.headers['if-none-match'], etag)) return notModified(res, etag);
        return sendJson(res, tile, 200, { etag }, req.method === 'HEAD');
      } catch (error) {
        const body = atlasPublicError(error, atlasRequestId(req));
        return sendJson(res, body, atlasErrorStatus(body.code, error.status));
      }
    }

    if (url.pathname === '/api/audiomuse/dashboard') {
      const audiomuseConfig = activeAudiomuseConfig();
      return await proxyJson(res, serviceEndpoint(audiomuseConfig.url, '/api/dashboard/summary'), authHeaders(audiomuseConfig));
    }

    if (url.pathname === '/api/audiomuse/clap/stats') {
      const audiomuseConfig = activeAudiomuseConfig();
      return await proxyJson(res, serviceEndpoint(audiomuseConfig.url, '/api/clap/stats'), authHeaders(audiomuseConfig));
    }

    if (url.pathname === '/api/audiomuse/mixes/preview') {
      if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
      if (requireWriteOrigin(req, res) !== true) return;
      const request = sonicMixRequest(await readJsonBody(req));
      // Resolve seeds with our music identity before submitting them to analysis.
      for (const item of request.payload.items || []) {
        if (item.type === 'song') await navidromeSong(item.id, {preserveNotFound:true});
        else await fetchNavidrome('/rest/getArtist.view', {id:item.id});
      }
      const config = activeAudiomuseConfig();
      const response = await fetch(serviceEndpoint(config.url, request.path), {
        method:'POST', headers:{...authHeaders(config),accept:'application/json','content-type':'application/json'},
        body:JSON.stringify(request.payload), redirect:'manual', signal:AbortSignal.timeout(30_000)
      });
      if (!response.ok) return sendJson(res, {ok:false,error:'Sound discovery is unavailable right now. Check AudioMuse status and try again.'}, 503);
      const candidates = normalizeAudioMuseCandidates(await readBoundedJsonResponse(response, 2 * 1024 * 1024)).slice(0,100);
      const resolution = await resolveAudioMuseCandidates(candidates, {limit:request.limit});
      return sendJson(res, {ok:true,tracks:resolution.tracks,partial:resolution.tracks.length < request.limit,
        resolutionIncomplete:resolution.timedOut || resolution.transientFailureCount > 0});
    }

    if (url.pathname === '/api/audiomuse/lyrics/search') {
      if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
      const trustedWriteOrigin = requireWriteOrigin(req, res);
      if (trustedWriteOrigin !== true) return;
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['query', 'limit'].includes(key))) {
        return sendJson(res, { ok: false, error: 'Invalid lyrics search request' }, 400);
      }
      const query = normalizeAudioMuseLyricsQuery(body.query);
      if (!query) {
        return sendJson(res, { ok: false, error: 'Lyrics search must be between 3 and 240 characters' }, 400);
      }
      const requestedLimit = body.limit === undefined ? 12 : Number(body.limit);
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
        return sendJson(res, { ok: false, error: 'Lyrics search limit must be a positive integer' }, 400);
      }
      const limit = Math.min(25, requestedLimit);
      const candidates = await fetchAudioMuseLyrics(query, Math.min(75, Math.max(limit, limit * 3)));
      const resolution = await resolveAudioMuseCandidates(candidates, { limit });
      return sendJson(res, {
        ok: true,
        query,
        tracks: resolution.tracks,
        candidateCount: candidates.length,
        resolvedCount: resolution.tracks.length,
        partial: resolution.tracks.length < limit,
        resolutionIncomplete: resolution.timedOut || resolution.transientFailureCount > 0,
        timedOut: resolution.timedOut,
        transientFailureCount: resolution.transientFailureCount
      });
    }

    if (url.pathname === '/api/audiomuse/similar_tracks') {
      if (req.method !== 'GET') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }
      const seed = String(url.searchParams.get('seed') || '').trim();
      if (!validAudioMuseSeedId(seed)) return sendJson(res, { ok: false, error: 'A valid seed song id is required' }, 400);
      const count = Math.max(1, Math.min(50, Math.floor(Number(url.searchParams.get('count')) || 12)));
      const excludedIds = [...new Set(url.searchParams.getAll('exclude').map((id) => String(id).trim()))]
        .filter((id) => validAudioMuseSeedId(id))
        .slice(-500);
      // Ask for enough ranked candidates to compensate for history entries the
      // client already owns, then exclude them before Navidrome resolution.
      const candidateRequestCount = Math.min(100, Math.max(count, count * 2));
      const candidates = await fetchAudioMuseSimilar(seed, candidateRequestCount);
      if (!candidates) {
        return sendJson(res, { ok: false, error: 'AudioMuse similarity is temporarily unavailable', telemetry: publicAudioMuseSimilarityStatus() }, 503);
      }
      const resolution = await resolveAudioMuseCandidates(candidates, {
        limit: count,
        excludedIds: [seed, ...excludedIds]
      });
      const partial = resolution.tracks.length < count;
      const resolutionIncomplete = resolution.timedOut
        || resolution.transientFailureCount > 0
        || (resolution.missingCount > 0 && resolution.tracks.length < count);
      const exhausted = !resolution.timedOut && resolution.transientFailureCount === 0 && (
        resolution.availableCount === 0
        || (resolution.tracks.length === 0 && resolution.missingCount > 0)
      );
      return sendJson(res, {
        ok: true,
        seed,
        tracks: resolution.tracks,
        candidateCount: candidates.length,
        resolvedCount: resolution.tracks.length,
        partial,
        resolutionIncomplete,
        exhausted,
        timedOut: resolution.timedOut,
        missingCount: resolution.missingCount,
        transientFailureCount: resolution.transientFailureCount
      });
    }

    const waveformMatch = url.pathname.match(/^\/api\/audiomuse\/waveform\/([^/]+)$/);
    if (waveformMatch) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }
      const audiomuseConfig = activeAudiomuseConfig();
      const upstream = new URL(serviceEndpoint(audiomuseConfig.url, '/api/waveform'));
      upstream.searchParams.set('item_id', decodePathParam(waveformMatch[1]));
      return await proxyJson(res, upstream.href, authHeaders(audiomuseConfig));
    }

    const radioFeedbackMatch=url.pathname.match(/^\/api\/navidrome\/radio-feedback(?:\/([^/]+))?$/);
    if(radioFeedbackMatch){
      // Scope comes from the verified upstream identity, never from this endpoint’s query.
      const scope=accountAuthorized?verifiedAccountScope:sessionStatus(req).queueScope;
      if(req.method==='GET'&&!radioFeedbackMatch[1])return sendJson(res,{feedback:radioFeedbackStore.read(scope)},200,{'cache-control':'no-store'});
      if(req.method!=='POST'||!radioFeedbackMatch[1])return methodNotAllowed(res,'GET, POST');
      if(!accountAuthorized&&!requireSettingsAuth(req,res))return;
      if(!requireWriteOrigin(req,res))return;
      const id=decodePathParam(radioFeedbackMatch[1]);
      const payload=await readJsonBody(req);
      const stations=await fetchNavidrome('/rest/getInternetRadioStations.view');
      if(!asArray(stations.internetRadioStations?.internetRadioStation).some(station=>'radio:'+station.id===id))return sendJson(res,{error:'Station not found'},404);
      return sendJson(res,{feedback:radioFeedbackStore.write(scope,id,payload)},200,{'cache-control':'no-store'});
    }

    const feedbackMatch = url.pathname.match(/^\/api\/navidrome\/feedback\/([^/]+)$/);
    if (feedbackMatch) {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }
      // Legacy writes retain the Settings guard. Local mode was already
      // authorized against the account binding and write boundary above.
      if (!accountAuthorized && !requireSettingsAuth(req, res)) return;
      const payload = await readJsonBody(req);
      return sendJson(res, await navidromeTrackFeedback(decodePathParam(feedbackMatch[1]), payload));
    }

    if (url.pathname === '/api/navidrome/listening') {
      if(req.method!=='POST'){res.writeHead(405);res.end('Method Not Allowed');return;}
      if(!requireWriteOrigin(req,res))return;
      const principal=await wiimPrincipalFor(req,res,url);if(!principal)return;
      const payload=await readJsonBody(req);
      if(payload?.scope!==principal.scope){sendJson(res,{ok:false,error:'Listening account changed'},409);return;}
      if(!listeningHistory.has(principal.scope,payload))listeningHistory.record(principal.scope,payload,(await navidromeSong(payload.songId,{preserveNotFound:true})).song);
      return sendJson(res,await submitListeningReceipt(principal.scope,payload,event=>navidromeScrobble(event.songId,true,event.time)));
    }

    const scrobbleMatch = url.pathname.match(/^\/api\/navidrome\/scrobble\/([^/]+)$/);
    if (scrobbleMatch) {
      if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
      if (!accountAuthorized && !requireSettingsAuth(req, res)) return;
      if (!requireWriteOrigin(req, res)) return;
      const payload = await readJsonBody(req);
      const songId=decodePathParam(scrobbleMatch[1]);
      if(payload?.submission===true&&payload.event){
        const principal=await wiimPrincipalFor(req,res,url);if(!principal)return;
        const event={...payload.event,songId};
        if(!listeningHistory.has(principal.scope,event))listeningHistory.record(principal.scope,event,(await navidromeSong(songId,{preserveNotFound:true})).song);
        return sendJson(res,await submitListeningReceipt(principal.scope,event,()=>navidromeScrobble(songId,true,event.time)));
      }
      return sendJson(res,await navidromeScrobble(songId,payload?.submission===true));
    }

    if (url.pathname === '/api/navidrome/playlists' && req.method === 'POST') {
      if (!accountAuthorized && !requireSettingsAuth(req, res)) return;
      if (!requireWriteOrigin(req, res)) return;
      return sendJson(res, await navidromeCreatePlaylist(await readJsonBody(req)), 201);
    }

    const playlistWriteMatch = url.pathname.match(/^\/api\/navidrome\/playlists\/([^/]+)$/);
    if (playlistWriteMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
      if (!accountAuthorized && !requireSettingsAuth(req, res)) return;
      if (!requireWriteOrigin(req, res)) return;
      const playlistId = validNavidromeId(decodePathParam(playlistWriteMatch[1]), 'playlist id');
      if (req.method === 'DELETE') {
        return sendJson(res, await navidromeDeletePlaylist(playlistId));
      }
      return sendJson(res, await navidromeUpdatePlaylist(playlistId, await readJsonBody(req, 1_000_000)));
    }

    if (url.pathname === '/api/navidrome/radios' && req.method === 'POST') {
      if (!requireWriteOrigin(req, res)) return;
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['name', 'streamUrl', 'homePageUrl'].includes(key)) ||
          typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200 ||
          typeof body.streamUrl !== 'string' || body.streamUrl.length > 4096 || !safeInternetRadioStreamUrl(body.streamUrl) ||
          body.homePageUrl && (typeof body.homePageUrl !== 'string' || body.homePageUrl.length > 4096 || !safeInternetRadioStreamUrl(body.homePageUrl))) {
        return sendJson(res, { error: 'Enter a station name and a public HTTP or HTTPS stream URL.' }, 400);
      }
      await fetchNavidrome('/rest/createInternetRadioStation.view', { name: body.name.trim(), streamUrl: body.streamUrl, homepageUrl: body.homePageUrl || '' });
      return sendJson(res, { ok: true }, 201);
    }

    if (url.pathname.startsWith('/api/navidrome/') && req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    if (url.pathname === '/api/navidrome/bootstrap') {
      return sendJson(res, await navidromeBootstrap(url.searchParams));
    }

    if (url.pathname === '/api/navidrome/search') {
      return sendJson(res, await navidromeSearch(url.searchParams));
    }

    const songMatch = url.pathname.match(/^\/api\/navidrome\/songs\/([^/]+)$/);
    if (songMatch) {
      return sendJson(res, await navidromeSong(decodePathParam(songMatch[1]), { preserveNotFound: true }));
    }

    const lyricsMatch = url.pathname.match(/^\/api\/navidrome\/lyrics\/([^/]+)$/);
    if (lyricsMatch) {
      return sendJson(res, await navidromeLyrics(decodePathParam(lyricsMatch[1])));
    }

    const artistProfileMatch = url.pathname.match(/^\/api\/navidrome\/artists\/([^/]+)\/profile$/);
    if(artistProfileMatch)return sendJson(res,await artistProfile(fetchNavidrome,validNavidromeId(decodePathParam(artistProfileMatch[1]),'artist id')));

    const artistSongsMatch = url.pathname.match(/^\/api\/navidrome\/artists\/([^/]+)\/songs$/);
    if (artistSongsMatch) {
      return sendJson(res, await navidromeArtistSongs(decodePathParam(artistSongsMatch[1])));
    }

    const genreSongsMatch = url.pathname.match(/^\/api\/navidrome\/genres\/([^/]+)\/songs$/);
    if (genreSongsMatch) {
      return sendJson(res, await navidromeGenreSongs(decodePathParam(genreSongsMatch[1])));
    }

    const libraryMatch = url.pathname.match(/^\/api\/navidrome\/library\/(artists|albums|playlists|genres)$/);
    if (libraryMatch) {
      return sendJson(res, await navidromeLibrary(libraryMatch[1], url.searchParams));
    }

    if (url.pathname === '/api/navidrome/radios') {
      return sendJson(res, await navidromeInternetRadios(req));
    }

    const radioMetadataMatch=url.pathname.match(/^\/api\/navidrome\/radios\/([^/]+)\/(metadata|artwork)$/);
    if(radioMetadataMatch&&req.method==='GET')return radioMetadataResponse(req,res,decodePathParam(radioMetadataMatch[1]),radioMetadataMatch[2]==='artwork');
    const radioStreamMatch = url.pathname.match(/^\/api\/navidrome\/radios\/([^/]+)\/stream$/);
    if (radioStreamMatch) {
      return await proxyNavidromeInternetRadio(req, res, decodePathParam(radioStreamMatch[1]));
    }

    if (url.pathname.startsWith('/api/navidrome/library/')) {
      return sendJson(res, { ok: false, error: 'Unknown library view' }, 404);
    }

    const playlistMatch = url.pathname.match(/^\/api\/navidrome\/playlists\/([^/]+)$/);
    if (playlistMatch) {
      return sendJson(res, await navidromePlaylist(decodePathParam(playlistMatch[1])));
    }

    const albumNotesMatch = url.pathname.match(/^\/api\/navidrome\/albums\/([^/]+)\/notes$/);
    if(albumNotesMatch && req.method==='GET') {
      try {
        const result=await fetchNavidrome('/rest/getAlbumInfo2.view',{id:decodeURIComponent(albumNotesMatch[1])},{signal:AbortSignal.timeout(5000)});
        const raw=result.albumInfo?.notes;
        const text=typeof raw==='string'?raw.slice(0,40000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,value=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[value]).replace(/\s+/g,' ').trim():'';
        return sendJson(res,{notes:text?{text}:null});
      } catch { return sendJson(res,{notes:null}); }
    }
    const albumMatch = url.pathname.match(/^\/api\/navidrome\/albums\/([^/]+)$/);
    if (albumMatch) {
      return sendJson(res, await navidromeAlbum(albumMatch[1]));
    }

    const coverMatch = url.pathname.match(/^\/api\/navidrome\/cover\/([^/]+)$/);
    if (coverMatch) {
      return await proxyNavidromeMedia(req, res, '/rest/getCoverArt.view', { id: decodePathParam(coverMatch[1]), size: coverArtSize(url.searchParams) });
    }

    const streamMatch = url.pathname.match(/^\/api\/navidrome\/stream\/([^/]+)$/);
    if (streamMatch) {
      return await proxyNavidromeMedia(req, res, '/rest/stream.view', streamParams(streamMatch[1], url.searchParams));
    }

    return serveStatic(req, res, url);
  } catch (error) {
    if (!error.status || (error.status >= 500 && error.status !== 503)) {
      console.error(requestFailureLog(error,req.url));
    }
    sendJson(res, { ok: false, error: publicErrorMessage(error) }, error.status || 500);
  }
}

if (process.env.NODE_ENV !== 'test') {
  server.listen(port, '0.0.0.0', () => {
    console.log(`NaviMuse listening on http://0.0.0.0:${port}`);
  });
}

async function proxyJson(res, target, headers = {}, timeoutMs = 6000) {
  let response;
  try {
    response = await fetch(target, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    error.status = error?.name === 'TimeoutError' ? 504 : 502;
    error.publicMessage = error?.name === 'TimeoutError'
      ? 'Upstream service timed out'
      : 'Upstream service is unavailable';
    throw error;
  }
  const text = await response.text();
  res.writeHead(response.status, {
    'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(text);
}

function navidromeClientFromConfig(config) {
  if (!config.username || !config.password) {
    const error = new Error(config.decryptionFailed
      ? 'Stored Navidrome credentials could not be decrypted. Re-save them in Settings.'
      : 'Navidrome credentials are not configured');
    error.status = 503;
    throw error;
  }

  return createNavidromeClient(config);
}

async function fetchNavidrome(pathname, params = {}, options = {}) {
  const client=navidromeRequestContext.client(()=>navidromeClientFromConfig(activeNavidromeConfig()));

  let response;
  try {
    response = await client.request(pathname, params, {
      ...(options.formPost ? {formPost: true} : {}),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000)
    });
  } catch (error) {
    error.status = error?.name === 'TimeoutError' ? 504 : 502;
    error.publicMessage = error?.name === 'TimeoutError'
      ? 'Navidrome timed out'
      : 'Navidrome is unavailable';
    throw error;
  }
  if (options.preserveNotFound && response.status === 404) {
    const error = new Error('Navidrome song was not found');
    error.status = 404;
    throw error;
  }
  return parseNavidromeResponse(response, options);
}

async function navidromeBootstrap(searchParams) {
  const musicFolderId = searchParams.get('musicFolderId') || '';
  const folderParams = musicFolderId ? { musicFolderId } : {};
  const frequentAlbums = fetchNavidrome('/rest/getAlbumList2.view', { type: 'frequent', size: '24', ...folderParams })
    .catch(() => ({ albumList2: { album: [] } }));
  const recentAlbums = fetchNavidrome('/rest/getAlbumList2.view', { type: 'recent', size: '18', ...folderParams })
    .catch(() => ({ albumList2: { album: [] }, unavailable: true }));
  const [folders, newest, random, frequent, recent] = await Promise.all([
    fetchNavidrome('/rest/getMusicFolders.view'),
    fetchNavidrome('/rest/getAlbumList2.view', { type: 'newest', size: '18', ...folderParams }),
    fetchNavidrome('/rest/getAlbumList2.view', { type: 'random', size: '8', ...folderParams }),
    frequentAlbums,
    recentAlbums
  ]);

  return {
    musicFolders: folders.musicFolders?.musicFolder || [],
    newestAlbums: newest.albumList2?.album || [],
    randomAlbums: random.albumList2?.album || [],
    recentAlbums: recent.albumList2?.album || [],
    recentAlbumsUnavailable: Boolean(recent.unavailable),
    frequentAlbums: frequent.albumList2?.album || []
  };
}

async function navidromeSearch(searchParams) {
  return searchLibrary(fetchNavidrome, searchParams);
}

async function navidromeSong(id, options = {}) {
  const result = await fetchNavidrome('/rest/getSong.view', { id }, options);
  if (!result.song) {
    const error = new Error('Song not found');
    error.status = 404;
    error.publicMessage = 'Song not found';
    throw error;
  }
  // Keep the identity used by saved queues and frozen Atlas references. Only
  // accept the exact deterministic migration result, never an arbitrary song.
  return { song:navidromeSongForReference(result,id) };
}

async function navidromeLyrics(id) {
  const songId = validNavidromeId(id, 'song id');
  const result = await fetchNavidrome('/rest/getLyricsBySongId.view', { id: songId });
  const rawEntries = result.lyricsList?.structuredLyrics;
  const entries = (Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [])
    .filter((entry) => !entry?.kind || entry.kind === 'main');
  const candidates = entries.length ? entries : (Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : []);
  const normalized = candidates.map((entry, entryIndex) => {
    const rawLines = Array.isArray(entry?.line) ? entry.line : entry?.line ? [entry.line] : [];
    const lines = rawLines.slice(0, 2_000).map((line) => {
      const value = String(line?.value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 2_000);
      const rawStart = line?.start;
      const start = rawStart === null || rawStart === undefined ? Number.NaN : Number(rawStart);
      return { value, startMs: Number.isFinite(start) && start >= 0 ? Math.floor(start) : null };
    }).filter((line) => line.value);
    const synced = entry?.synced === true && lines.length > 0 && lines.every((line) => line.startMs !== null);
    const rawOffset = Number(entry?.offset);
    return {
      entryIndex,
      synced,
      language: String(entry?.lang || '').trim().slice(0, 32),
      offsetMs: Number.isFinite(rawOffset) ? Math.max(-60_000, Math.min(60_000, Math.floor(rawOffset))) : 0,
      lines
    };
  }).filter((entry) => entry.lines.length > 0)
    .sort((left, right) => Number(right.synced) - Number(left.synced) || left.entryIndex - right.entryIndex);

  const selected = normalized[0];
  if (!selected) {
    // Older libraries expose only plain lyrics through the legacy endpoint.
    try {
      const detail = await navidromeSong(songId);
      if (detail.song?.title && detail.song?.artist) {
        const legacy = await fetchNavidrome('/rest/getLyrics.view', { artist: detail.song.artist, title: detail.song.title });
        const text = typeof legacy.lyrics?.value === 'string' ? legacy.lyrics.value : '';
        const lines = text.slice(0, 200_000).split(/\r?\n/).slice(0, 2000).map(value => ({ value: value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 2000), startMs: null })).filter(line => line.value);
        if (lines.length) return { songId, status: 'ready', source: 'library', synced: false, language: '', offsetMs: 0, lines };
      }
    } catch { /* Missing legacy support must not fail ordinary playback. */ }
    return { songId, status: 'unavailable', source: 'library', synced: false, language: '', offsetMs: 0, lines: [] };
  }
  const totalCharacterLimit = 200_000;
  let characterCount = 0;
  const lines = [];
  for (const line of selected.lines) {
    if (characterCount + line.value.length > totalCharacterLimit) break;
    characterCount += line.value.length;
    lines.push(line);
  }
  return {
    songId,
    status: lines.length ? 'ready' : 'unavailable',
    source: 'library',
    synced: selected.synced,
    language: selected.language,
    offsetMs: selected.offsetMs,
    lines
  };
}

async function navidromeArtistSongs(id) {
  const artistId = validNavidromeId(id, 'artist id');
  const result = await fetchNavidrome('/rest/getArtist.view', { id: artistId });
  const artist = result.artist;
  if (!artist) {
    const error = new Error('Artist not found');
    error.status = 404;
    error.publicMessage = 'Artist not found';
    throw error;
  }

  const albums = asArray(artist.album).filter((album) => album?.id);
  const albumResults = [];
  for (let index = 0; index < albums.length; index += 6) {
    const batch = await Promise.allSettled(albums.slice(index, index + 6).map(async (album) => {
      const albumResult = await fetchNavidrome('/rest/getAlbum.view', { id: album.id });
      return asArray(albumResult.album?.song);
    }));
    albumResults.push(...batch.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []));
  }
  const songs = uniqueSongs(albumResults.flat().filter((song) => songMatchesArtist(song, artistId, artist.name)));
  return {
    artist: { id: artist.id || artistId, name: artist.name || '' },
    songs
  };
}

async function navidromeGenreSongs(value) {
  const genre = validNavidromeId(value, 'genre');
  const result = await fetchNavidrome('/rest/getSongsByGenre.view', {
    genre,
    count: '500',
    offset: '0'
  });
  return { genre, songs: asArray(result.songsByGenre?.song) };
}

function songMatchesArtist(song, artistId, artistName = '') {
  if (song?.artistId) return song.artistId === artistId;
  if (song?.albumArtistId) return song.albumArtistId === artistId;
  const expectedName = String(artistName).trim().toLocaleLowerCase();
  return Boolean(expectedName) && String(song?.artist || '').trim().toLocaleLowerCase() === expectedName;
}

function uniqueSongs(songs) {
  const ids = new Set();
  return songs.filter((song) => {
    if (!song?.id || ids.has(song.id)) return false;
    ids.add(song.id);
    return true;
  });
}

async function navidromeCreatePlaylist(payload = {}) {
  const name = validPlaylistName(payload.name);
  const songIds = validNavidromeIds(payload.songIds, 'songIds');
  const result = await fetchNavidrome('/rest/createPlaylist.view', { name, songId: songIds });
  if (!result.playlist) {
    const error = new Error('Navidrome did not return the created playlist');
    error.status = 502;
    error.publicMessage = 'Navidrome did not return the created playlist';
    throw error;
  }
  return { ok: true, playlist: normalizePlaylist(result.playlist) };
}

async function navidromeUpdatePlaylist(playlistId, payload = {}) {
  if (Object.hasOwn(payload, 'reorder')) {
    if (Object.keys(payload).length !== 1) throw playlistEditError(400, 'Reordering cannot be combined with other playlist changes');
    return navidromeReorderPlaylist(playlistId, payload.reorder);
  }
  const hasName = Object.hasOwn(payload, 'name');
  const name = hasName ? validPlaylistName(payload.name) : undefined;
  const songIdsToAdd = validNavidromeIds(payload.addSongIds, 'addSongIds');
  const songIdsToAddIfMissing = validNavidromeIds(payload.addSongIdsIfMissing, 'addSongIdsIfMissing');
  const songIndexesToRemove = validPlaylistIndexes(payload.removeSongIndexes);
  if (!hasName && !songIdsToAdd.length && !songIdsToAddIfMissing.length && !songIndexesToRemove.length) {
    const error = new Error('At least one playlist change is required');
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
  if (songIdsToAddIfMissing.length) {
    // Navidrome exposes no conditional playlist revision/write primitive. This
    // best-effort guard prevents ordinary duplicate taps; two external clients
    // can still race between this read and Navidrome's positional update.
    const current = await navidromePlaylist(playlistId);
    songIdsToAdd.push(...missingPlaylistSongIds(current.playlist, songIdsToAddIfMissing));
    if (!hasName && !songIdsToAdd.length && !songIndexesToRemove.length) return current;
  }
  await fetchNavidrome('/rest/updatePlaylist.view', {
    playlistId,
    name,
    songIdToAdd: songIdsToAdd,
    songIndexToRemove: songIndexesToRemove
  });
  return navidromePlaylist(playlistId);
}

function playlistEditError(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: message });
}

async function navidromeReorderPlaylist(playlistId, reorder) {
  const expected = reorder?.expectedSongIds;
  const order = reorder?.order;
  if (reorder?.version !== 1 || !Array.isArray(expected) || expected.length < 1 || expected.length > 10000 ||
      !Array.isArray(order) || order.length !== expected.length ||
      order.some(index => !Number.isInteger(index) || index < 0 || index >= expected.length) ||
      new Set(order).size !== expected.length) {
    throw playlistEditError(400, 'Reorder requires version 1, expectedSongIds, and one occurrence of every original index (up to 10000 tracks)');
  }
  const expectedIds = expected.map(id => {
    if (typeof id !== 'string') throw playlistEditError(400, 'expectedSongIds must contain song ID strings');
    return validNavidromeId(id, 'expectedSongIds');
  });
  const extensions = await fetchNavidrome('/rest/getOpenSubsonicExtensions.view');
  if (!asArray(extensions.openSubsonicExtensions).some(extension => extension?.name === 'formPost' && extension.versions?.includes(1))) {
    throw playlistEditError(501, 'This music server does not advertise playlist reordering support through form POST');
  }
  const current = await navidromePlaylist(playlistId);
  const actualIds = current.playlist.entry.map(entry => String(entry?.id || ''));
  if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
    throw playlistEditError(409, 'This playlist changed elsewhere. Refresh it before reordering.');
  }
  if (order.every((index, position) => index === position)) return current;
  const songIds = order.map(index => expectedIds[index]);
  // One replacement preserves duplicate occurrences; never clear then append.
  // Navidrome has no conditional write, so external clients can still race this read.
  const result = await fetchNavidrome('/rest/createPlaylist.view', { playlistId, songId: songIds }, { formPost: true });
  const playlist = result.playlist && normalizePlaylist(result.playlist);
  if (!playlist || String(playlist.id) !== playlistId || playlist.entry.length !== songIds.length ||
      playlist.entry.some((entry, index) => String(entry?.id || '') !== songIds[index])) {
    throw playlistEditError(502, 'The music server did not confirm the requested playlist order. Refresh before trying again.');
  }
  return { ok: true, playlist };
}

export function missingPlaylistSongIds(playlist, candidateIds = []) {
  const existingIds = new Set(asArray(playlist?.entry).map((entry) => String(entry.id)));
  return candidateIds.filter((songId) => !existingIds.has(String(songId)));
}

async function navidromeDeletePlaylist(playlistId) {
  await fetchNavidrome('/rest/deletePlaylist.view', { id: playlistId });
  return { ok: true, deleted: true, playlistId };
}

function validPlaylistName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 200) {
    const error = new Error('Playlist name must be between 1 and 200 characters');
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    const error = new Error('Playlist name must not contain control characters');
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
  return name;
}

function validNavidromeId(value, label = 'id') {
  const id = String(value || '').trim();
  if (!id || id.length > 512 || /[\u0000-\u001f\u007f]/.test(id)) {
    const error = new Error(`${label} contains an invalid value`);
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
  return id;
}

function validNavidromeIds(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) {
    const error = new Error(`${label} must be an array with at most 500 entries`);
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
  return [...new Set(value.map((id) => validNavidromeId(id, label)))];
}

function validPlaylistIndexes(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500 || value.some((index) => !Number.isInteger(index) || index < 0)) {
    const error = new Error('removeSongIndexes must contain at most 500 non-negative integers');
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
  return [...new Set(value)];
}

const MAX_AUDIOMUSE_MAP_BYTES = 64 * 1024 * 1024;
export async function readBoundedJsonResponse(response, maxBytes = MAX_AUDIOMUSE_MAP_BYTES) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(new Error('AudioMuse map response is too large'), { status: 502, atlasCode: 'UPSTREAM_INVALID_RESPONSE' });
  if (!response.body) throw Object.assign(new Error('AudioMuse map response body is unavailable'), { status: 502, atlasCode: 'UPSTREAM_INVALID_RESPONSE' });
  const chunks = []; let total = 0;
  for await (const chunk of Readable.fromWeb(response.body)) { total += chunk.byteLength; if (total > maxBytes) throw Object.assign(new Error('AudioMuse map response is too large'), { status: 502, atlasCode: 'UPSTREAM_INVALID_RESPONSE' }); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks, total).toString('utf8')); } catch { throw Object.assign(new Error('AudioMuse map response is invalid JSON'), { status: 502, atlasCode: 'UPSTREAM_INVALID_RESPONSE' }); }
}
async function fetchAudioMusePath({ startRawId, endRawId, targetTrackCount, pathFixSize, signal }, { configResolver = activeAudiomuseConfig } = {}) {
  if (pathFixSize !== false) throw new AtlasJourneyServiceError('INVALID_REQUEST', {}, { status: 400 });
  const config = configResolver(), target = new URL(serviceEndpoint(config.url, '/api/find_path'));
  target.searchParams.set('start_song_id', startRawId); target.searchParams.set('end_song_id', endRawId); target.searchParams.set('max_steps', String(targetTrackCount)); target.searchParams.set('path_fix_size', 'false'); target.searchParams.set('path_space', 'audio');
  const response = await fetch(target, { headers: { ...authHeaders(config), 'accept-encoding': 'gzip' }, redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
  if (response.status >= 300 && response.status < 400) throw new AtlasJourneyServiceError('UPSTREAM_INVALID_RESPONSE', {}, { status: 502, retryable: true });
  if (!response.ok) throw new AtlasJourneyServiceError(response.status === 404 ? 'UPSTREAM_INVALID_RESPONSE' : 'UPSTREAM_UNAVAILABLE', {}, { status: 502, retryable: true });
  return readBoundedJsonResponse(response, 8 * 1024 * 1024);
}

async function mapWithConcurrency(values, limit, mapper) {
  const output = new Array(values.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => { while (cursor < values.length) { const index = cursor; cursor += 1; output[index] = await mapper(values[index], index); } }));
  return output;
}

async function fetchAudioMuseMap({ configResolver = activeAudiomuseConfig } = {}) {
  const config = configResolver();
  const target = new URL(serviceEndpoint(config.url, '/api/map'));
  target.searchParams.set('percent', '100');
  const response = await fetch(target, { headers: { ...authHeaders(config), 'accept-encoding': 'gzip' }, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  if (response.status >= 300 && response.status < 400) throw Object.assign(new Error('AudioMuse map redirect is not allowed'), { status: 502, atlasCode: 'UPSTREAM_INVALID_RESPONSE' });
  if (!response.ok) throw Object.assign(new Error('AudioMuse map unavailable'), { status: 502, atlasCode: 'UPSTREAM_UNAVAILABLE' });
  const payload = await readBoundedJsonResponse(response);
  if (!payload || !Array.isArray(payload.items)) throw Object.assign(new Error('AudioMuse map invalid'), { status: 502, atlasCode: 'UPSTREAM_INVALID_RESPONSE' });
  return payload;
}

async function fetchAudioMuseSimilar(itemId, count, { configResolver = activeAudiomuseConfig, signal } = {}) {
  try {
    const config = configResolver();
    const target = new URL(serviceEndpoint(config.url, '/api/similar_tracks'));
    target.searchParams.set('item_id', itemId);
    target.searchParams.set('n', String(count + 8));
    target.searchParams.set('eliminate_duplicates', 'true');
    target.searchParams.set('mood_similarity', 'true');
    const timeoutSignal = AbortSignal.timeout(9000);
    const response = await fetch(target, { headers: authHeaders(config), signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal });
    if (!response.ok) {
      recordAudioMuseSimilarity(false, response.status, 0, `AudioMuse returned HTTP ${response.status}`);
      console.warn(redactText(`AudioMuse similarity failed: ${response.status} ${target}`));
      return null;
    }
    const candidates = normalizeAudioMuseCandidates(await response.json());
    recordAudioMuseSimilarity(true, response.status, candidates.length, 'AudioMuse similarity ready');
    return candidates;
  } catch (error) {
    recordAudioMuseSimilarity(false, 0, 0, error?.name === 'TimeoutError' ? 'AudioMuse similarity timed out' : 'AudioMuse similarity request failed');
    console.warn(redactText(`AudioMuse similarity error: ${error?.message || error}`));
    return null;
  }
}

async function fetchAudioMuseLyrics(query, count, { configResolver = activeAudiomuseConfig, signal } = {}) {
  const config = configResolver();
  const target = new URL(serviceEndpoint(config.url, '/api/lyrics/search/text'));
  const timeoutSignal = AbortSignal.timeout(20_000);
  const response = await fetch(target, {
    method: 'POST',
    headers: { ...authHeaders(config), accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit: count }),
    redirect: 'manual',
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  });
  if (response.status >= 300 && response.status < 400) {
    throw Object.assign(new Error('AudioMuse lyrics redirect is not allowed'), { status: 502, publicMessage: 'Lyrics discovery is temporarily unavailable' });
  }
  if (response.status === 404) return [];
  if (!response.ok) {
    throw Object.assign(new Error(`AudioMuse lyrics returned HTTP ${response.status}`), { status: 503, publicMessage: 'Lyrics discovery is temporarily unavailable' });
  }
  return normalizeAudioMuseCandidates(await readBoundedJsonResponse(response, 2 * 1024 * 1024));
}

function normalizeAudioMuseCandidates(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.similar_tracks)) return payload.similar_tracks;
  if (Array.isArray(payload?.similarTracks)) return payload.similarTracks;
  if (Array.isArray(payload?.tracks)) return payload.tracks;
  return [];
}

function audioMuseCandidateId(candidate) {
  return String(candidate?.item_id || candidate?.itemId || candidate?.song_id || candidate?.id || '').trim();
}

async function resolveAudioMuseCandidates(candidates, options = {}) {
  const limit = Math.max(0, Number(options.limit) || 0);
  const deadline = Date.now() + Math.max(1, Number(options.deadlineMs) || 8000);
  const excluded = new Set((options.excludedIds || []).map(String));
  const ids = [];
  for (const candidate of candidates || []) {
    const id = audioMuseCandidateId(candidate);
    if (!id || excluded.has(id)) continue;
    excluded.add(id);
    ids.push(id);
  }
  const resolved = new Array(ids.length).fill(null);
  let cursor = 0;
  let successCount = 0;
  let missingCount = 0;
  let transientFailureCount = 0;
  const workerCount = Math.min(8, ids.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < ids.length && successCount < limit && Date.now() < deadline) {
      const index = cursor;
      cursor += 1;
      resolved[index] = await navidromeSong(ids[index], { preserveNotFound: true })
        .then((result) => result.song)
        .catch((error) => {
          if (error?.status === 404) {
            missingCount += 1;
          } else {
            transientFailureCount += 1;
            console.warn(redactText(`AudioMuse candidate resolution failed: ${error?.message || error}`));
          }
          return null;
        });
      if (resolved[index]) successCount += 1;
    }
  }));
  const tracks = resolved.filter(Boolean).slice(0, limit);
  return {
    tracks,
    availableCount: ids.length,
    missingCount,
    transientFailureCount,
    timedOut: tracks.length < limit && cursor < ids.length
  };
}

function validAudioMuseSeedId(value) {
  return /^[A-Za-z0-9._:-]{1,512}$/.test(String(value || ''));
}

function normalizeAudioMuseLyricsQuery(value) {
  if (typeof value !== 'string') return '';
  const query = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (query.length < 3 || query.length > 240 || /[\u0000-\u001f\u007f-\u009f]/u.test(query)) return '';
  // The upstream receives this only as a JSON string consumed by an embedding
  // model; retain meaningful Unicode and punctuation rather than altering the
  // user's lyric intent with HTML, shell, or SQL escaping.
  return query;
}

function recordAudioMuseSimilarity(ok, status, count, message) {
  lastAudioMuseSimilarity = {
    ok: Boolean(ok),
    status: Number(status) || 0,
    count: Number(count) || 0,
    message: String(message || ''),
    checkedAt: new Date().toISOString()
  };
}

function publicAudioMuseSimilarityStatus() {
  const { ok, status, count, checkedAt } = lastAudioMuseSimilarity;
  return { ok, status, count, checkedAt };
}

function redactText(value) {
  return String(value || '')
    .replace(/([?&](?:u|p|t|s|password|token|api[_-]?key|item_id)=)[^&\s]*/gi, '$1[redacted]')
    .replace(/(authorization\s*:\s*(?:bearer|basic)\s+)[^\s,;]+/gi, '$1[redacted]');
}

async function navidromeTrackFeedback(id, feedback = {}) {
  const songId = String(id || '').trim();
  if (!songId || songId.startsWith('radio:') || songId.startsWith('mock-')) {
    const error = new Error('Track feedback can only sync Navidrome songs');
    error.status = 400;
    error.publicMessage = 'Track feedback can only sync Navidrome songs';
    throw error;
  }

  const favorite = Boolean(feedback.favorite);
  const rating = Math.max(0, Math.min(5, Number(feedback.rating) || 0));
  const previous = await fetchNavidrome('/rest/getSong.view', { id: songId });
  if (!previous.song) {
    const error = new Error('Song not found');
    error.status = 404;
    error.publicMessage = 'Song not found';
    throw error;
  }
  const previousFavorite = Boolean(previous.song?.starred);
  const previousRating = Math.max(0, Math.min(5, Number(previous.song?.userRating || 0) || 0));

  let favoriteChanged = false;
  try {
    if (favorite !== previousFavorite) {
      await fetchNavidrome(favorite ? '/rest/star.view' : '/rest/unstar.view', { id: songId });
      favoriteChanged = true;
    }
    if (rating !== previousRating) {
      await fetchNavidrome('/rest/setRating.view', { id: songId, rating: String(rating) });
    }
  } catch (error) {
    if (favoriteChanged) {
      await Promise.allSettled([
        fetchNavidrome(previousFavorite ? '/rest/star.view' : '/rest/unstar.view', { id: songId }),
        fetchNavidrome('/rest/setRating.view', { id: songId, rating: String(previousRating) })
      ]);
    }
    throw error;
  }

  return {
    ok: true,
    feedback: { favorite, rating }
  };
}

async function navidromeScrobble(id, submission = true, time) {
  const songId = String(id || '').trim();
  if (!songId || songId.startsWith('radio:') || songId.startsWith('mock-')) {
    const error = new Error('Track scrobbling is only available for Navidrome songs');
    error.status = 400; error.publicMessage = error.message; throw error;
  }
  await fetchNavidrome('/rest/scrobble.view', { id: songId, submission: submission ? 'true' : 'false', ...(time?{time}: {}) });
  return { ok: true, id: songId, submission };
}

async function navidromeLibrary(type, searchParams = new URLSearchParams()) {
  const musicFolderId = searchParams.get('musicFolderId') || '';
  const folderParams = musicFolderId ? { musicFolderId } : {};

  if (type === 'artists') {
    const result = await fetchNavidrome('/rest/getArtists.view', folderParams);
    const indexes = asArray(result.artists?.index);
    return {
      type,
      artists: indexes.flatMap((index) => asArray(index.artist))
    };
  }

  if (type === 'albums' && (searchParams.has('artistId') || searchParams.has('genre'))) {
    return libraryDetailAlbums(fetchNavidrome, searchParams);
  }

  if (type === 'albums') {
    const supportedSorts = new Set(['alphabeticalByName', 'alphabeticalByArtist', 'newest', 'frequent', 'recent']);
    const sort = supportedSorts.has(searchParams.get('sort')) ? searchParams.get('sort') : 'alphabeticalByName';
    const offset = Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(500, Math.max(1, Number.parseInt(searchParams.get('limit') || '500', 10) || 500));
    const result = await fetchNavidrome('/rest/getAlbumList2.view', {
      type: sort,
      size: String(limit),
      offset: String(offset),
      ...folderParams
    });
    const albums = asArray(result.albumList2?.album);
    return {
      type,
      sort,
      albums,
      page: { offset, limit, nextOffset: albums.length === limit ? offset + albums.length : null }
    };
  }

  if (type === 'playlists') {
    const result = await fetchNavidrome('/rest/getPlaylists.view');
    return {
      type,
      playlists: asArray(result.playlists?.playlist)
    };
  }

  if (type === 'genres') {
    return { type, ...await libraryGenres(fetchNavidrome, musicFolderId, searchParams) };
  }

  const error = new Error('Unknown library view');
  error.status = 404;
  throw error;
}

async function navidromePlaylist(id) {
  const result = await fetchNavidrome('/rest/getPlaylist.view', { id });
  if (!result.playlist) {
    const error = new Error('Playlist not found');
    error.status = 404;
    error.publicMessage = 'Playlist not found';
    throw error;
  }
  return { playlist: normalizePlaylist(result.playlist) };
}

function normalizePlaylist(playlist) {
  return { ...playlist, entry: asArray(playlist?.entry) };
}

async function navidromeInternetRadios(req) {
  const result = await fetchNavidrome('/rest/getInternetRadioStations.view');
  return {
    radios: asArray(result.internetRadioStations?.internetRadioStation).map(station => req
      ? { ...station, artworkPath: radioArtworkProxyPath(station.id, cachedRadioArtwork(req, station)) }
      : station)
  };
}

const radioMetadata=new Map();
function radioMetadataKey(req,id,stream){const scope=accountRuntime?new URL(req.url,'http://localhost').searchParams.get('accountScope'):sessionStatus(req).queueScope;return radioMetadataScopeKey(scope,id,stream);}
function radioMetadataScopeKey(scope,id,stream){return createHash('sha256').update(JSON.stringify([scope,id,stream])).digest('hex');}
function storeRadioMetadata(key,values){const old=radioMetadata.get(key)||{};const title=values.title||old.title||'';const history=title&&title!==old.title?[title,...old.history||[]].slice(0,10):old.history||[];radioMetadata.set(key,{title,history,artwork:radioArtworkUrl(values.artwork)||old.artwork||null,updatedAt:Date.now()});if(radioMetadata.size>100)radioMetadata.delete(radioMetadata.keys().next().value);}
function radioArtworkUrl(value){try{const u=new URL(value);return !u.username&&!u.password&&/\.(jpe?g|png|webp)(?:$|\?)/i.test(u.pathname+u.search)?safeInternetRadioStreamUrl(u.href):null;}catch{return null;}}
function cachedRadioArtwork(req, station) {
 const entry=radioMetadata.get(radioMetadataKey(req,String(station.id),station.streamUrl));
 const current=entry&&Date.now()-entry.updatedAt<900000?entry:null;
 return current?.artwork||radioArtworkUrl(station.imageUrl||station.logoUrl||station.coverArtUrl);
}
async function radioMetadataResponse(req,res,id,artwork=false){
 const station=(await navidromeInternetRadios()).radios.find(s=>String(s.id)===id);if(!station)return sendJson(res,{ok:false,error:'Station not found'},404);
 const entry=radioMetadata.get(radioMetadataKey(req,id,station.streamUrl));const current=entry&&Date.now()-entry.updatedAt<900000?entry:null;
 const art=cachedRadioArtwork(req,station);
 if(!artwork)return sendJson(res,{title:current?.title||'',history:current?.history||[],artwork:radioArtworkProxyPath(id,art)},200,{'cache-control':'no-store'});
 if(!art)return sendJson(res,{ok:false,error:'No station artwork provided'},404);
 const controller=new AbortController();res.once('close',()=>controller.abort());
 const response=await fetchInternetRadioStream(art,{},AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]));
 if(!response.ok||!/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();return sendJson(res,{ok:false,error:'Station artwork unavailable'},502);}
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024){controller.abort();return sendJson(res,{ok:false,error:'Artwork too large'},502);}chunks.push(Buffer.from(chunk));}
 const bytes=Buffer.concat(chunks);res.writeHead(200,{'content-type':response.headers.get('content-type'),'content-length':bytes.length,'cache-control':'private,max-age=60','x-content-type-options':'nosniff'});res.end(bytes);
}

async function proxyNavidromeInternetRadio(req, res, id) {
  const stations = (await navidromeInternetRadios()).radios;
  const station = stations.find((candidate) => String(candidate.id || '') === String(id));
  if (!station?.streamUrl) {
    return sendJson(res, { ok: false, error: 'Internet radio station not found' }, 404);
  }

  const streamUrl = safeInternetRadioStreamUrl(station.streamUrl);
  if (!streamUrl) {
    return sendJson(res, { ok: false, error: 'Internet radio stream URL is blocked' }, 400);
  }

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const response = await fetchInternetRadioStream(streamUrl, radioStreamRequestHeaders(), controller.signal);

  if (!validMediaResponse(response, '/radio-stream')) {
    await response.body?.cancel().catch(() => {});
    return sendJson(res, { ok: false, error: 'Internet radio stream request failed' }, 502);
  }

  const key=radioMetadataKey(req,id,station.streamUrl);
  const update=values=>storeRadioMetadata(key,values);
  update({artwork:response.headers.get('icy-logo')||station.imageUrl||station.logoUrl||station.coverArtUrl});
  const decode=createIcyDecoder(Number(response.headers.get('icy-metaint')),update);
  const outgoing=mediaResponseHeaders(response, '/radio-stream');delete outgoing['content-length'];
  res.writeHead(response.status,outgoing);

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for(const audio of decode(value))if(!res.write(audio))await once(res,'drain');
    }
    res.end();
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (!res.destroyed) res.destroy(error);
  } finally {
    reader.releaseLock();
  }
}

async function fetchInternetRadioStream(streamUrl, headers, signal, redirects = 0) {
  if (redirects > 5) {
    const error = new Error('Too many internet radio redirects');
    error.status = 502;
    throw error;
  }

  const response = await requestInternetRadioStream(streamUrl, headers, signal);

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => {});
    // Redirect bodies are discarded; the terminal response is media-type validated before proxying.
    const nextUrl = safeInternetRadioRedirectUrl(location, streamUrl);
    if (!nextUrl) {
      const error = new Error('Internet radio stream URL is blocked');
      error.status = 400;
      error.publicMessage = 'Internet radio stream URL is blocked';
      throw error;
    }
    return fetchInternetRadioStream(nextUrl, headers, signal, redirects + 1);
  }

  const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (response.ok && /scpls|x-pls|mpegurl|m3u/.test(type)) {
    const reader = response.body?.getReader(); let text = '', size = 0;
    try {
      if (reader) for (;;) {
        const {done,value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 65536) throw new Error('Radio playlist is too large');
        text += new TextDecoder().decode(value);
      }
    } finally { await reader?.cancel().catch(()=>{}); }
    // HLS segments need a different proxy contract; never mistake one for a station.
    const lines = text.split(/\r?\n/).map(line=>line.trim());
    const targets = /scpls|x-pls/.test(type)
      ? lines.filter(line=>/^File\d+=/i.test(line)).map(line=>line.slice(line.indexOf('=')+1))
      : lines.filter(line=>line && !line.startsWith('#'));
    const next = !text.includes('#EXT-X-') && safeInternetRadioRedirectUrl(targets[0],streamUrl);
    if (!next) { const error = new Error('Radio playlist has no supported public audio stream'); error.status=502;error.publicMessage=error.message;throw error; }
    return fetchInternetRadioStream(next,headers,signal,redirects+1);
  }
  return response;
}

async function requestInternetRadioStream(streamUrl, headers, signal) {
  const url = new URL(streamUrl);
  const resolvedAddress = await resolveInternetRadioStreamAddress(url);
  const requestHeaders = {
    ...headers,
    Host: url.host
  };
  const requestOptions = {
    protocol: url.protocol,
    hostname: resolvedAddress?.address || url.hostname,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: 'GET',
    headers: requestHeaders,
    signal
  };

  if (resolvedAddress?.family) {
    requestOptions.family = resolvedAddress.family;
  }

  if (url.protocol === 'https:') {
    requestOptions.servername = url.hostname;
  }

  const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolveRequest, rejectRequest) => {
    let timeout;
    const req = requestFn(requestOptions, (upstream) => {
      clearTimeout(timeout);
      upstream.setTimeout(60000, () => {
        const error = new Error('Internet radio stream stalled');
        error.status = 504;
        error.publicMessage = 'Internet radio stream stalled';
        upstream.destroy(error);
      });
      const responseHeaders = new Headers();
      Object.entries(upstream.headers).forEach(([name, value]) => {
        if (Array.isArray(value)) {
          value.forEach((entry) => responseHeaders.append(name, entry));
        } else if (value !== undefined) {
          responseHeaders.set(name, value);
        }
      });
      resolveRequest(new Response(Readable.toWeb(upstream), {
        status: upstream.statusCode || 502,
        statusText: upstream.statusMessage || '',
        headers: responseHeaders
      }));
    });
    timeout = setTimeout(() => {
      const error = new Error('Internet radio stream request timed out');
      error.status = 504;
      error.publicMessage = 'Internet radio stream request timed out';
      req.destroy(error);
    }, 15000);
    req.on('error', (error) => {
      clearTimeout(timeout);
      rejectRequest(error);
    });
    req.end();
  });
}

async function resolveInternetRadioStreamAddress(url) {
  if (allowPrivateRadioStreams) return null;
  if (isBlockedHostname(url.hostname)) {
    const error = new Error('Internet radio stream URL is blocked');
    error.status = 400;
    error.publicMessage = 'Internet radio stream URL is blocked';
    throw error;
  }

  let addresses = [];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch (error) {
    const lookupError = new Error('Internet radio stream host could not be resolved');
    lookupError.status = 502;
    lookupError.publicMessage = 'Internet radio stream host could not be resolved';
    throw lookupError;
  }

  if (!addresses.length) {
    const lookupError = new Error('Internet radio stream host could not be resolved');
    lookupError.status = 502;
    lookupError.publicMessage = 'Internet radio stream host could not be resolved';
    throw lookupError;
  }

  if (addresses.some((address) => isBlockedHostname(address.address))) {
    const error = new Error('Internet radio stream URL is blocked');
    error.status = 400;
    error.publicMessage = 'Internet radio stream URL is blocked';
    throw error;
  }
  // The HTTP client connects to this validated address directly, while preserving Host/SNI.
  return addresses[0] || null;
}

async function navidromeAlbum(id) {
  const result = await fetchNavidrome('/rest/getAlbum.view', { id });
  return { album: result.album };
}

async function proxyNavidromeMedia(req, res, pathname, params = {}) {
  const client=navidromeRequestContext.client(()=>navidromeClientFromConfig(activeNavidromeConfig()));

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const response = await client.request(pathname, params, {
    formatJson: false,
    headers: navidromeRequestHeaders(req),
    signal: controller.signal
  });

  if (!validMediaResponse(response, pathname)) {
    await response.body?.cancel().catch(() => {});
    if (pathname.includes('getCoverArt')) {
      return sendCoverArtFallback(res);
    }
    return sendJson(res, { ok: false, error: 'Navidrome media request failed' }, 502);
  }

  res.writeHead(response.status, mediaResponseHeaders(response, pathname));

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await once(res, 'drain');
      }
    }
    res.end();
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (!res.destroyed) {
      res.destroy(error);
    }
  }
}

async function parseNavidromeResponse(response, options = {}) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) {
    const error = new Error('Navidrome request failed');
    error.status = options.preserveAuthorizationFailure && [401,403].includes(response.status) ? 403 : 502;
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch (parseError) {
    const error = new Error('Navidrome request failed');
    error.status = 502;
    throw error;
  }

  const subsonic = payload['subsonic-response'];
  if (!subsonic || subsonic.status !== 'ok') {
    const error = new Error('Navidrome request failed');
    error.status = options.preserveAuthorizationFailure && [40,50].includes(Number(subsonic?.error?.code)) ? 403
      : options.preserveNotFound && Number(subsonic?.error?.code) === 70 ? 404 : 502;
    throw error;
  }

  return subsonic;
}

function navidromeRequestHeaders(req) {
  return req.headers.range ? { Range: req.headers.range } : {};
}

function radioStreamRequestHeaders() {
  return { 'User-Agent': 'NaviMuse/1.0 Radio Proxy', 'Icy-MetaData':'1' };
}

function streamParams(id, searchParams = new URLSearchParams()) {
  const params = { id };
  const format = searchParams.get('format');
  const maxBitRate = searchParams.get('maxBitRate');

  if (['mp3', 'opus', 'raw'].includes(format)) {
    params.format = format;
  }

  if (/^(0|\d{2,4})$/.test(maxBitRate || '')) {
    params.maxBitRate = maxBitRate;
  }

  return params;
}

function coverArtSize(searchParams = new URLSearchParams()) {
  const size = searchParams.get('size') || '600';
  return ['300', '600', '1000'].includes(size) ? size : '600';
}

function validMediaResponse(response, pathname) {
  const contentType = response.headers.get('content-type') || '';
  const normalizedContentType = contentType.split(';')[0].trim().toLowerCase();
  if (!response.ok) return false;
  if (pathname.includes('getCoverArt')) return contentType.startsWith('image/') || contentType === 'application/octet-stream';
  if (pathname === '/radio-stream') {
    if (/mpegurl|scpls|x-pls|playlist|m3u/.test(normalizedContentType)) return false;
    return normalizedContentType.startsWith('audio/')
      || ['video/mp4', 'video/ogg', 'video/webm'].includes(normalizedContentType)
      || normalizedContentType === 'application/octet-stream';
  }
  if (pathname.includes('stream')) return contentType.startsWith('audio/') || contentType === 'application/octet-stream';
  return true;
}

function mediaResponseHeaders(response, pathname) {
  const headers = {
    'content-type': response.headers.get('content-type') || 'application/octet-stream',
    'cache-control': accountMode==='local' ? 'private, no-store' : pathname.includes('getCoverArt') ? 'public, max-age=86400' : 'no-store',
    'x-content-type-options': 'nosniff'
  };

  ['accept-ranges', 'content-range', 'content-length'].forEach((name) => {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  });

  return headers;
}

function safeInternetRadioRedirectUrl(location, currentUrl) {
  try {
    return safeInternetRadioStreamUrl(location ? new URL(location, currentUrl).href : '');
  } catch {
    return null;
  }
}

function safeInternetRadioStreamUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!allowPrivateRadioStreams && isBlockedHostname(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isBlockedHostname(hostname = '') {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized || ['localhost', '0.0.0.0', '::', '::1'].includes(normalized)) return true;
  const ipv4MappedIpv6 = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (ipv4MappedIpv6) return isBlockedHostname(ipv4MappedIpv6[1]);
  const hexIpv4MappedIpv6 = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexIpv4MappedIpv6) {
    const high = Number.parseInt(hexIpv4MappedIpv6[1], 16);
    const low = Number.parseInt(hexIpv4MappedIpv6[2], 16);
    return isBlockedHostname(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(normalized) || /^fe[89ab][0-9a-f]:/i.test(normalized)) return true;
  const parts = normalized.split('.').map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  }
  return normalized.endsWith('.localhost');
}

function sendCoverArtFallback(res) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="Missing album artwork">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f332e"/>
      <stop offset="0.52" stop-color="#7e3b32"/>
      <stop offset="1" stop-color="#111113"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.35" cy="0.25" r="0.55">
      <stop offset="0" stop-color="#fff6ec" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#fff6ec" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="600" rx="52" fill="url(#bg)"/>
  <rect width="600" height="600" rx="52" fill="url(#glow)"/>
  <circle cx="300" cy="300" r="116" fill="none" stroke="#fff7ef" stroke-opacity="0.35" stroke-width="18"/>
  <circle cx="300" cy="300" r="28" fill="#fff7ef" fill-opacity="0.45"/>
  <path d="M252 252h114v40H252zm0 58h86v38h-86z" fill="#fff7ef" fill-opacity="0.52"/>
</svg>`;
  res.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8',
    // A failed artwork request must not become the cached album cover.
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(svg);
}

function navidromeEndpoint(pathname, params = {}, options = {}) {
  return navidromeEndpointFor(activeNavidromeConfig(),pathname,params,options);
}

function appendSearchParams(searchParams, values = {}) {
  Object.entries(values).forEach(([key, value]) => {
    const entries = Array.isArray(value) ? value : [value];
    entries.forEach((entry) => {
      if (entry !== undefined && entry !== null && entry !== '') searchParams.append(key, String(entry));
    });
  });
}

function publicErrorMessage(error) {
  if (error.publicMessage) return error.publicMessage;
  if (error.status === 503) return error.message;
  return 'Internal server error';
}


function navidromeConfigForSubject(subject) {
 const base=baseNavidromeConfig();
 if(!oidcMusicAccounts)return base;
 const entry=oidcMusicAccounts.get(subject);
 if(!entry)throw new Error('Music account is not assigned');
 return entry.owner?base:{...base,username:entry.username,password:entry.password,decryptionFailed:false};
}
function activeNavidromeConfig(overrides = {}) {
 if(oidcMusicAccounts&&oidcMusicScope.getStore()&&!Object.keys(overrides).length)return navidromeConfigForSubject(oidcMusicScope.getStore());
 return baseNavidromeConfig(overrides);
}
function baseNavidromeConfig(overrides = {}) {
  const hasOverrides = Object.keys(overrides).length > 0;
  if (!hasOverrides && cachedNavidromeConfig?.settingsVersion === settingsVersion) {
    return cachedNavidromeConfig.config;
  }

  const stored = storedSettings.services?.navidrome || {};
  const decryptState = { failed: false };
  const storedPassword = stored.password ? decryptSecret(stored.password, decryptState) : undefined;
  const url = hasOverrides
    ? serviceUrl(overrides.url || stored.url || defaultNavidromeUrl.href, 'NAVIDROME_URL')
    : navidromeUrlStatus(stored.url || defaultNavidromeUrl.href).url;
  if (hasOverrides) assertAllowedNavidromeUrl(url);
  const config = {
    url,
    username: overrides.username ?? stored.username ?? envNavidromeUsername,
    password: overrides.password !== undefined && String(overrides.password).length > 0
      ? decryptSecret(overrides.password, decryptState) || ''
      : storedPassword !== undefined
        ? storedPassword || ''
        : envNavidromePassword,
    decryptionFailed: decryptState.failed
  };
  if (!hasOverrides) cachedNavidromeConfig = { settingsVersion, config };
  return config;
}

function currentNavidromeUrl() {
  const stored = storedSettings.services?.navidrome || {};
  return navidromeUrlStatus(stored.url || defaultNavidromeUrl.href).url;
}

function activeAudiomuseConfig(overrides = {}) {
  const hasOverrides = Object.keys(overrides).length > 0;
  if (!hasOverrides && cachedAudiomuseConfig?.settingsVersion === settingsVersion) {
    return cachedAudiomuseConfig.config;
  }

  const stored = storedSettings.services?.audiomuse || {};
  const decryptState = { failed: false };
  const storedToken = stored.token ? decryptSecret(stored.token, decryptState) : undefined;
  const url = hasOverrides
    ? serviceUrl(overrides.url || stored.url || defaultAudiomuseUrl.href, 'AUDIOMUSE_URL')
    : audiomuseUrlStatus(stored.url || defaultAudiomuseUrl.href).url;
  if (hasOverrides) assertAllowedAudiomuseUrl(url);
  const config = {
    url,
    token: overrides.token !== undefined && String(overrides.token).length > 0
      ? decryptSecret(overrides.token, decryptState) || ''
      : storedToken !== undefined
        ? storedToken || ''
        : envAudiomuseToken,
    decryptionFailed: decryptState.failed
  };
  if (!hasOverrides) cachedAudiomuseConfig = { settingsVersion, config };
  return config;
}

function navidromeUrlStatus(value) {
  try {
    const url = serviceUrl(value || defaultNavidromeUrl.href, 'NAVIDROME_URL');
    assertAllowedNavidromeUrl(url);
    return { allowed: true, effectiveUrl: url.href, url };
  } catch (error) {
    if (error.status === 400 || error instanceof TypeError || /must use http or https/.test(error.message || '')) {
      return { allowed: false, effectiveUrl: defaultNavidromeUrl.href, url: defaultNavidromeUrl };
    }
    throw error;
  }
}

function audiomuseUrlStatus(value) {
  try {
    const url = serviceUrl(value || defaultAudiomuseUrl.href, 'AUDIOMUSE_URL');
    assertAllowedAudiomuseUrl(url);
    return { allowed: true, effectiveUrl: url.href, url };
  } catch (error) {
    if (error.status === 400 || error instanceof TypeError || /must use http or https/.test(error.message || '')) {
      return { allowed: false, effectiveUrl: defaultAudiomuseUrl.href, url: defaultAudiomuseUrl };
    }
    throw error;
  }
}

async function testNavidromeConfig(payload = {}) {
  const config = activeNavidromeConfig(payload);
  if (!config.username || !config.password) {
    return {
      ok: false,
      error: 'Navidrome username and password are required'
    };
  }

  try {
    const response = await fetch(navidromeEndpointForConfig(config, '/rest/ping.view'), {
      redirect: 'manual',
      signal: AbortSignal.timeout(6000)
    });
    await parseNavidromeResponse(response);
    return {
      ok: true,
      status: response.status,
      url: publicServiceUrl(config.url.href),
      username: config.username
    };
  } catch (error) {
    return {
      ok: false,
      error: 'Navidrome login test failed'
    };
  }
}

async function testAudiomuseConfig(payload = {}) {
  const config = activeAudiomuseConfig(payload);

  try {
    const response = await fetch(serviceEndpoint(config.url, '/api/health'), {
      headers: authHeaders(config),
      redirect: 'manual',
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) {
      return {
        ok: false,
        error: response.status === 401 || response.status === 403
          ? 'AudioMuse authentication failed'
          : 'AudioMuse health test failed'
      };
    }
    return {
      ok: true,
      status: response.status,
      url: publicServiceUrl(config.url.href),
      tokenSet: Boolean(config.token)
    };
  } catch (error) {
    return {
      ok: false,
      error: 'AudioMuse health test failed'
    };
  }
}

function navidromeEndpointForConfig(config, pathname, params = {}, options = {}) {
  const url = new URL(serviceEndpoint(config.url, pathname));
  const salt = randomBytes(6).toString('hex');
  const query = {
    ...params,
    u: config.username,
    s: salt,
    t: createHash('md5').update(`${config.password}${salt}`).digest('hex'),
    v: '1.16.1',
    c: 'NaviMuse'
  };
  if (options.formatJson !== false) {
    query.f = 'json';
  }

  appendSearchParams(url.searchParams, query);

  return url.href;
}

function readSettingsFile() {
  try {
    if (!existsSync(settingsFile)) return {};
    const parsed = JSON.parse(readFileSync(settingsFile, 'utf8'));
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch (error) {
    console.error(`Could not read NaviMuse settings from ${settingsFile}: ${error.message}`);
    return {};
  }
}

function updateSettings(mutator) {
  settingsWriteQueue = settingsWriteQueue
    .catch(() => storedSettings)
    .then((latestSettings) => {
      const currentSettings = latestSettings && typeof latestSettings === 'object' ? latestSettings : storedSettings;
      const nextSettings = mutator(currentSettings);
      const writtenSettings = writeSettingsFile(nextSettings);
      storedSettings = writtenSettings;
      settingsVersion += 1;
      cachedNavidromeConfig = null;
      cachedAudiomuseConfig = null;
      atlasMapService.invalidate();
      return storedSettings;
    });
  return settingsWriteQueue;
}

function writeSettingsFile(settings) {
  mkdirSync(dataDir, { recursive: true });
  const tempFile = `${settingsFile}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  renameSync(tempFile, settingsFile);
  return settings;
}

function ensureAdminSessionSecret(settings) {
  if ((!settings.admin?.passwordHash && !oidcEnabled) || settings.admin?.sessionSecret) return settings;
  return writeSettingsFile({
    ...settings,
    admin: {
      ...(settings.admin || {}),
      sessionSecret: randomBytes(32).toString('base64url')
    }
  });
}

function publicSettings(req) {
  const stored = storedSettings.services?.navidrome || {};
  const storedAudiomuse = storedSettings.services?.audiomuse || {};
  const canReadSensitiveStatus = authenticated(req);
  const url = stored.url || defaultNavidromeUrl.href;
  const urlStatus = safeNavidromeUrlStatus(url);
  const entry=oidcMusicAccounts?.get(verifiedSession(req)?.sub);
  const username = entry&&!entry.owner?entry.username:stored.username || envNavidromeUsername || '';
  const passwordSet = Boolean(stored.password || envNavidromePassword);
  const source = stored.username || stored.password || stored.url ? 'app' : 'environment';
  const decryptionFailed = canReadSensitiveStatus && stored.password ? storedSecretDecryptionFailed(stored.password) : false;
  const audiomuseUrl = storedAudiomuse.url || defaultAudiomuseUrl.href;
  const audiomuseUrlState = safeAudiomuseUrlStatus(audiomuseUrl);
  const audiomuseTokenSet = Boolean(storedAudiomuse.token || envAudiomuseToken);
  const audiomuseSource = storedAudiomuse.token || storedAudiomuse.url ? 'app' : 'environment';
  const audiomuseDecryptionFailed = canReadSensitiveStatus && storedAudiomuse.token ? storedSecretDecryptionFailed(storedAudiomuse.token) : false;
  const decryptionFailedServices = [];
  if (decryptionFailed) decryptionFailedServices.push('navidrome');
  if (audiomuseDecryptionFailed) decryptionFailedServices.push('audiomuse');
  const managed = Boolean(oidcMusicAccounts && !entry?.owner);
  if(managed) return {
    preferences: sanitizePreferences(entry ? storedSettings.subjectPreferences?.[verifiedSession(req).sub] || {} : {}),
    services: {
      navidrome: {managed:true, configured:Boolean(entry && username && (entry.password || passwordSet))},
      audiomuse: {managed:true, configured:Boolean(entry && audiomuseTokenSet)}
    },
    security: {adminConfigured:adminConfigured(), canManageServices:false}
  };
  return {
    preferences: sanitizePreferences(entry&&!entry.owner?storedSettings.subjectPreferences?.[verifiedSession(req).sub]||{}:storedSettings.preferences || {}),
    services: {
      navidrome: {
        configured: Boolean(username && passwordSet),
        source: canReadSensitiveStatus ? source : '',
        url: canReadSensitiveStatus ? url : publicServiceUrl(urlStatus.effectiveUrl),
        username: canReadSensitiveStatus ? username : '',
        usernameSet: canReadSensitiveStatus ? Boolean(username) : false,
        passwordSet: canReadSensitiveStatus ? passwordSet : false,
        urlAllowed: canReadSensitiveStatus ? urlStatus.allowed : true,
        activeUrl: canReadSensitiveStatus ? urlStatus.effectiveUrl : ''
      },
      audiomuse: {
        configured: canReadSensitiveStatus ? audiomuseTokenSet : false,
        source: canReadSensitiveStatus ? audiomuseSource : '',
        url: canReadSensitiveStatus ? audiomuseUrl : publicServiceUrl(defaultAudiomuseUrl.href),
        tokenSet: canReadSensitiveStatus ? audiomuseTokenSet : false,
        urlAllowed: canReadSensitiveStatus ? audiomuseUrlState.allowed : undefined,
        activeUrl: canReadSensitiveStatus ? audiomuseUrlState.effectiveUrl : '',
        decryptionFailed: canReadSensitiveStatus ? audiomuseDecryptionFailed : false
      }
    },
    security: {
      adminConfigured: adminConfigured(),
      canManageServices: true,
      credentialStorage: 'private-volume-encrypted',
      decryptionFailed: decryptionFailedServices.length > 0,
      decryptionFailedServices: canReadSensitiveStatus ? decryptionFailedServices : []
    }
  };
}

function safeNavidromeUrlStatus(value) {
  try {
    return navidromeUrlStatus(value);
  } catch (error) {
    return { allowed: false, effectiveUrl: defaultNavidromeUrl.href, url: defaultNavidromeUrl };
  }
}

function safeAudiomuseUrlStatus(value) {
  try {
    return audiomuseUrlStatus(value);
  } catch (error) {
    return { allowed: false, effectiveUrl: defaultAudiomuseUrl.href, url: defaultAudiomuseUrl };
  }
}

function storedSecretDecryptionFailed(value) {
  const state = { failed: false };
  decryptSecret(value, state);
  return state.failed;
}

function adminConfigured() {
  return oidcEnabled || Boolean(storedSettings.admin?.passwordHash);
}

function requireSettingsAuth(req, res) {
  if (!adminConfigured()) {
    sendJson(res, { ok: false, error: 'NaviMuse admin setup is required' }, 401);
    return false;
  }

  if (!authenticated(req)) {
    sendJson(res, { ok: false, error: oidcEnabled ? 'Sign in with Pocket ID to make changes' : 'Unlock NaviMuse Settings to make changes' }, 401);
    return false;
  }

  if(oidcMusicAccounts&&!oidcMusicAccounts.get(verifiedSession(req)?.sub)?.owner&&new URL(req.url,'http://localhost').pathname.startsWith('/api/settings/')){sendJson(res,{ok:false,error:'Music connections are managed by the owner.'},403);return false;}
  return true;
}

function requireAppAuth(req, res) {
  // Setup has its own token-gated route. Upstream data is private even before
  // the first administrator is configured.
  if (!adminConfigured()) {
    sendJson(res, { ok: false, error: 'NaviMuse admin setup is required' }, 401);
    return false;
  }

  if (!authenticated(req)) {
    sendJson(res, { ok: false, error: oidcEnabled ? 'Sign in with Pocket ID to access your music library' : 'Unlock NaviMuse to access your music library' }, 401);
    return false;
  }

  return true;
}

/**
 * CSRF-resistant write boundary for playlist POST/PATCH/DELETE.
 *
 * A cross-origin simple request cannot set a custom request header, so
 * requiring `X-Requested-With: NaviMuse` on every body-bearing write (and on
 * DELETE) prevents a cross-origin form or <img>-triggered request from
 * mutating playlists. Authenticated server-to-server and test usage may send
 * `X-Requested-With: NaviMuse-Server` instead to preserve non-browser access.
 */
function requireWriteOrigin(req, res) {
  const header = String(req.headers['x-requested-with'] || '').trim().toLowerCase();
  if (header === 'navimuse' || header === 'navimuse-server') {
    return true;
  }
  sendJson(res, { ok: false, error: 'Missing or invalid X-Requested-With header' }, 403);
  return false;
}

function applyNativeApiCors(req, res, url) {
  if (!url.pathname.startsWith('/api/')) return false;
  const origin = nativeApiOrigin(req.headers.origin);
  if (!origin) return false;

  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-methods', 'GET,HEAD,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'accept,content-type,range,x-requested-with,x-request-id');
  res.setHeader('vary', 'Origin');

  if (req.method !== 'OPTIONS') return false;
  res.writeHead(204, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end();
  return true;
}

function nativeApiOrigin(origin) {
  const value = String(origin || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return '';
    const hostname = url.hostname.toLowerCase();
    if (url.protocol === 'tauri:' && hostname === 'localhost') return value;
    if ((url.protocol === 'http:' || url.protocol === 'https:') && hostname === 'tauri.localhost') return value;
  } catch {
    return '';
  }
  return '';
}

function queueScopeForSubject(subject) {
 const config=oidcMusicAccounts?navidromeConfigForSubject(subject):activeNavidromeConfig();
 const identity=subject?['oidc',oidcIssuer?.href||'',subject]:['local-admin'];
 const namespace=JSON.stringify(['queue-scope-v1',identity,config.url.href,config.username]);
 return `queue-scope-v1:${createHmac('sha256',deriveSettingsSubkey('navimuse:queue-scope:v1')).update(namespace).digest('hex')}`;
}

function sessionStatus(req, authenticatedOverride) {
  const session = verifiedSession(req);
  let queueScope;
  // Only the principal from a verified signed cookie defines this namespace.
  // An override reports a just-completed login; it cannot supply a principal.
  if (session) {
    queueScope=queueScopeForSubject(session.sub);
  }
  return {
    ok: true,
    adminConfigured: adminConfigured(),
    authenticated: authenticatedOverride ?? Boolean(session),
    authMode: oidcEnabled ? 'oidc' : 'password',
    loginUrl: oidcEnabled ? '/api/auth/login' : null,
    user: session?.sub ? { sub: session.sub, name: session.name || '', email: session.email || '' } : null,
    ...(queueScope ? { queueScope } : {})
  };
}

function setSessionCookie(req, res) {
  res.setHeader('set-cookie', sessionCookie(req, signedSessionToken()));
}

function authenticated(req) {
  if (!adminConfigured()) return false;
  return Boolean(verifiedSession(req));
}

function verifiedSession(req) {
  if (!adminConfigured()) return null;
  const session = verifySessionToken(cookies(req).navimuse_session);
  if (oidcEnabled && !session?.sub) return null;
  if(oidcMusicAccounts&&!oidcMusicAccounts.get(session?.sub))return null;
  return session;
}

function sessionCookie(req, value, options = {}) {
  const maxAge = options.maxAge ?? sessionMaxAgeSeconds;
  const secure = requestIsSecure(req) ? '; Secure' : '';
  return `navimuse_session=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function requestIsSecure(req) {
  return (process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-proto'] === 'https') || req.socket?.encrypted;
}

function signedSessionToken(identity = {}) {
  const payload = Buffer.from(JSON.stringify({
    issuedAt: Date.now(),
    exp: Date.now() + sessionMaxAgeSeconds * 1000,
    gen: sessionGeneration(identity.sub),
    ...(musicProvisioning?{musicRevision:musicProvisioning.revision(identity.sub)}:{}),
    nonce: randomBytes(16).toString('base64url'),
    ...identity
  })).toString('base64url');
  const signature = createHmac('sha256', sessionSigningKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = createHmac('sha256', sessionSigningKey()).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Number(decoded.gen || 0) !== sessionGeneration(decoded.sub)) return null;
    if(musicProvisioning && Number(decoded.musicRevision||0)!==musicProvisioning.revision(decoded.sub))return null;
    if (!Number.isSafeInteger(decoded.exp) || decoded.exp <= Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function sessionGeneration(subject) {
  if(oidcMusicAccounts&&subject)return Number(storedSettings.security?.subjectGenerations?.[subject]??storedSettings.security?.sessionGeneration??0);
  return Number(storedSettings.security?.sessionGeneration || 0);
}

function safeEqual(left, right) {
  const leftHash = createHash('sha256').update(String(left)).digest();
  const rightHash = createHash('sha256').update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function loginThrottle(req) {
  cleanupLoginAttempts();
  const key = clientKey(req);
  const attempt = loginAttempts.get(key);
  return {
    blocked: Boolean(attempt?.lockedUntil && attempt.lockedUntil > Date.now())
  };
}

function recordFailedLogin(req) {
  const key = clientKey(req);
  const now = Date.now();
  const current = loginAttempts.get(key) || { count: 0, firstFailedAt: now, lockedUntil: 0 };
  const count = current.count + 1;
  loginAttempts.set(key, {
    count,
    firstFailedAt: current.firstFailedAt || now,
    lockedUntil: count >= 5 ? now + 5 * 60_000 : 0
  });
}

function clearFailedLogin(req) {
  loginAttempts.delete(clientKey(req));
}

function cleanupLoginAttempts() {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts.entries()) {
    if (attempt.lockedUntil && attempt.lockedUntil <= now) loginAttempts.delete(key);
    if (!attempt.lockedUntil && attempt.firstFailedAt && now - attempt.firstFailedAt > 10 * 60_000) {
      loginAttempts.delete(key);
    }
  }
}

function clientKey(req) {
  if (process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return String(req.socket?.remoteAddress || 'unknown');
}

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        try {
          return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
        } catch (error) {
          return [part.slice(0, index), part.slice(index + 1)];
        }
      })
  );
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await pbkdf2Promise(password, salt, 310000, 32, 'sha256')).toString('hex');
  return `pbkdf2_sha256$310000$${salt}$${hash}`;
}

async function verifyAdminPassword(password) {
  const stored = storedSettings.admin?.passwordHash || '';
  const [algorithm, iterationsRaw, salt, expectedHash] = stored.split('$');
  if (algorithm !== 'pbkdf2_sha256' || !salt || !expectedHash) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 10_000_000) return false;

  const actual = await pbkdf2Promise(password, salt, iterations, 32, 'sha256');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function pbkdf2Promise(password, salt, iterations, keylen, digest) {
  return new Promise((resolvePbkdf2, rejectPbkdf2) => {
    pbkdf2(password, salt, iterations, keylen, digest, (error, derivedKey) => {
      if (error) {
        rejectPbkdf2(error);
        return;
      }
      resolvePbkdf2(derivedKey);
    });
  });
}

function sanitizePreferences(input = {}) {
  const continuation = normalizeContinuationPreferences(input.playback);
  return {
    appearance: normalizeAppearance(input.appearance),
    streaming: {
      cellularFormat: pick(input.streaming?.cellularFormat, ['opus', 'mp3'], 'opus'),
      cellularBitrate: pick(input.streaming?.cellularBitrate, ['96', '128', '192', '256', '320'], '128'),
      wifiFormat: pick(input.streaming?.wifiFormat, ['raw', 'mp3'], 'raw'),
      wifiBitrate: pick(input.streaming?.wifiBitrate, ['0', '320', '256', '192'], '0')
    },
    playback: {
      replayGain: pick(input.playback?.replayGain, ['off', 'track', 'album'], 'album'),
      ...normalizeTransitionPreferences(input.playback),
      ...continuation,
      startFullScreen: Boolean(input.playback?.startFullScreen ?? true)
    },
    discovery: {
      homeArtistRadios: Boolean(input.discovery?.homeArtistRadios ?? input.discovery?.homeSonicMixes ?? true),
      homeSonicMixes: Boolean(input.discovery?.homeSonicMixes ?? true),
      homeSmartPlaylists: Boolean(input.discovery?.homeSmartPlaylists ?? true),
      homeRadios: Boolean(input.discovery?.homeRadios ?? true),
      homeAudioMuse: Boolean(input.discovery?.homeAudioMuse ?? true),
      smartPlaylistScope: pick(input.discovery?.smartPlaylistScope, ['music', 'all'], 'music')
    },
    library: {
      selectedFolders: Array.isArray(input.library?.selectedFolders)&&input.library.selectedFolders.length>0? [...new Set(input.library.selectedFolders.filter(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id)))].slice(0,64):null,
      defaultView: pick(input.library?.defaultView, ['grid', 'cover', 'list'], 'grid'),
      artworkSize: pick(input.library?.artworkSize, ['300', '600', '1000'], '600')
    }
  };
}

function navidromeOverrides(input = {}) {
  const url = serviceUrl(input.url || defaultNavidromeUrl.href, 'Navidrome URL');
  assertAllowedNavidromeUrl(url);
  const overrides = {
    url: url.href,
    username: String(input.username || '').trim()
  };
  if (String(input.password || '').length > 0) {
    overrides.password = encryptSecret(String(input.password));
  }
  return overrides;
}

function safeNavidromeOverrides(input = {}) {
  try {
    return {
      ok: true,
      value: navidromeOverrides(input)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'Invalid Navidrome settings'
    };
  }
}

function audiomuseOverrides(input = {}) {
  const url = serviceUrl(input.url || defaultAudiomuseUrl.href, 'AudioMuse URL');
  assertAllowedAudiomuseUrl(url);
  const overrides = {
    url: url.href
  };
  if (String(input.token || '').length > 0) {
    overrides.token = encryptSecret(String(input.token));
  }
  return overrides;
}

function safeAudiomuseOverrides(input = {}) {
  try {
    return {
      ok: true,
      value: audiomuseOverrides(input)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'Invalid AudioMuse settings'
    };
  }
}

function allowedNavidromeHosts() {
  const hosts = new Set([normalizedAllowedHost(defaultNavidromeUrl.host)]);
  String(process.env.NAVIMUSE_ALLOWED_NAVIDROME_HOSTS || '')
    .split(',')
    .map((host) => normalizedAllowedHost(host))
    .filter(Boolean)
    .forEach((host) => hosts.add(host));
  return hosts;
}

function allowedAudiomuseHosts() {
  const hosts = new Set([normalizedAllowedHost(defaultAudiomuseUrl.host)]);
  String(process.env.NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS || '')
    .split(',')
    .map((host) => normalizedAllowedHost(host))
    .filter(Boolean)
    .forEach((host) => hosts.add(host));
  return hosts;
}

function assertAllowedNavidromeUrl(url) {
  if (allowAnyNavidromeUrl) return;
  const host = normalizedAllowedHost(url.host);
  if (navidromeAllowedHosts.has(host)) return;

  const error = new Error('Navidrome URL host is not allowed');
  error.status = 400;
  throw error;
}

function assertAllowedAudiomuseUrl(url) {
  if (allowAnyAudiomuseUrl) return;
  const host = normalizedAllowedHost(url.host);
  if (audiomuseAllowedHosts.has(host)) return;

  const error = new Error('AudioMuse URL host is not allowed');
  error.status = 400;
  throw error;
}

function normalizedAllowedHost(host) {
  const trimmed = String(host || '').trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.includes('*') || trimmed.startsWith('0.0.0.0') || /^\[?::\]?(:\d+)?$/.test(trimmed)) return '';
  const ipv6Match = trimmed.match(/^\[?([0-9a-f:]+)\]?:(\d+)$/i);
  if (ipv6Match && ipv6Match[1].includes(':')) {
    return `[${ipv6Match[1]}]:${ipv6Match[2]}`;
  }
  return trimmed;
}

function encryptSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptSecret(value, state = null) {
  if (!value) return '';
  if (!String(value).startsWith('enc:v1:')) return String(value);

  try {
    const [, , iv, tag, encrypted] = String(value).split(':');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final()
    ]).toString('utf8');
    return decrypted;
  } catch (error) {
    if (state) state.failed = true;
    console.error(`Could not decrypt NaviMuse stored secret: ${error.message}`);
    return '';
  }
}

function settingsKey() {
  if (cachedSettingsKey) return cachedSettingsKey;

  mkdirSync(dataDir, { recursive: true });
  if (existsSync(settingsKeyFile)) {
    repairFileMode(settingsKeyFile, 0o600);
    cachedSettingsKey = readFileSync(settingsKeyFile);
    return cachedSettingsKey;
  }

  cachedSettingsKey = randomBytes(32);
  writeAtomicFile(settingsKeyFile, cachedSettingsKey, 0o600);
  return cachedSettingsKey;
}

function writeAtomicFile(filePath, contents, mode) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempFile, contents, { mode });
  renameSync(tempFile, filePath);
}

function repairFileMode(filePath, mode) {
  try {
    if ((statSync(filePath).mode & 0o777) !== mode) {
      chmodSync(filePath, mode);
    }
  } catch (error) {
    console.warn(`Could not repair permissions for ${filePath}: ${error.message}`);
  }
}

function encryptionKey() {
  return deriveSettingsSubkey('navimuse:settings-encryption:v1');
}

function sessionSigningKey() {
  const sessionSecret = storedSettings.admin?.sessionSecret;
  if (!sessionSecret) throw new Error('NaviMuse admin session secret is not configured');
  return createHmac('sha256', deriveSettingsSubkey('navimuse:session-signing:v1'))
    .update(sessionSecret)
    .digest();
}

function oidcTransactionCookie(req, value, options = {}) {
  const maxAge = options.maxAge ?? 600;
  const secure = requestIsSecure(req) ? '; Secure' : '';
  return `navimuse_oidc=${value}; Path=/api/auth/callback; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function signedOidcTransaction(transaction) {
  const payload = Buffer.from(JSON.stringify(transaction)).toString('base64url');
  const signature = createHmac('sha256', deriveSettingsSubkey('navimuse:oidc-transaction:v1')).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyOidcTransaction(token) {
  if (!token || token.split('.').length !== 2) return null;
  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', deriveSettingsSubkey('navimuse:oidc-transaction:v1')).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const transaction = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!transaction.state || !transaction.nonce || !transaction.codeVerifier || Number(transaction.exp) <= Date.now()) return null;
    return transaction;
  } catch {
    return null;
  }
}

function pocketIdConfiguration() {
  if (!oidcConfigurationPromise) {
    const options = process.env.NODE_ENV === 'test' ? { execute: [oidc.allowInsecureRequests] } : undefined;
    oidcConfigurationPromise = oidc.discovery(oidcIssuer, oidcClientId, oidcClientSecret, undefined, options).catch((error) => {
      oidcConfigurationPromise = null;
      throw error;
    });
  }
  return oidcConfigurationPromise;
}

function redirectWithAuthError(res, message) {
  const target = new URL('/', oidcRedirectUri || 'http://localhost');
  target.searchParams.set('auth_error', message);
  res.writeHead(302, { location: `${target.pathname}${target.search}`, 'cache-control': 'no-store' });
  res.end();
}

function optionalHttpsUrl(value, name) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' && process.env.NODE_ENV !== 'test') throw new Error(`${name} must use HTTPS`);
  return parsed;
}

function secretFromEnvOrFile(envName, fileEnvName, { optionalFile = false } = {}) {
  const direct = String(process.env[envName] || '').trim();
  if (direct) return direct;
  const file = String(process.env[fileEnvName] || '').trim();
  if (!file) return '';
  try {
    return readFileSync(file, 'utf8').trim();
  } catch (error) {
    if (optionalFile && error?.code === 'ENOENT') return '';
    throw error;
  }
}

function deriveSettingsSubkey(label) {
  return createHmac('sha256', settingsKey()).update(label).digest();
}

function setupTokenValue() {
  if (process.env.NAVIMUSE_SETUP_TOKEN) {
    const token = process.env.NAVIMUSE_SETUP_TOKEN.trim();
    if (token.length < 16) {
      throw new Error('NAVIMUSE_SETUP_TOKEN must be at least 16 characters');
    }
    return token;
  }

  if (process.env.NODE_ENV === 'test') {
    return 'test-setup-token';
  }

  try {
    mkdirSync(dataDir, { recursive: true });
    if (existsSync(setupTokenFile)) {
      const existingToken = readFileSync(setupTokenFile, 'utf8').trim();
      if (existingToken) return existingToken;
    }

    const token = randomBytes(18).toString('base64url');
    writeAtomicFile(setupTokenFile, `${token}\n`, 0o600);
    return token;
  } catch (error) {
    throw new Error(`Could not prepare NaviMuse setup token at ${setupTokenFile}: ${error.message}`);
  }
}

function removeSetupTokenFile() {
  try {
    if (existsSync(setupTokenFile)) unlinkSync(setupTokenFile);
  } catch (error) {
    console.error(`Could not remove NaviMuse setup token file ${setupTokenFile}: ${error.message}`);
  }
}

function verifySetupToken(candidate) {
  return setupToken.length >= 16 && String(candidate || '').length > 0 && safeEqual(candidate, setupToken);
}

function navidromeCredentialsPresent() {
  const stored = storedSettings.services?.navidrome || {};
  return Boolean((stored.username || envNavidromeUsername) && (stored.password || envNavidromePassword));
}

function pick(value, allowed, fallback) {
  return allowed.includes(String(value)) ? String(value) : fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

async function readJsonBody(req, maxLength = 100_000) {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    const error = new Error('Content-Type must be application/json');
    error.status = 415;
    error.publicMessage = error.message;
    throw error;
  }

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxLength) {
      const error = new Error('Request body is too large');
      error.status = 413;
      error.publicMessage = error.message;
      throw error;
    }
  }

  if (!body.trim()) return {};

  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    const parseError = new Error('Invalid JSON request body');
    parseError.status = 400;
    parseError.publicMessage = parseError.message;
    throw parseError;
  }
}

async function readLoginJsonBody(req) {
  try {
    return await readJsonBody(req);
  } catch (error) {
    recordFailedLogin(req);
    throw error;
  }
}

async function checkService(name, url, headers = {}) {
  const start = Date.now();

  try {
    const response = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(3500)
    });

    return {
      name,
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      error: 'unreachable'
    };
  }
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  let filePath = staticFilePath(url.pathname);

  if (!isInsideDirectory(distDir, filePath) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html');
  }

  const ext = extname(filePath);
  const headers = {
    'content-type': mimeTypes[ext] || 'application/octet-stream',
    'cache-control': staticResponseCacheControl(url.pathname, ext),
    'x-content-type-options': 'nosniff'
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}

function staticResponseCacheControl(pathname, extension) {
  if ((/^\/sw(?:-v\d+)?\.js$/).test(pathname) || extension === '.html') return 'no-store';
  return 'public, max-age=31536000, immutable';
}

function sendJson(res, body, status = 200, extraHeaders = {}, headOnly = false) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders
  });
  res.end(headOnly ? undefined : JSON.stringify(body));
}

function methodNotAllowed(res, allow = 'GET, HEAD') { res.writeHead(405, { allow }); res.end('Method Not Allowed'); }
function notModified(res, etag) { res.writeHead(304, { etag, 'cache-control': 'no-store' }); res.end(); }
function etagMatches(header, etag) { const value=String(header||'').trim();if(value==='*')return true;const target=etag.replace(/^W\//,'');return value.split(',').map(part=>part.trim().replace(/^W\//,'')).includes(target); }
function atlasRequestId(req) { const value=String(req.headers['x-request-id']||'').trim();return /^[A-Za-z0-9._~-]{1,128}$/.test(value)?value:`atlas-${randomBytes(10).toString('hex')}`; }
function atlasErrorStatus(code, explicit) { if(Number.isInteger(explicit))return explicit;return code==='INVALID_REQUEST'?400:code==='IDENTITY_MISMATCH'?409:code==='RESOLUTION_TIMEOUT'?504:502; }

function authHeaders(config = activeAudiomuseConfig()) {
  return config.token ? { Authorization: `Bearer ${config.token}` } : {};
}

function serviceUrl(value, envName = 'service URL') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${envName} must use http or https`);
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function serviceEndpoint(baseUrl, pathname) {
  const url = new URL(baseUrl.href);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${pathname}`;
  return url.href;
}

function staticFilePath(pathname) {
  const requested = decodeStaticPath(pathname);
  if (!requested) {
    return join(distDir, 'index.html');
  }

  const candidate = resolve(distDir, `.${requested}`);
  return isInsideDirectory(distDir, candidate) ? candidate : join(distDir, 'index.html');
}

function isInsideDirectory(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!isAbsolute(path) && !path.startsWith('..') && !path.startsWith(`..${sep}`));
}

function decodeStaticPath(pathname) {
  try {
    const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
    return requested.includes('\0') ? null : requested;
  } catch (error) {
    return null;
  }
}

function decodePathParam(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    const error = new Error('Invalid encoded path parameter');
    error.status = 400;
    error.publicMessage = 'Invalid encoded path parameter';
    throw error;
  }
}

function publicServiceUrl(value) {
  return value.replace('http://navidrome:4533', process.env.PUBLIC_NAVIDROME_URL || 'http://navidrome:4533')
    .replace(
      'http://audiomuse-ai-flask-app:8000',
      process.env.PUBLIC_AUDIOMUSE_URL || 'http://audiomuse-ai-flask-app:8000'
    );
}

export {
  server,
  wiimRequestFor,
  authHeaders,
  fetchAudioMuseMap,
  fetchAudioMuseLyrics,
  fetchAudioMuseSimilar,
  atlasMapService,
  mediaResponseHeaders,
  normalizeAudioMuseCandidates,
  navidromeEndpoint,
  navidromeScrobble,
  navidromeRequestHeaders,
  parseNavidromeResponse,
  proxyJson,
  publicErrorMessage,
  redactText,
  publicServiceUrl,
  serviceEndpoint,
  sendCoverArtFallback,
  serviceUrl,
  streamParams,
  validMediaResponse,
  staticFilePath,
  staticResponseCacheControl,
  isInsideDirectory,
  decodeStaticPath,
  safeInternetRadioStreamUrl,
  safeInternetRadioRedirectUrl,
  isBlockedHostname
};
