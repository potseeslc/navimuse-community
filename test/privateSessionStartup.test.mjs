import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
import {settingsSession} from '../src/services/settingsService.js';
test('a stalled legacy session request is bounded even if fetch ignores abort',async()=>{
 const previous=globalThis.fetch;let signal;
 try{globalThis.fetch=(_url,options)=>{signal=options.signal;return new Promise(()=>{});};
  await assert.rejects(settingsSession({timeoutMs:10}),/Could not load NaviMuse session/);assert.equal(signal.aborted,true);
 }finally{globalThis.fetch=previous;}
});
test('fresh signed-out startup waits for session before library and recovers a superseding auth event',async()=>{
 const window=new Window({url:'https://music.example.test/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent','localStorage','requestAnimationFrame','cancelAnimationFrame'])globalThis[key]=key==='window'?window:window[key];
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 globalThis.ResizeObserver=window.ResizeObserver;
 const previousFetch=globalThis.fetch;const sessions=[],requests=[];
 globalThis.fetch=async(url)=>{
  const path=String(url);requests.push(path);
  if(path.includes('/settings/session'))return new Promise(resolve=>sessions.push(resolve));
  if(path.includes('/api/settings'))return Response.json({});
  if(path.includes('/api/health'))return Response.json({services:{}});
  return Response.json({error:'Sign in required'},{status:401});
 };
 const vite=await createServer({configFile:false,plugins:[{name:'export-app-for-mounted-test',enforce:'pre',transform(code,id){if(id.endsWith('/src/main.jsx'))return code.slice(0,code.lastIndexOf('\nif (nativeFirstPartyRedirect)'))+'\nexport {App};';}}],server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {App}=await vite.ssrLoadModule('/src/main.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=async check=>{for(let n=0;n<100;n++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('UI did not settle: '+node.textContent);};
 try{
  flushSync(()=>root.render(React.createElement(App,{})));await wait(()=>sessions.length===1);
  assert.ok(node.querySelector('[role="status"][aria-label="Opening NaviMuse"]'));assert.equal(requests.some(path=>path.includes('/navidrome/')),false);
  window.dispatchEvent(new CustomEvent('navimuse:session-required'));await wait(()=>sessions.length===2);
  const signedOut={adminConfigured:true,authenticated:false,authMode:'oidc',loginUrl:'/api/auth/login',user:null};
  sessions[0](Response.json(signedOut));await new Promise(resolve=>setTimeout(resolve,10));assert.ok(node.querySelector('[role="status"][aria-label="Opening NaviMuse"]'));
  sessions[1](Response.json(signedOut));await wait(()=>node.textContent.includes('Continue with Pocket ID'));
  assert.equal(requests.some(path=>path.includes('/navidrome/')),false);
 }finally{flushSync(()=>root.unmount());await vite.close();window.happyDOM.abort();globalThis.fetch=previousFetch;}
});
