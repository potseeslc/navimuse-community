import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('owner connection editor confirms changes, requires reread after uncertain writes, and handles self reauthentication',async()=>{
 const w=new Window({url:'http://localhost/'});for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?w:w[key];
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {OwnerConnectionEditor}=await vite.ssrLoadModule('/src/OwnerConnectionEditor.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const originalFetch=globalThis.fetch;
 const account={id:'00000000-0000-4000-8000-000000000001',displayName:'Listener',username:'listener'};
 let rev=2,mode='uncertain',reads=0,writes=0,saved=null,reauth=0,denials=0;
 const client={catalog:async()=>[{reference:'new',label:'New library'}],read:async()=>{reads++;return {revision:rev,credentialRef:'old'};},save:async(id,change)=>{writes++;assert.equal(change.expectedRevision,rev);assert.equal(change.credentialRef,'new');if(mode==='uncertain')throw new Error('private upstream detail');if(mode==='stale')throw Object.assign(new Error(),{status:409});if(mode==='recent')throw Object.assign(new Error(),{status:403,code:'RECENT_AUTH_REQUIRED'});if(mode==='denied')throw Object.assign(new Error(),{status:403});return {revision:rev+1,reauthenticate:mode==='self'};}};
 const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text);
 const wait=async p=>{for(let i=0;i<100;i++){if(p())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Expected editor state');};
 const render=key=>flushSync(()=>root.render(React.createElement(OwnerConnectionEditor,{key,account,self:true,client,onClose:()=>{},onSaved:r=>saved=r,onDenied:()=>denials++,onReauthenticate:()=>reauth++})));
 const choose=()=>{const select=node.querySelector('select');select.value='new';select.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const confirm=async()=>{button('Review change').click();await wait(()=>button('Save music access'));assert.equal(document.activeElement,button('Save music access'));button('Save music access').click();};
 try{
  render('one');await wait(()=>node.querySelector('select'));assert.match(node.textContent,/Unavailable connection \(old\)/);assert.match(node.textContent,/all devices/);choose();await wait(()=>!button('Review change').disabled);await confirm();
  await wait(()=>button('Refresh current access'));assert.equal(writes,1);assert.equal(button('Save music access'),undefined);assert(!node.textContent.includes('private upstream'));assert.equal(node.querySelector('select').value,'new');
  rev=3;mode='stale';button('Refresh current access').click();await wait(()=>button('Review change'));assert.equal(reads,2);await confirm();await wait(()=>button('Refresh current access'));assert.match(node.textContent,/changed elsewhere/);
  rev=4;mode='ok';button('Refresh current access').click();await wait(()=>button('Review change'));await confirm();await wait(()=>saved&&button('Review change'));assert.equal(saved.bindingRevision,5);assert.equal(saved.musicConfigured,true);assert.equal(button('Review change').disabled,true);
  render('two');await wait(()=>node.querySelector('select'));choose();await wait(()=>!button('Review change').disabled);mode='recent';await confirm();await wait(()=>button('Sign out to sign in again'));assert.equal(denials,0);assert.equal(reauth,0);button('Sign out to sign in again').click();assert.equal(reauth,1);
  render('three');await wait(()=>node.querySelector('select'));choose();await wait(()=>!button('Review change').disabled);mode='self';await confirm();await wait(()=>reauth===2);assert.equal(button('Review change'),undefined);
  render('four');await wait(()=>node.querySelector('select'));choose();await wait(()=>!button('Review change').disabled);mode='denied';await confirm();await wait(()=>denials===1);
  const {OwnerAccounts}=await vite.ssrLoadModule('/src/OwnerAccounts.jsx');
  let deny=false;
  globalThis.fetch=async (input,init)=>init?.method==='PUT'?Response.json({code:'RECENT_AUTH_REQUIRED'},{status:403}):deny?Response.json({code:'OWNER_REQUIRED'},{status:403}):Response.json(String(input).includes('music-connections')?{connections:[{reference:'new',label:'New library'}]}:{revision:2,credentialRef:null});
  const load=async()=>({accounts:[{...account,roles:['listener'],disabled:false,musicConfigured:false}],nextAfter:null});
  flushSync(()=>root.render(React.createElement(OwnerAccounts,{accountId:'owner',load,onReauthenticate:()=>reauth++})));
  await wait(()=>button('Manage music access'));const opener=button('Manage music access');opener.click();await wait(()=>node.querySelector('select'));
  choose();await wait(()=>!button('Review change').disabled);await confirm();await wait(()=>button('Sign out to sign in again'));const beforeReauth=reauth;button('Sign out to sign in again').click();assert.equal(reauth,beforeReauth+1);
  button('Back to accounts').click();await wait(()=>button('Manage music access'));await wait(()=>document.activeElement===button('Manage music access'));
  deny=true;button('Manage music access').click();await wait(()=>node.textContent.includes('Owner access is no longer available'));assert.equal(node.querySelector('li'),null);assert.equal(node.querySelector('select'),null);
 }finally{globalThis.fetch=originalFetch;flushSync(()=>root.unmount());await vite.close();await w.happyDOM.close();}
});
