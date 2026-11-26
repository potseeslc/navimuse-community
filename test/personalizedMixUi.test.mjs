import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('Home and Sonic share refreshed tracks, retain playable mix after failure, and discard late account results',async()=>{
 const w=new Window({url:'http://localhost/'});for(const key of ['window','document','Node','Element','HTMLElement'])globalThis[key]=key==='window'?w:w[key];
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const {PersonalizedMix}=await vite.ssrLoadModule('/src/PersonalizedMix.jsx'),{usePersonalizedMix}=await vite.ssrLoadModule('/src/usePersonalizedMix.js');
 const calls=[],played=[];let model;
 const fetcher=(url,init)=>new Promise(resolve=>calls.push({url,init,resolve}));
 function Fixture({scope}){model=usePersonalizedMix({apiFetch:fetcher,scope,enabled:true});return React.createElement('div',null,React.createElement(PersonalizedMix,{model,compact:true,onPlaySong:(...args)=>played.push(args)}),React.createElement(PersonalizedMix,{model,onPlaySong:(...args)=>played.push(args)}));}
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=()=>new Promise(r=>setTimeout(r,25));const reply=(i,value,status=200)=>calls[i].resolve(Response.json(value,{status}));
 try{
  flushSync(()=>root.render(React.createElement(Fixture,{scope:'a'})));await wait();assert.equal(calls.length,1);
  reply(0,{mix:{generatedAt:123,tracks:[{id:'old',title:'Old'}]}});await wait();
  assert.equal([...node.querySelectorAll('button')].filter(b=>b.textContent==='Play Mix').length,2);
  flushSync(()=>model.refresh());flushSync(()=>model.refresh());await wait();assert.equal(calls.length,2);assert.equal(calls[1].init.headers['x-requested-with'],'NaviMuse');
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Play Mix').click());assert.equal(played[0][0].id,'old');
  reply(1,{error:'temporarily unavailable'},503);await wait();assert.equal(model.mix.tracks[0].id,'old');
  flushSync(()=>model.refresh());await wait();reply(2,{mix:{generatedAt:456,tracks:[{id:'new',title:'New'}]}});await wait();
  for(const button of [...node.querySelectorAll('button')].filter(b=>b.textContent==='Play Mix'))flushSync(()=>button.click());
  assert.deepEqual(played.slice(-2).map(args=>args[0].id),['new','new']);
  flushSync(()=>model.refresh());await wait();flushSync(()=>root.render(React.createElement(Fixture,{scope:'b'})));await wait();assert.ok(calls[3].init.signal.aborted);
  reply(3,{mix:{tracks:[{id:'wrong-account'}]}});reply(4,{mix:null});await wait();assert.equal(model.mix,null);assert.equal(model.busy,false);
 }finally{flushSync(()=>root.unmount());await vite.close();w.close();}
});
