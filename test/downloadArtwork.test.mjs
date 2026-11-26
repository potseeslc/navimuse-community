import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';import {createServer} from 'vite';
test('download artwork is reused offline only within its account scope',async()=>{
 const w=new Window({url:'https://navimuse.example.com/'});Object.assign(globalThis,{window:w,document:w.document,location:w.location,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
 const oldFetch=globalThis.fetch,oldCaches=globalThis.caches;let requests=0;const entries=new Map();
 globalThis.caches={open:async()=>({match:async key=>entries.get(key)?.clone(),put:async(key,value)=>entries.set(key,value),keys:async()=>[...entries.keys()],delete:async key=>entries.delete(key)})};
 globalThis.fetch=async()=>{requests++;return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>',{headers:{'Content-Type':'image/svg+xml'}});};
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom'),{DownloadArtwork}=await vite.ssrLoadModule('/src/DownloadArtwork.jsx');const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const render=async(scope,offline)=>{flushSync(()=>root.render(React.createElement(DownloadArtwork,{song:{coverArt:'cover'},scope,offline})));await new Promise(r=>setTimeout(r,40));};
 try{await render('account-a',false);assert.equal(requests,1);assert.ok(node.querySelector('img'));assert.equal(entries.size,1);await render('account-a',true);assert.equal(requests,1);assert.ok(node.querySelector('img'));await render('account-b',true);assert.equal(requests,1);assert.equal(node.querySelector('img'),null);}finally{flushSync(()=>root.unmount());globalThis.fetch=oldFetch;globalThis.caches=oldCaches;await vite.close();await w.happyDOM.close();}
});
