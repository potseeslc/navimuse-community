import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window=new Window();global.window=window;global.document=window.document;global.HTMLElement=window.HTMLElement;
const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
const {useAlbumPlayback}=await import('../src/useAlbumPlayback.js');
class Audio extends EventTarget {supportsAlbumQueue=true;preparations=[];cancels=0;pauses=0;async prepareAlbum(p){this.preparations.push(p);return true;}cancelAlbum(){this.cancels++;}pause(){this.pauses++;}handoff(index,token=this.preparations.at(-1).token){this.dispatchEvent(new CustomEvent('albumhandoff',{detail:{token,queueItemId:'item-'+index}}));}}
function fixture(t,web=false){
 const audio=new Audio();if(web)audio.mediaElement={};const nodes=[audio],audioRef={current:audio},queueRef={current:{index:0,items:Array.from({length:4},(_,i)=>({queueItemId:'item-'+i,song:{id:'song-'+i,albumId:'album',track:i+1,duration:60}}))}};
 const adopted=[],notices=[],root=createRoot(document.createElement('div'));let options={};
 const urlFor=song=>'https://test.local/'+song.id;
 function Probe(){useAlbumPlayback({audioRef,audioNodes:nodes,queue:queueRef.current,queueRef,controls:{},enabled:true,isPlaying:true,blocked:false,position:0,urlFor,adopt:index=>{adopted.push(index);queueRef.current={...queueRef.current,index};return true;},notify:m=>notices.push(m),...options});return null;}
 const render=patch=>{options={...options,...patch};flushSync(()=>root.render(React.createElement(Probe)));};
 t.after(()=>{flushSync(()=>root.unmount());});render();return {audio,queueRef,adopted,notices,render};
}
test('native multi-track receipt reconciles once and keeps the remaining native run',t=>{
 const f=fixture(t);assert.equal(f.audio.preparations.length,1);f.audio.handoff(2);assert.deepEqual(f.adopted,[2]);f.render();assert.equal(f.audio.preparations.length,1);
 f.audio.handoff(2);assert.deepEqual(f.adopted,[2]);assert.equal(f.audio.pauses,0);
});
test('web handoff prepares only the next reservation after promotion',t=>{
 const f=fixture(t,true);f.audio.handoff(1);f.render();assert.equal(f.audio.preparations.length,2);assert.equal(f.audio.preparations[1].entries[0].queueItemId,'item-2');
});
test('queue edit cancels stale audio and an already-racing receipt cannot advance the edited queue',t=>{
 const f=fixture(t);const token=f.audio.preparations[0].token;f.queueRef.current={index:0,items:[f.queueRef.current.items[0],f.queueRef.current.items[3]]};f.render();assert.equal(f.audio.cancels,1);
 f.audio.handoff(1,token);assert.deepEqual(f.adopted,[]);assert.equal(f.audio.pauses,1);assert.equal(f.notices.length,1);
});
test('output transfer and pause disable preparation; resuming can prepare again',t=>{
 const f=fixture(t);f.render({blocked:true});assert.equal(f.audio.cancels,1);f.render({blocked:false,isPlaying:false});assert.equal(f.audio.preparations.length,1);f.render({isPlaying:true});assert.equal(f.audio.preparations.length,2);
});
test('native recovery invalidation re-arms without advancing the queue',t=>{
 const f=fixture(t);f.audio.dispatchEvent(new Event('albuminvalidated'));f.render({position:2});assert.equal(f.audio.preparations.length,2);assert.deepEqual(f.adopted,[]);
});
