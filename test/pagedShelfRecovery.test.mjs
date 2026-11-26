import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('Home shelves deduplicate, retry the same cursor after invalid pages, and cancel stale library requests',async()=>{
 const w=new Window();for(const key of ['window','document','Node','Element','HTMLElement'])globalThis[key]=key==='window'?w:w[key];
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const {usePagedShelf}=await vite.ssrLoadModule('/src/usePagedShelf.js');
 const album=i=>({id:String(i)}),seed=Array.from({length:18},(_,i)=>album(i));const calls=[];let invalid=true,release,slowSignal;
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(input,'http://fixture'),offset=Number(url.searchParams.get('offset')),scope=url.searchParams.get('musicFolderId');calls.push({offset,scope});
  if(scope==='slow'){slowSignal=init.signal;return new Promise(r=>release=()=>r(Response.json({albums:[album('obsolete')],page:{nextOffset:null}})));}
  if(offset===18)return Response.json({albums:[album(17),...Array.from({length:17},(_,i)=>album(18+i))],page:{nextOffset:36}});
  return Response.json({albums:[album(35)],page:{nextOffset:invalid?36:null}});
 };
 let state;function Harness({scope}){state=usePagedShelf(seed,'newest',scope);return React.createElement('div',null,state.albums.length);}
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const render=scope=>flushSync(()=>root.render(React.createElement(Harness,{scope})));
 const settle=()=>new Promise(r=>setTimeout(r,30));
 try{
  render('music');await settle();await state.load();await settle();assert.equal(state.albums.length,35);
  await state.load();await settle();assert.equal(state.albums.length,35);assert.ok(state.error);assert.equal(state.more,true);
  invalid=false;await state.load();await settle();assert.equal(state.albums.length,36);assert.equal(state.more,false);assert.equal(state.error,'');
  assert.deepEqual(calls.map(c=>c.offset),[18,36,36]);
  render('slow');await settle();const pending=state.load();await settle();assert.equal(state.loading,true);
  render('other');assert.equal(slowSignal.aborted,true);release();await pending;await settle();
  assert.equal(state.albums.length,18);assert.equal(state.loading,false);assert.equal(state.error,'');
 }finally{flushSync(()=>root.unmount());globalThis.fetch=oldFetch;await vite.close();w.close();}
});
