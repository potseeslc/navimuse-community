import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('owner overview retains pages on failure, restores focus, clears denied data and ignores old-account responses',async(t)=>{
 const window=new Window({url:'http://localhost/'});for(const k of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[k]=k==='window'?window:window[k];
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {OwnerAccounts}=await vite.ssrLoadModule('/src/OwnerAccounts.jsx');const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 let mode='initial',release,reauthentications=0;const calls=[];const a={id:'a',username:'alpha',displayName:'Alpha',roles:['owner','listener'],disabled:false,musicConfigured:true};
 const load=async options=>{calls.push(options.after);if(mode==='pending')return new Promise(resolve=>{release=resolve;});if(mode==='denied')throw Object.assign(new Error(),{status:403});if(mode==='fail')throw new Error('offline');return options.after?{accounts:[{...a,id:'b',username:'beta',displayName:'Beta',roles:['listener'],disabled:true,musicConfigured:false}],nextAfter:null}:{accounts:[a],nextAfter:'a'};};
 const wait=async p=>{for(let i=0;i<100;i++){if(p())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Expected owner view state');};
 const button=t=>[...node.querySelectorAll('button')].find(b=>b.textContent===t),click=b=>{assert(b);b.focus();b.click();};
 const render=id=>flushSync(()=>root.render(React.createElement(OwnerAccounts,{key:id,accountId:id,load,onReauthenticate:()=>reauthentications++})));
 try{
  render('a');await wait(()=>button('Load more accounts'));const row=node.querySelector('li');mode='fail';click(button('Load more accounts'));await wait(()=>button('Retry loading accounts'));assert(row.isConnected);assert.match(node.textContent,/current results are still available/);
  mode='initial';click(button('Retry loading accounts'));await wait(()=>node.querySelectorAll('li').length===2);await wait(()=>document.activeElement===node.querySelector('h3'));assert.deepEqual(calls,['','a','a']);assert.match(node.textContent,/Account disabled/);assert.match(node.textContent,/No music connection/);
  mode='denied';click(button('Refresh accounts'));await wait(()=>node.textContent.includes('Owner access is no longer'));assert.equal(node.querySelectorAll('li').length,0);click(button('Sign out to sign in again'));assert.equal(reauthentications,1);assert.equal(button('Retry loading accounts'),undefined);
  mode='pending';click(button('Refresh accounts'));await wait(()=>release);const old=release;mode='initial';render('other');await wait(()=>node.querySelector('li'));old({accounts:[{...a,displayName:'Stale'}],nextAfter:null});await new Promise(r=>setTimeout(r,40));assert(!node.textContent.includes('Stale'));
  click(button('Create account'));await wait(()=>button('Review account'));click(button('Back to accounts'));await wait(()=>button('Create account')&&!button('Create account').disabled);await wait(()=>document.activeElement===button('Create account'));
  const {SettingsSurface}=await vite.ssrLoadModule('/src/sonicSettingsSurfaces.jsx');
  const {defaultSettingsState}=await vite.ssrLoadModule('/src/appSettings.js');
  let requests=0;
  t.mock.method(globalThis,'fetch',async()=>{requests++;return Response.json({ok:true,accounts:[],page:{limit:50,nextAfter:null}});});
  const settings=roles=>flushSync(()=>root.render(React.createElement(SettingsSurface,{accountSession:{account:{id:'viewer',displayName:'Viewer',roles},methods:{passkey:false}},settingsState:defaultSettingsState,settingsSession:{adminConfigured:true,authenticated:true},navidrome:{}})));
  settings(['listener']);assert.equal(button('Services'),undefined);assert.equal(requests,0);
  settings(['owner','listener']);click(button('Services'));await wait(()=>node.textContent.includes('No accounts returned'));
  assert.equal(requests,1);assert.equal(node.querySelector('input[type="password"]'),null,'local owner does not see legacy credential forms');
  settings(['listener']);await wait(()=>!node.querySelector('.owner-accounts'));assert.equal(button('Services'),undefined);

 }finally{flushSync(()=>root.unmount());await vite.close();await window.happyDOM.close();}
});
