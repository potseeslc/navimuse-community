import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';import {createServer} from 'vite';
test('Settings exports through native share bridge and clears with accessible feedback',async()=>{
 const win=new Window({url:'https://navimuse.example.com'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?win:win[key];
 const calls=[];win.__nmAudioTransport={version:1,playbackLog:true,request:async v=>{calls.push(v);return true;}};
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {MediaSessionDiagnostics}=await vite.ssrLoadModule('/src/MediaSessionDiagnostics.jsx');const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  flushSync(()=>root.render(React.createElement(MediaSessionDiagnostics)));
  const button=name=>[...node.querySelectorAll('button')].find(x=>x.textContent===name);
  button('Export playback log').click();await new Promise(r=>setTimeout(r,20));assert.deepEqual(calls[0],{action:'diagnostics.export'});assert.match(node.querySelector('[role="status"]').textContent,/save or share/);
  button('Clear playback log').click();await new Promise(r=>setTimeout(r,20));assert.deepEqual(calls[1],{action:'diagnostics.clear'});assert.match(node.querySelector('[role="status"]').textContent,/cleared/);
  win.__nmAudioTransport.request=async()=>{throw Error('SECRET URL');};button('Export playback log').click();await new Promise(r=>setTimeout(r,20));assert.match(node.textContent,/Please try again/);assert.doesNotMatch(node.textContent,/SECRET/);
 }finally{flushSync(()=>root.unmount());await vite.close();win.happyDOM.abort();}
});
