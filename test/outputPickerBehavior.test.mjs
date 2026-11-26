import assert from 'node:assert/strict';
import test from 'node:test';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('AirPlay label opens the native picker, reports failures, and respects remote ownership', async()=>{
 const win=new Window();
 Object.assign(globalThis,{window:win,document:win.document,Node:win.Node,Element:win.Element,HTMLElement:win.HTMLElement,ResizeObserver:win.ResizeObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 win.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const calls=[];let reject=false;let localCalls=0;let lastOptions;
 win.__nmAudioTransport={version:1,inlineRoutePicker:true,routePicker:true,request:async body=>{calls.push(body);if(reject&&body.action==='routePicker')throw Error('Unavailable');return {};}};
 const vite=await createServer({root:new URL('..',import.meta.url).pathname,appType:'custom',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true}});
 const {default:React}=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  const {OutputPicker}=await vite.ssrLoadModule('/src/OutputPicker.jsx');
  const render=session=>flushSync(()=>root.render(React.createElement(OutputPicker,{open:true,state:{outputs:[],available:true,session},onClose(){},onLocal(options){assert.equal(options.keepOpen,true);localCalls++;lastOptions=options;return true;},onRefresh(){}})));
  render(null);
  const label=node.querySelector('.native-route-label');assert.ok(label,'AirPlay text is a real button');
  label.click();await new Promise(r=>setTimeout(r,0));assert.equal(calls.filter(c=>c.action==='routePicker').length,1);
  reject=true;label.click();await new Promise(r=>setTimeout(r,0));assert.match(node.querySelector('[role=status]').textContent,/AirPlay could not open/);
  render({id:'remote'});assert.equal(node.querySelector('.native-route-label'),null);
  const button=[...node.querySelectorAll('button')].find(b=>b.textContent.includes('AirPlay'));assert.equal(button.disabled,false,'AirPlay offers an explicit return to this device');
  button.click();assert.equal(localCalls,1);assert.equal(calls.filter(c=>c.action==='routePicker').length,2,'never opens local routes before remote release');
  render({id:'remote',status:'unreachable'});
  const findButton=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text);
  flushSync(()=>findButton('Disconnect unavailable speaker').click());
  assert.match(node.textContent,/speaker may still be playing/);assert.equal(localCalls,1);
  flushSync(()=>findButton('Cancel').click());assert.equal(findButton('Disconnect anyway'),undefined);
  flushSync(()=>findButton('Disconnect unavailable speaker').click());
  findButton('Disconnect anyway').click();assert.deepEqual(lastOptions,{disconnect:true,keepOpen:true});
  assert.equal(localCalls,2);assert.equal(calls.filter(c=>c.action==='routePicker').length,2);
 }finally{flushSync(()=>root.unmount());await vite.close();await win.happyDOM.close();}
});

test('new native shells mount the whole AirPlay row and restore the accessible fallback on failure',async()=>{
 const win=new Window();
 Object.assign(globalThis,{window:win,document:win.document,Node:win.Node,Element:win.Element,HTMLElement:win.HTMLElement,ResizeObserver:win.ResizeObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const calls=[];let mounted=true;
 win.__nmAudioTransport={version:1,inlineRoutePicker:true,inlineRoutePickerRow:true,routePicker:true,request:async body=>{calls.push(body);return {mounted};}};
 const vite=await createServer({root:new URL('..',import.meta.url).pathname,appType:'custom',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true}});
 const {default:React}=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  const {OutputPicker}=await vite.ssrLoadModule('/src/OutputPicker.jsx');
  const render=(open,session=null)=>flushSync(()=>root.render(React.createElement(OutputPicker,{open,state:{outputs:[],available:true,session},onClose(){},onLocal(){},onRefresh(){}})));
  render(true);const row=node.querySelector('.native-route-row');assert.ok(row);
  row.getBoundingClientRect=()=>({x:22,y:400,width:358,height:68});
  win.dispatchEvent(new win.Event('resize'));await new Promise(r=>setTimeout(r,0));
  const frame=calls.findLast(c=>c.action==='routePickerFrame'&&!c.hidden);
  assert.equal(frame.fullRow,true);assert.equal(frame.width,358);assert.equal(frame.height,68);assert.equal(frame.viewportWidth,win.innerWidth);
  assert.equal(row.getAttribute('aria-hidden'),'true','only the native control is announced after mounting');
  assert.equal(row.tabIndex,-1);assert.equal(calls.some(c=>c.action==='routePicker'),false,'mounting never opens the extra sheet');
  mounted=false;win.dispatchEvent(new win.Event('resize'));await new Promise(r=>setTimeout(r,0));
  assert.equal(row.hasAttribute('aria-hidden'),false);assert.equal(row.tabIndex,0);
  row.click();await new Promise(r=>setTimeout(r,0));assert.equal(calls.at(-1).action,'routePicker','a missing native overlay retains a working fallback');
  render(true,{id:'remote'});assert.equal(node.querySelector('.native-route-row'),null);assert.ok(calls.some(c=>c.action==='routePickerFrame'&&c.hidden));
  render(false);
 }finally{flushSync(()=>root.unmount());await vite.close();await win.happyDOM.close();}
});

