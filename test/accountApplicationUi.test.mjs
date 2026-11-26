import {defaultAccountPreferences} from '../shared/accountPreferences.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('application config fails closed and real account gate delays player until verified binding', async () => {
 const window=new Window({url:'http://localhost/'});
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 Object.assign(globalThis,{window,document:window.document});
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {AccountApplication,accountApplicationMode}=await vite.ssrLoadModule('/src/AccountApplication.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 let config={app:'NaviMuse',accountMode:'unknown',services:{}}, mounted=0, props;
 const base={state:'authenticated',account:{id:'fixture',displayName:'Listener'},methods:{password:true},queueScope:null};
 let session=base,preferenceMode='unavailable';
 const client={readSession:async()=>session};
 globalThis.fetch=async url=>{
  if(!String(url).endsWith('/preferences'))return Response.json(config);
  if(preferenceMode==='unavailable')return Response.json({code:'ACCOUNT_UNAVAILABLE'},{status:503});
  return Response.json({version:'navimuse-preferences/v1',accountId:preferenceMode==='mismatch'?'another-account':session.account.id,revision:0,preferences:defaultAccountPreferences()});
 };
 const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Application did not reach expected state');};
 const renderPlayer=p=>{mounted++;props=p;return React.createElement('div',{id:'player'},'Real player boundary');};
 try {
  assert.throws(()=>accountApplicationMode({app:'NaviMuse',accountMode:'local'}));
  assert.equal(accountApplicationMode({app:'NaviMuse',services:{}}),'legacy');
  flushSync(()=>root.render(React.createElement(AccountApplication,{renderPlayer,accountClient:client})));
  await wait(()=>node.textContent.includes('could not connect'));assert.equal(mounted,0);
  config={app:'NaviMuse',accountMode:'local',accountApi:'navimuse-account/v1',services:{}};
  flushSync(()=>node.querySelector('button').click());
  await wait(()=>node.textContent.includes('Your library is not connected'));assert.equal(mounted,0);
  session={...base,queueScope:'queue-scope-v2:'+'a'.repeat(64)};
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Check again').click());
  await wait(()=>node.textContent.includes('Preferences could not be loaded'));assert.equal(mounted,0);
  preferenceMode='mismatch';flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Try again').click());
  await wait(()=>node.textContent.includes('Preferences could not be loaded'));assert.equal(mounted,0);
  preferenceMode='valid';flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Try again').click());
  await wait(()=>node.querySelector('#player'));
  props.accountStorage.setItem('navimuse.queue.v1','account-only');
  assert.equal(window.localStorage.getItem('navimuse.queue.v1'),null);
  assert.equal(props.accountStorage.getItem('navimuse.queue.v1'),'account-only');
  assert.equal(typeof props.onAccountRefresh,'function');assert.equal(props.accountSession.queueScope,session.queueScope);
  let reloads=0;window.location.reload=()=>reloads++;
  session={...base,queueScope:'queue-scope-v2:'+'b'.repeat(64)};
  await props.onAccountRefresh();
  await wait(()=>reloads===1);
  assert.equal(node.querySelector('#player'),null,'new identity must not mount in the old document');
  assert.ok(node.querySelector('[role="status"][aria-label="Opening your library"]'));
  assert.equal(props.accountSession.queueScope,'queue-scope-v2:'+'a'.repeat(64));
 } finally {flushSync(()=>root.unmount());await vite.close();window.happyDOM.abort();globalThis.fetch=saved.fetch;}
});
