import {defaultAccountPreferences} from '../shared/accountPreferences.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('production entry scopes music, tears down on logout and restores saved Library preferences after sign-in',async(t)=>{
 // This fixture exercises account actions; background polling is covered separately.
 t.mock.timers.enable({apis:['setInterval']});
 const window=new Window({url:'http://localhost/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent','MutationObserver','ResizeObserver']) globalThis[key]=key==='window'?window:window[key];
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const scope='queue-scope-v2:'+'a'.repeat(64);
 const signedOut={version:'navimuse-account/v1',mode:'local',state:'signed-out',methods:{password:true,passkey:false,oidc:false},account:null,session:null,queueScope:null};
 const signedIn={...signedOut,state:'authenticated',account:{id:'10000000-0000-4000-8000-000000000001',username:'owner',displayName:'QA Listener',roles:['owner','listener']},session:{authenticatedAt:100,expiresAt:200,deviceId:null},queueScope:scope};
 let session=signedOut;
 let savedPreferences=defaultAccountPreferences(),preferenceRevision=0,preferencesUnavailable=false;
 const requests=[];
 Object.defineProperty(navigator,'locks',{value:{request:async(_name,_options,run)=>run()},configurable:true});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input),'http://localhost');requests.push({url,init});
  if(url.pathname==='/api/auth/v1/preferences') {
   if(preferencesUnavailable && init.method==='GET')return Response.json({code:'UNAVAILABLE'},{status:503});
   if(init.method==='PUT') {
    const body=JSON.parse(init.body);assert.equal(body.expectedAccountId,session.account.id);
    if(body.expectedRevision!==preferenceRevision)return Response.json({code:'PREFERENCES_CHANGED'},{status:409});
    savedPreferences=body.preferences;preferenceRevision++;
   }
   return Response.json({...(init.method==='PUT'?{ok:true}:{}),version:'navimuse-preferences/v1',accountId:session.account.id,revision:preferenceRevision,preferences:savedPreferences});
  }
  if(url.pathname==='/api/config')return Response.json({app:'NaviMuse',accountMode:'local',accountApi:'navimuse-account/v1',services:{}});
  if(url.pathname==='/api/auth/v1/session')return Response.json(session);
  if(url.pathname==='/api/auth/v1/refresh')return Response.json({code:'REFRESH_NOT_CURRENT'},{status:409});
  if(url.pathname==='/api/auth/v1/password/login'){
   assert.equal(init.method,'POST');assert.equal(init.credentials,'include');
   assert.deepEqual(JSON.parse(init.body),{username:'owner',password:'  Exact QA password  ',remember:true});
   session=signedIn;return Response.json(session);
  }
  if(url.pathname==='/api/auth/v1/logout'){session=signedOut;return Response.json({ok:true});}
  if(url.pathname==='/api/navidrome/bootstrap')return Response.json({musicFolders:[],recentAlbums:[],newestAlbums:[{id:'qa-album',name:'Entry QA Album',artist:'QA Artist',coverArt:'qa-cover'}],randomAlbums:[],frequentAlbums:[]});
  if(url.pathname==='/api/navidrome/library/playlists')return Response.json({playlists:[]});
  return Response.json({code:'ACCOUNT_ROUTE_UNAVAILABLE'},{status:503});
 };
 const node=document.createElement('div');node.id='root';document.body.append(node);
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
 const wait=async check=>{for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Production entry did not reach expected state: '+node.textContent.slice(0,400));};
 try {
  await vite.ssrLoadModule('/src/main.jsx');
  await wait(()=>node.textContent.includes('Welcome back'));
  assert.equal(node.querySelectorAll('audio').length,0);
  assert.equal(requests.some(r=>r.url.pathname.startsWith('/api/navidrome/')),false);
  const {flushSync}=await import('react-dom');
  const fill=(selector,value)=>flushSync(()=>{const el=node.querySelector(selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
  fill('[autocomplete="username"]','owner');fill('[type="password"]','  Exact QA password  ');
  flushSync(()=>node.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  await wait(()=>node.textContent.includes('Entry QA Album'));
  assert.equal(node.querySelectorAll('audio').length,2);
  const music=requests.filter(r=>r.url.pathname.startsWith('/api/navidrome/'));
  assert.ok(music.length>0);for(const r of music)assert.equal(r.url.searchParams.get('accountScope'),scope);
  const art=[...node.querySelectorAll('img')].find(img=>img.src.includes('/api/navidrome/cover/'));
  assert.ok(art);assert.equal(new URL(art.src).searchParams.get('accountScope'),scope);
  assert.equal(requests.some(r=>r.url.pathname.startsWith('/api/settings')),false);
  const settings=[...node.querySelectorAll('button')].find(b=>b.textContent.trim()==='Settings'||b.getAttribute('aria-label')==='Settings');
  assert.ok(settings,'Settings navigation exists');settings.click();
  await wait(()=>node.querySelector('[aria-label="Settings sections"]'));
  assert.equal([...node.querySelectorAll('[aria-label="Settings sections"] button')].some(b=>b.textContent==='Services'),true,'Owner can open Services');
  assert.equal(requests.some(r=>r.url.pathname==='/api/auth/v1/admin/accounts'),false,'Roster loads only when Services is opened');
  const toggle=()=>[...node.querySelectorAll('label')].find(l=>l.textContent.includes('Open full player on play')).querySelector('input');
  const save=()=>[...node.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save');
  flushSync(()=>toggle().click());flushSync(()=>save().click());
  await wait(()=>savedPreferences.playback.startFullScreen===false && !save() && node.textContent.includes('No unsaved changes.'));
  preferenceRevision++; // A different window saved after this page loaded.
  flushSync(()=>toggle().click());flushSync(()=>save().click());
  await wait(()=>node.textContent.includes('Preferences changed in another window'));
  assert.equal(toggle().checked,true,'conflict retains draft');assert.equal(savedPreferences.playback.startFullScreen,false);
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Refresh saved values').click());
  await wait(()=>node.textContent.includes('Saved values refreshed'));
  flushSync(()=>save().click());await wait(()=>savedPreferences.playback.startFullScreen===true && preferenceRevision===3);
  await wait(()=>![...node.querySelectorAll('[aria-label="Settings sections"] button')].find(b=>b.textContent.trim()==='Library').disabled);
  flushSync(()=>[...node.querySelectorAll('[aria-label="Settings sections"] button')].find(b=>b.textContent.trim()==='Library').click());
  await wait(()=>[...node.querySelectorAll('label')].some(l=>l.textContent.includes('Default View')));
  flushSync(()=>{
   const select=[...node.querySelectorAll('label')].find(l=>l.textContent.includes('Default View')).querySelector('select');
   select.value='list';select.dispatchEvent(new window.Event('change',{bubbles:true}));
  });
  flushSync(()=>save().click());
  await wait(()=>savedPreferences.library.defaultView==='list' && !save() && node.textContent.includes('No unsaved changes.'));
  assert.equal(preferenceRevision,4);
  preferencesUnavailable=true;
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Refresh saved values').click());
  await wait(()=>node.textContent.includes('Preferences could not be saved or loaded'));
  assert.equal(node.textContent.includes('Preferences saved.'),false,'failed refresh cannot retain a stale success message');
  preferencesUnavailable=false;
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Refresh saved values').click());
  await wait(()=>node.textContent.includes('Saved values refreshed'));
  await wait(()=>![...node.querySelectorAll('button')].find(b=>b.textContent.trim()==='Account').disabled);
  [...node.querySelectorAll('button')].find(b=>b.textContent.trim()==='Account').click();
  await wait(()=>node.textContent.includes('Signed in as QA Listener'));
  [...node.querySelectorAll('button')].find(b=>b.textContent==='Sign out').click();
  await wait(()=>node.textContent.includes('Welcome back'));
  assert.equal(node.querySelectorAll('audio').length,0);
  assert.equal(requests.filter(r=>r.url.pathname==='/api/auth/v1/logout').length,1);
  // A new account/player mount must fetch persisted preferences and apply them
  // to the real Library workspace, not just remember the Settings form draft.
  const preferenceReadsBefore=requests.filter(r=>r.url.pathname==='/api/auth/v1/preferences' && r.init.method==='GET').length;
  fill('[autocomplete="username"]','owner');fill('[type="password"]','  Exact QA password  ');
  flushSync(()=>node.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  await wait(()=>node.querySelector('[aria-label="Settings sections"]'));
  assert.ok(requests.filter(r=>r.url.pathname==='/api/auth/v1/preferences' && r.init.method==='GET').length>preferenceReadsBefore);
  const library=[...node.querySelectorAll('button')].find(b=>b.textContent.trim()==='Library'||b.getAttribute('aria-label')==='Library');
  assert.ok(library);flushSync(()=>library.click());
  await wait(()=>[...node.querySelectorAll('button')].some(b=>b.textContent.trim()==='Albums'));
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent.trim()==='Albums').click());
  await wait(()=>node.querySelector('[aria-label="Album view"]'));
  const selectedView=node.querySelector('[aria-label="Album view"] [aria-pressed="true"]');
  assert.equal(selectedView.textContent.trim(),'List','saved account Library preference applies after sign-in');
  assert.equal(node.querySelectorAll('audio').length,2,'remount owns exactly two audio decks');
 } finally {await vite.close();await window.happyDOM.abort();}
});
