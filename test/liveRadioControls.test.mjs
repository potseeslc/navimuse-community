import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('live radio disables track navigation, shuffle and repeat while keeping play and output available',async()=>{
 const w=new Window({url:'http://localhost/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?w:w[key];
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const {MiniPlayer}=await vite.ssrLoadModule('/src/playerChrome.jsx');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const controls={shuffle:false,repeat:false,repeatAll:true};
 const render=id=>flushSync(()=>root.render(React.createElement(MiniPlayer,{controls,nowPlaying:{id,title:'Station',artist:'Radio'},playbackState:{duration:0,canSeek:false},queue:{index:0,items:[{song:{id}}]},onOpenOutput:()=>{},onToggle:()=>{}})));
 try{
  render('radio:station-1');
  for(const label of ['Previous track','Next track','Shuffle queue'])assert.equal(host.querySelector(`[aria-label="${label}"]`).disabled,true,label);
  assert.equal([...host.querySelectorAll('button')].find(b=>/repeat/i.test(b.getAttribute('aria-label')||'')).disabled,true);
  assert.equal(host.querySelector('[aria-label="Play"]').disabled,false);
  assert.equal(host.querySelector('.output-trigger').disabled,false);
  render('library-song');assert.equal(host.querySelector('[aria-label="Previous track"]').disabled,false);assert.equal(host.querySelector('[aria-label="Next track"]').disabled,false);
 }finally{flushSync(()=>root.unmount());await vite.close();await w.happyDOM.abort();}
});
