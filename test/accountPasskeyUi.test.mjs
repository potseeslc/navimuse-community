import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('passkey access and Settings preserve keyboard flow, recoverable errors, and named credential actions',async()=>{
 const window=new Window({url:'http://localhost/'});for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?window:window[key];
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {AccountAccessGate}=await vite.ssrLoadModule('/src/AccountAccessGate.jsx'),{AccountPasskeys}=await vite.ssrLoadModule('/src/AccountPasskeys.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('UI did not reach expected state');};
 const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text);
 const click=element=>flushSync(()=>element.click());
 const input=(element,text)=>flushSync(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,text);element.dispatchEvent(new window.Event('input',{bubbles:true}));});
 const submit=form=>flushSync(()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 let session={state:'signed-out',methods:{password:true,passkey:true},account:null,queueScope:null},fields,attempt=0;
 const client={readPasskeyPolicy:async()=>({usernameFirst:true}),passkeyAvailable:()=>true,readSession:async()=>session,renew:async()=>{throw Object.assign(new Error(),{code:'SESSION_RECHECK_REQUIRED'});},cancelPasskey:()=>{},loginPasskey:async value=>{fields=value;value.onStage('authenticator');if(++attempt===1)throw Object.assign(new Error(),{code:'PASSKEY_NOT_COMPLETED'});session={...session,state:'authenticated',account:{id:'owner',displayName:'Owner'},queueScope:'queue-scope-v2:'+'a'.repeat(64)};return session;}};
 try{
  flushSync(()=>root.render(React.createElement(AccountAccessGate,{client},()=>React.createElement('p',null,'Listening ready'))));
  await wait(()=>button('Sign in with a passkey'));
  const passkey=button('Sign in with a passkey');assert.equal(passkey.type,'button');
  input(node.querySelector('[autocomplete="username"]'),'owner');input(node.querySelector('[type="password"]'),'keep typed password');
  click(passkey);await wait(()=>node.querySelector('[role="alert"]'));
  assert.match(node.querySelector('[role="alert"]').textContent,/cancelled or timed out/);assert.equal(node.querySelector('[type="password"]').value,'keep typed password');assert.equal(document.activeElement,passkey);
  await wait(()=>button('Use a security key with your username'));click(button('Use a security key with your username'));
  assert.equal(node.querySelector('[type="password"]'),null);assert.equal(document.activeElement,node.querySelector('[autocomplete="username"]'));
  submit(node.querySelector('form'));await wait(()=>node.textContent.includes('Listening ready'));assert.equal(fields.remember,true);assert.equal(fields.username,'owner');
  let items=[],saved;
  const settingsClient={passkeyAvailable:()=>true,cancelPasskey:()=>{},listPasskeys:async()=>items,registerPasskey:async value=>{saved=value;items=[{id:'key',label:value.label,revision:1,deviceType:'multiDevice',lastUsedAt:null}];},changePasskey:async value=>{saved=value;if(value.remove)items=[];else items=[{...items[0],label:value.label,revision:2}];}};
  flushSync(()=>root.render(React.createElement(AccountPasskeys,{accountId:'owner',client:settingsClient})));
  await wait(()=>node.textContent.includes('No passkeys yet'));
  input(node.querySelector('.account-passkey-add input'),'MacBook');submit(node.querySelector('.account-passkey-add'));await wait(()=>node.querySelector('strong')?.textContent==='MacBook');assert.equal(saved.accountId,'owner');
  click(button('Rename'));await wait(()=>node.querySelector('.account-passkey-edit input'));assert.equal(document.activeElement,node.querySelector('.account-passkey-edit input'));
  input(node.querySelector('.account-passkey-edit input'),'Security key');submit(node.querySelector('.account-passkey-edit'));await wait(()=>node.querySelector('strong')?.textContent==='Security key');assert.equal(saved.expectedRevision,1);
  click(button('Remove'));await wait(()=>button('Remove passkey'));assert.equal(document.activeElement,button('Remove passkey'));click(button('Keep passkey'));assert.equal(node.querySelector('strong').textContent,'Security key');
  click(button('Remove'));click(button('Remove passkey'));await wait(()=>node.textContent.includes('No passkeys yet'));assert.deepEqual(saved,{id:'key',expectedRevision:2,remove:true});
 }finally{flushSync(()=>root.unmount());await vite.close();window.happyDOM.abort();}
});