test('home speakers require device opt-in without hiding an owned session or discovering by default',async()=>{
 const win=new Window({url:'https://navimuse.fixture'});
 Object.assign(globalThis,{window:win,document:win.document,Node:win.Node,Element:win.Element,HTMLElement:win.HTMLElement,ResizeObserver:win.ResizeObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const vite=await createServer({root:new URL('..',import.meta.url).pathname,appType:'custom',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true}});
 const {default:React}=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const node=document.createElement('div');document.body.append(node);let root=createRoot(node),refreshes=0,transfers=0,releases=0;
 const device={id:'home',name:'Living room',available:true};
 try{
  const {OutputPicker}=await vite.ssrLoadModule('/src/OutputPicker.jsx');
  const render=(session=null)=>flushSync(()=>root.render(React.createElement(OutputPicker,{open:true,state:{outputs:[device],available:true,session},onClose(){},onLocal(){releases++;},onChoose(){transfers++;},onRefresh(){refreshes++;}})));
  const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent.includes(text));
  render();assert.equal(button('Living room'),undefined);assert.equal(refreshes,0);assert.ok(button('AirPlay'));
  flushSync(()=>node.querySelector('input[type=checkbox]').click());assert.equal(refreshes,1);assert.ok(button('Living room'));assert.equal(transfers,0,'opting in never starts playback');
  button('Living room').click();assert.equal(transfers,1);
  render();assert.equal(refreshes,1,'an inline callback does not cause repeated discovery');
  flushSync(()=>root.unmount());root=createRoot(node);render();assert.equal(node.querySelector('input').checked,true,'preference survives remount');assert.equal(refreshes,2);
  render({id:'session',device});flushSync(()=>node.querySelector('input').click());
  assert.ok(button('Living room'));assert.equal(button('Living room').disabled,true);assert.equal(releases,0,'hiding home outputs does not stop playback');
  assert.match(node.textContent,/use This device to stop/);button('This device').click();assert.equal(releases,1);
  render();assert.equal(button('Living room'),undefined);assert.equal(refreshes,2);
  flushSync(()=>root.unmount());root=createRoot(node);render();assert.equal(node.querySelector('input').checked,false);assert.equal(refreshes,2);
 }finally{flushSync(()=>root.unmount());await vite.close();await win.happyDOM.close();}
});

test('phone home-speaker volume targets the owned session, respects bounds and disables unavailable controls',async()=>{
 const win=new Window({url:'https://navimuse.fixture'});
 Object.assign(globalThis,{window:win,document:win.document,Node:win.Node,Element:win.Element,HTMLElement:win.HTMLElement,ResizeObserver:win.ResizeObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 win.__nmAudioTransport={version:1,network:true};
 win.localStorage.setItem('navimuse-show-home-speakers-v1','true');
 win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const vite=await createServer({root:new URL('..',import.meta.url).pathname,appType:'custom',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true}});
 const {default:React}=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node),calls=[];
 try{
  const {OutputPicker}=await vite.ssrLoadModule('/src/OutputPicker.jsx');
  const render=(volume,{busy=false,status='playing',local=false}={})=>flushSync(()=>root.render(React.createElement(OutputPicker,{open:true,state:{outputs:[{id:'speaker',name:'Living room',available:true}],available:true,busy,session:local?null:{id:'owned',device:{id:'speaker',name:'Living room'},volume,status}},onClose(){},onLocal(){},onRefresh(){},onSpeakerVolume:(...args)=>calls.push(args)})));
  const slider=()=>node.querySelector('input[type="range"]');
  const move=value=>flushSync(()=>{Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(slider(),String(value));slider().dispatchEvent(new win.Event('input',{bubbles:true}));});
  const release=()=>flushSync(()=>slider().dispatchEvent(new win.Event('pointerup',{bubbles:true})));
  render(42);assert.equal(slider().value,'42');assert.match(node.textContent,/Ready to play/,'live discovery wins over saved session topology');assert.match(node.textContent,/iPhone volume buttons adjust the phone or its AirPlay output/);
  move(53);move(67);assert.equal(node.querySelector('output').textContent,'67%');assert.deepEqual(calls,[],'dragging previews without flooding speaker commands');release();assert.deepEqual(calls,[['owned',67]]);release();assert.equal(calls.length,1);
  render(67);move(0);release();render(0);move(100);flushSync(()=>slider().dispatchEvent(new win.KeyboardEvent('keyup',{key:'End',bubbles:true})));assert.deepEqual(calls.slice(1),[['owned',0],['owned',100]]);
  render(100);move(25);flushSync(()=>slider().dispatchEvent(new win.Event('pointercancel',{bubbles:true})));release();assert.equal(calls.length,3,'cancelled gesture sends nothing');
  for(const options of [{busy:true},...['unreachable','external','error','reconnecting','starting'].map(status=>({status}))]){render(42,options);assert.equal(slider().disabled,true);}
  render(null);assert.equal(slider().disabled,true);assert.match(node.querySelector('output').textContent,/Unavailable/);
  render(42);move(80);render(42,{busy:true});release();assert.equal(calls.length,3,'losing control cancels a draft');
  render(42,{local:true});assert.equal(slider(),null);assert.equal(calls.length,3,'rendering and output changes never change volume');
 }finally{flushSync(()=>root.unmount());await vite.close();await win.happyDOM.close();}
});
