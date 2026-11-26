import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('station browser plays the selected station and saves a direct stream',async()=>{
 const w=new Window({url:'http://localhost/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?w:w[key];
 Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 const requests=[];let played=null;
 globalThis.fetch=async(input,init={})=>{requests.push({url:String(input),...init});return Response.json(init.method==='POST'?{ok:true}:{radios:[{id:'one',name:'First station',artworkPath:'/api/navidrome/radios/one/artwork?v=cached',streamUrl:'https://radio.example/one'},{id:'two',name:'Second station',coverArt:'ra-two',streamUrl:'https://radio.example/two'}]});};
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const {InternetRadio}=await vite.ssrLoadModule('/src/InternetRadio.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=()=>new Promise(r=>setTimeout(r,40));
 try{
  flushSync(()=>root.render(React.createElement(InternetRadio,{onPlaySong:song=>{played=song;}})));
  assert.equal(requests.length,1);
  await wait();
  assert.equal(node.querySelectorAll('.radio-home-card').length,2);
  assert.equal(requests.length,1,'Home does not probe each station for metadata');
  assert.equal(node.querySelectorAll('.radio-home-card img').length,2);assert.match(node.querySelectorAll('.radio-home-card img')[1].getAttribute('src'),/ra-two/);
  assert.equal(node.querySelector('.radio-home-card img').getAttribute('src'),'/api/navidrome/radios/one/artwork?v=cached');
  flushSync(()=>root.render(React.createElement(InternetRadio,{radioMetadata:{id:'radio:two',artwork:'/api/navidrome/radios/two/artwork?v=live'},onPlaySong:song=>{played=song;}})));
  assert.equal(node.querySelectorAll('.radio-home-card img').length,2,'New playback artwork appears without reopening Home');
  assert.equal(node.querySelectorAll('.radio-home-card img')[1].getAttribute('src'),'/api/navidrome/radios/two/artwork?v=live');
  assert.equal(node.querySelector('.radio-home-card img').getAttribute('src'),'/api/navidrome/radios/one/artwork?v=cached','Another station never borrows the active station cover');
  assert.equal(requests.length,1,'Playback metadata is reused without an extra Home request');
  flushSync(()=>root.render(React.createElement(InternetRadio,{radioMetadata:{id:'radio:absent',artwork:'/api/navidrome/radios/absent/artwork?v=other'},onPlaySong:song=>{played=song;}})));
  assert.equal(node.querySelectorAll('.radio-home-card img').length,2,'Unmatched metadata preserves each station fallback');
  assert.match(node.querySelectorAll('.radio-home-card img')[1].getAttribute('src'),/ra-two/);
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Browse stations').click());await wait();
  assert.equal(played,null);
  flushSync(()=>[...document.querySelectorAll('.radio-stations button')].find(b=>b.textContent.includes('Second station')).click());
  assert.equal(played.title,'Second station');assert.equal(played.coverArt,'ra-two');
  await wait();
  assert.equal(document.querySelector('[role=dialog]'),null,'selection dismisses sheet after start succeeds');
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Browse stations').click());await wait();
  flushSync(()=>[...document.querySelectorAll('.radio-sheet-tools button')][0].click());
  const values=['New station','https://radio.example/new','https://radio.example'];
  for(const [index,input] of [...document.querySelectorAll('form input')].entries()){
   const setter=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set;
   setter.call(input,values[index]);flushSync(()=>input.dispatchEvent(new w.Event('input',{bubbles:true})));
  }
  flushSync(()=>document.querySelector('.radio-sheet form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})));await wait();
  const saved=requests.find(r=>r.method==='POST');assert.ok(saved);
  assert.deepEqual(JSON.parse(saved.body),{name:values[0],streamUrl:values[1],homePageUrl:values[2]});
  assert.equal(document.querySelector('.radio-sheet form'),null,'successful save closes the add form');
  flushSync(()=>document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('[role=dialog]'),null);
  assert.equal(document.activeElement.textContent,'Browse stations');
  let finishStart;
  flushSync(()=>root.render(React.createElement(InternetRadio,{remoteOutputName:'Bedroom',onPlaySong:()=>new Promise((resolve,reject)=>{finishStart={resolve,reject};})})));
  flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Browse stations').click());await wait();
  assert.match(document.querySelector('[role=dialog]').textContent,/keeps playback on Bedroom/);
  flushSync(()=>document.querySelector('.radio-stations button').click());await wait();
  assert.ok(document.querySelector('[role=dialog]'),'sheet stays visible during handoff');
  assert.equal(document.querySelector('.radio-stations button').disabled,true);
  finishStart.reject(Error('Speaker stop could not be confirmed'));await wait();
  assert.match(document.querySelector('[role=alert]').textContent,/Speaker stop could not be confirmed/);
  assert.equal(document.querySelector('.radio-stations button').disabled,false);
  flushSync(()=>document.querySelector('.radio-stations button').click());await wait();
  finishStart.resolve();await wait();
  assert.equal(document.querySelector('[role=dialog]'),null,'successful retry closes sheet');

 }finally{flushSync(()=>root.unmount());await vite.close();w.happyDOM.abort();}
});
