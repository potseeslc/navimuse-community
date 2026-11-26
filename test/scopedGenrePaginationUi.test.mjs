import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('scoped genre pages continue empty matches, retain loaded results on retry, and discard old-folder responses',async()=>{
 const window=new Window({url:'http://localhost/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?window:window[key];
 globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 let fail=true,release;const calls=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input),'http://localhost'),folder=u.searchParams.get('musicFolderId'),offset=Number(u.searchParams.get('offset')||0);
  calls.push({folder,offset});
  if(folder==='new')return Response.json({genres:[{value:'New folder'}],page:null});
  if(offset===0)return Response.json({genres:[],page:{limit:32,nextOffset:32}});
  if(offset===32)return Response.json({genres:[],page:{limit:32,nextOffset:48}});
  if(offset===48)return Response.json({genres:[{value:'Jazz'}],page:{limit:32,nextOffset:64}});
  if(offset===64)return Response.json({genres:[],page:{limit:32,nextOffset:80}});
  if(offset===80&&fail)return new Response('{}',{status:503});
  if(offset===80)return Response.json({genres:Array.from({length:120},(_,i)=>({value:i===0?'Soul':`Genre ${i}`})),page:{limit:32,nextOffset:96}});
  return new Promise(resolve=>{release=()=>resolve(Response.json({genres:[{value:'Stale'}],page:null}));});
 };
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {LibrarySurface}=await vite.ssrLoadModule('/src/librarySearchSurfaces.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Expected scoped genre state');};
 const button=t=>[...node.querySelectorAll('button')].find(b=>b.textContent.trim()===t);
 const click=b=>{assert(b);b.focus();b.click();};
 const render=folder=>flushSync(()=>root.render(React.createElement(LibrarySurface,{libraryKey:folder,browseKey:'genres',settings:{}})));
 try{
  render('old');await wait(()=>button('Load more genres'));assert.match(node.textContent,/No matching genres/);
  click(button('Load more genres'));await wait(()=>node.querySelector('h3')?.textContent==='Jazz');
  const jazz=node.querySelector('h3'),more=button('Load more genres');
  click(more);await wait(()=>button('Retry loading more genres'));
  assert(jazz.isConnected);assert.equal(document.activeElement,more);assert.match(node.querySelector('[role="alert"]').textContent,/loaded genres are still available/);
  fail=false;click(more);await wait(()=>node.querySelectorAll('h3').length===121&&[...node.querySelectorAll('h3')].some(h=>h.textContent==='Soul'));
  assert.equal(document.activeElement,more);assert(jazz.isConnected);assert.equal(node.querySelectorAll('h3').length,121,'fetched matches are immediately visible');assert.deepEqual(calls.map(c=>c.offset),[0,32,48,64,80,80]);
  click(more);await wait(()=>release);render('new');await wait(()=>node.querySelector('h3')?.textContent==='New folder');
  release();await new Promise(r=>setTimeout(r,40));assert(!node.textContent.includes('Stale'));assert(!button('Load more genres'));
 }finally{flushSync(()=>root.unmount());await vite.close();await window.happyDOM.close();}
});
