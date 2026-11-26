import {Window} from 'happy-dom';import {createServer} from 'vite';import test from 'node:test';import assert from 'node:assert/strict';
test('automatic nearby outputs follow network changes, reject stale probes and retain remote release access',async()=>{
 const w=new Window({url:'https://navimuse.example.com'});Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement,ResizeObserver:w.ResizeObserver,requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w)});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const pending=[];w.__nmAudioTransport={version:1,network:true,networkType:'wifi',nearbySpeakers:true,request:body=>new Promise(resolve=>pending.push({body,resolve}))};
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');const {OutputPicker}=await vite.ssrLoadModule('/src/OutputPicker.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);const device={id:'one',address:'192.168.1.4',uuid:'uuid:one',name:'Living room',available:true};let refreshes=0;
 const settle=()=>new Promise(r=>setTimeout(r,10));const render=session=>flushSync(()=>root.render(React.createElement(OutputPicker,{open:true,state:{outputs:[device],session,available:true},onClose(){},onLocal(){},onRefresh(){refreshes++;}})));
 const network=type=>flushSync(()=>w.dispatchEvent(new w.CustomEvent('navimuse-native-audio',{detail:{type:'network',networkType:type}})));
 try{
  render(null);await settle();assert.equal(node.querySelector('input[type=checkbox]'),null);assert.ok(refreshes>0);assert.equal(pending.length,1);pending[0].resolve({nearbyIds:['one']});await settle();assert.match(node.textContent,/Living room/);
  network('wifi');await settle();assert.equal(pending.length,2,'same-kind Wi-Fi changes trigger a fresh identity probe');assert.doesNotMatch(node.textContent,/Living room/);
  network('cellular');pending[1].resolve({nearbyIds:['one']});await settle();assert.doesNotMatch(node.textContent,/Living room/);const count=refreshes;await settle();assert.equal(refreshes,count);
  render({id:'session',device,status:'paused',volume:20});await settle();assert.match(node.textContent,/Current session/);assert.ok([...node.querySelectorAll('button')].find(b=>b.textContent.includes('This device')&&!b.disabled));
  network('wifi');await settle();pending.at(-1).resolve({nearbyIds:[]});await settle();assert.match(node.textContent,/Current session/,'away session remains visible without advertising local availability');
 }finally{flushSync(()=>root.unmount());await vite.close();w.close();}
});
test('native route events update the AirPlay indicator without creating remote speaker ownership',async()=>{
 const w=new Window({url:'https://navimuse.example.com'});Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});w.__nmAudioTransport={version:1,routeState:true,routeKind:'Local / wired',request:async()=>true};
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');const {useNativeOutput}=await vite.ssrLoadModule('/src/useNativeOutput.js');
 function Probe(){const value=useNativeOutput();return React.createElement('output',null,value.airplay?'AirPlay':value.kind);}
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{flushSync(()=>root.render(React.createElement(Probe)));flushSync(()=>w.dispatchEvent(new w.CustomEvent('navimuse-native-audio',{detail:{type:'route',kind:'AirPlay'}})));assert.equal(node.textContent,'AirPlay');flushSync(()=>w.dispatchEvent(new w.CustomEvent('navimuse-native-audio',{detail:{type:'route',kind:'Local / wired'}})));assert.equal(node.textContent,'Local / wired');}finally{flushSync(()=>root.unmount());await vite.close();w.close();}
});
