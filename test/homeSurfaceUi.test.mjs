import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('Home shows real history before new albums, opens the chosen album, and distinguishes unavailable history', async()=>{
 const window=new Window({url:'http://localhost/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent']) globalThis[key]=key==='window'?window:window[key];
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const {HomeSurface}=await vite.ssrLoadModule('/src/homeSurface.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 let opened=null,retried=0,selectedLibrary=null;
 const props={navidrome:{musicFolders:[{id:'music',name:'Music Library'},{id:'live',name:'Live Music'}],recentAlbums:[{id:'heard',name:'Heard record',artist:'Artist'}],newestAlbums:[{id:'new',name:'New record',artist:'Artist'}]},settings:{discovery:{}},onLibraryChange:key=>{selectedLibrary=key;},onPlayAlbum:a=>{opened=a;},onRetry:()=>{retried++;}};
 const render=p=>flushSync(()=>root.render(React.createElement(HomeSurface,p)));
 try {
  render(props);
  assert.equal(opened,null);
  const picker=node.querySelectorAll('.library-multi-picker input')[1];flushSync(()=>picker.click());
  assert.equal(selectedLibrary,'music');
  assert.deepEqual([...node.querySelectorAll('h2')].map(h=>h.textContent),['Recently Played','Recently Added','Internet Radio']);
  assert.equal(node.querySelector('.continue-listening'),null);
  node.querySelector('.album-tile').click();assert.equal(opened.id,'heard');
  render({...props,navidrome:{...props.navidrome,recentAlbums:[],recentAlbumsUnavailable:true}});
  assert.match(node.textContent,/Recently played albums are unavailable/);
  assert.match(node.textContent,/New record/);
  [...node.querySelectorAll('button')].find(b=>b.textContent==='Retry').click();assert.equal(retried,1);
  render({...props,navidrome:{recentAlbums:[],newestAlbums:[]}});
  assert.match(node.textContent,/Albums you listen to will appear here/);
  assert.match(node.textContent,/No albums in this library yet/);
  const requests=[]; const played=[];
  globalThis.fetch=async (input,init)=>{
    const url=String(input);
    if(url.includes('/library/playlists')) return new Promise(resolve=>requests.push({resolve,signal:init?.signal,url}));
    const id=url.split('/').pop();
    return Response.json({playlist:{id,name:'Loved, Not Recent',entry:[{id:`track-${id}`,title:id}]}});
  };
  const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Expected Home playlist state');};
  const clickSmart=async()=>{const button=()=>[...node.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Loved, Not Recent');await waitFor(button);button().click();};
  const playlistPayload=id=>Response.json({playlists:[{id,name:'Loved, Not Recent'}]});
  const smartProps={...props,libraryKey:'first',playlistRevision:0,settings:{discovery:{homeSmartPlaylists:true}},onPlaySong:song=>played.push(song.id)};
  render(smartProps);await clickSmart();await waitFor(()=>requests.length===2);
  requests.slice(0,2).forEach(r=>r.resolve(playlistPayload('before-edit')));await waitFor(()=>played.length===1);
  render({...smartProps,playlistRevision:1});await clickSmart();await waitFor(()=>requests.length===4);
  requests.slice(2,4).forEach(r=>r.resolve(playlistPayload('after-edit')));await waitFor(()=>played.length===2);
  assert.equal(played[1],'track-after-edit');
  render({...smartProps,libraryKey:'second'});await clickSmart();await waitFor(()=>requests.length===6);
  render({...smartProps,libraryKey:'third'});await clickSmart();await waitFor(()=>requests.length===8);
  assert.equal(requests[5].signal.aborted,true);
  requests.slice(6,8).forEach(r=>r.resolve(playlistPayload('third-folder')));await waitFor(()=>played.length===3);
  requests.slice(4,6).forEach(r=>r.resolve(playlistPayload('stale-folder')));await new Promise(r=>setTimeout(r,30));
  assert.equal(played.length,3);
  await clickSmart();await waitFor(()=>played.length===4);
  assert.equal(requests.length,8);
  assert.equal(played[3],'track-third-folder');



  render({...props,settings:{discovery:{homeAudioMuse:true}}});
  assert.ok(!node.textContent.includes('Check AudioMuse status'), 'Home diagnostics removed');
  assert.ok(!node.querySelector('.continue-listening'), 'Duplicate continuation removed');
  assert.ok(node.textContent.includes('Internet Radio'), 'Stations are separate from Journeys');

 } finally {flushSync(()=>root.unmount());await vite.close();await window.happyDOM.close();}
});
