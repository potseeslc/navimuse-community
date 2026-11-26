import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('Downloads surface routes completed songs through shared queue callbacks and exposes working management controls',async()=>{
 const w=new Window({url:'https://navimuse.example.com/'});for(const key of ['window','document','Node','Element','HTMLElement'])globalThis[key]=key==='window'?w:w[key];Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});let root;
 try{
  const {DownloadsSurface}=await vite.ssrLoadModule('/src/DownloadsSurface.jsx');
  const calls=[],state={available:true,loading:false,busy:false,budgetBytes:2*1024**3,usedBytes:1234,allowsCellular:false,expiresAt:Date.now()+86400000,tracks:[{song:{id:'ready',title:'Ready song',artist:'Artist',downloadCollections:[{id:'queue:test',name:'Morning drive',position:0}]},state:'complete',bytes:1234},{song:{id:'retry',title:'Retry song'},state:'failed',message:'Interrupted'},{song:{id:'pending',title:'Pending song'},state:'queued'}]};
  const controller=Object.fromEntries(['download','cancel','remove','clearAll','preferences','authorize'].map(key=>[key,async(...args)=>{calls.push({key,args});return true;}]));
  const container=document.createElement('div');document.body.append(container);root=createRoot(container);
  const render=props=>flushSync(()=>root.render(React.createElement(DownloadsSurface,{state,controller,queueSongs:[{id:'queued'}],onBack:()=>{},onPlay:(...args)=>calls.push({key:'play',args}),...props})));
  const button=text=>[...container.querySelectorAll('button')].find(e=>e.textContent.trim()===text),click=node=>{assert.ok(node);flushSync(()=>node.click());};
  render();click(button('Play downloads'));assert.equal(calls.at(-1).key,'play');assert.deepEqual(calls.at(-1).args.map(x=>Array.isArray(x)?x.map(y=>y.id):x.id),['ready',['ready']]);
  assert.equal(button('Download current queue'),undefined,'Queue downloads are managed in the queue, not this Library view');
  assert.equal(button('Remove all downloads on this device'),undefined);
  click(container.querySelector('[aria-label="Open Morning drive"]'));
  assert.match(container.textContent,/SAVED QUEUE/);assert.equal(container.querySelector('.download-collection-hero h2').textContent,'Morning drive');
  click(button('Play playlist'));assert.equal(calls.at(-1).args[0].id,'ready');
  click(button('All downloads'));
  click(button('Songs'));
  click(container.querySelector('[aria-label="Retry download of Retry song"]'));assert.equal(calls.at(-1).key,'download');assert.equal(calls.at(-1).args[0][0].id,'retry');
  click(container.querySelector('[aria-label="Cancel download of Pending song"]'));assert.deepEqual(calls.at(-1),{key:'cancel',args:['pending']});
  click(container.querySelector('[aria-label="Remove download of Ready song"]'));assert.deepEqual(calls.at(-1),{key:'remove',args:['ready']});
  const {DownloadSettings}=await vite.ssrLoadModule('/src/DownloadSettings.jsx');
  flushSync(()=>root.render(React.createElement(DownloadSettings,{state,controller})));
  click(container.querySelector('input[type="checkbox"]'));assert.equal(calls.at(-1).key,'preferences');assert.equal(calls.at(-1).args[0].allowsCellular,true);
  click(button('Remove all downloads on this device'));assert.match(container.textContent,/every account/);click(button('Keep downloads'));assert.equal(calls.some(x=>x.key==='clearAll'),false);
  click(button('Remove all downloads on this device'));click(button('Remove all downloads'));assert.equal(calls.at(-1).key,'clearAll');
  render({offline:true,playbackBlockedReason:'Release the home speaker first'});assert.equal(button('Play downloads').disabled,true);assert.equal(button('Download current queue'),undefined);assert.equal(container.querySelector('[aria-label="Retry download of Retry song"]'),null);assert.match(container.textContent,/Release the home speaker/);
  const {PlayerSheet}=await vite.ssrLoadModule('/src/playerChrome.jsx');let downloadTrack=0;
  flushSync(()=>root.render(React.createElement(PlayerSheet,{open:true,nowPlaying:{id:'ready',title:'Ready song',artist:'Artist'},onClose:()=>{},queueEntryRef:{current:null},onDownloadTrack:()=>downloadTrack++})));
  click(container.querySelector('[aria-label="More track actions"]'));
  click([...document.querySelectorAll('[role="menuitem"]')].find(node=>node.textContent==='Download track'));assert.equal(downloadTrack,1);assert.equal(document.querySelector('[role="menu"]'),null);
 }finally{root?.unmount();await vite.close();w.happyDOM.abort();}
});
