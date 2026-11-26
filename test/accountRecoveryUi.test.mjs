import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('recovery UI confirms passwords, serializes requests, clears secrets, and hides expired owner codes',async()=>{
 const w=new Window({url:'http://localhost/'});for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?w:w[key];
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {AccountRecovery,OwnerRecovery}=await vite.ssrLoadModule('/src/AccountRecovery.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected recovery UI state');};
 const button=text=>[...node.querySelectorAll('button')].find(e=>e.textContent===text);
 const input=(index,value)=>flushSync(()=>{const e=node.querySelectorAll('input')[index];Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new w.Event('input',{bubbles:true}));});
 const submit=()=>flushSync(()=>node.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})));
 let resolve,writes=0,fields,back=0,reauth=0,issued=0;
 const client={redeem:async value=>{writes++;fields=value;await new Promise(r=>resolve=r);return {ok:true};},issue:async()=>{issued++;return {code:'r1.'+'A'.repeat(43),expiresAt:Date.now()+40};}};
 try{
  flushSync(()=>root.render(React.createElement(AccountRecovery,{client,onBack:()=>back++})));
  input(0,'r1.'+'A'.repeat(43));input(1,'  New fixture password  ');input(2,'Mismatch password');submit();assert.equal(writes,0);assert.match(node.textContent,/do not match/);
  input(2,'  New fixture password  ');submit();submit();assert.equal(writes,1);assert.equal(button('Back to sign in').disabled,true);assert.equal(fields.password,'  New fixture password  ');
  resolve();await wait(()=>button('Return to sign in'));assert.equal(node.querySelector('input'),null);assert.equal(document.activeElement,node.querySelector('h1'));button('Return to sign in').click();assert.equal(back,1);
  flushSync(()=>root.render(React.createElement(OwnerRecovery,{client,account:{id:'fixture',displayName:'Synthetic Listener'},onClose:()=>back++,onDenied:()=>assert.fail('Unexpected denial'),onReauthenticate:()=>reauth++})));
  assert.equal(issued,0);button('Create recovery code').click();await wait(()=>node.querySelector('input'));assert.equal(issued,1);assert.equal(node.querySelector('input').readOnly,true);
  await wait(()=>!node.querySelector('input'));assert.match(node.textContent,/expired/);assert.equal(issued,1,'Expiry must not create another code');
  client.issue=async()=>{throw Object.assign(new Error('private detail'),{code:'RECENT_AUTH_REQUIRED',status:403});};button('Create recovery code').click();await wait(()=>button('Sign out to sign in again'));assert(!node.textContent.includes('private detail'));button('Sign out to sign in again').click();assert.equal(reauth,1);
  const {OwnerAccounts}=await vite.ssrLoadModule('/src/OwnerAccounts.jsx');
  flushSync(()=>root.render(React.createElement(OwnerAccounts,{accountId:'owner',onReauthenticate:()=>{},load:async()=>({accounts:[{id:'fixture',username:'listener',displayName:'Synthetic Listener',roles:['listener'],disabled:false,musicConfigured:false}],nextAfter:null})})));
  await wait(()=>button('Password recovery'));button('Password recovery').click();await wait(()=>button('Create recovery code'));button('Back to accounts').click();await wait(()=>document.activeElement===button('Password recovery'));
  const {AccountAccessSurface}=await vite.ssrLoadModule('/src/AccountAccessGate.jsx');
  flushSync(()=>root.render(React.createElement(AccountAccessSurface,{session:{state:'signed-out',methods:{password:true}},busy:false,onLogin:()=>{},onRetry:()=>{}})));
  button('Use a recovery code').click();await wait(()=>button('Back to sign in'));button('Back to sign in').click();await wait(()=>node.querySelector('h1')?.textContent==='Welcome back');assert.equal(document.activeElement,node.querySelector('h1'));
 }finally{flushSync(()=>root.unmount());await vite.close();await w.happyDOM.close();}
});
