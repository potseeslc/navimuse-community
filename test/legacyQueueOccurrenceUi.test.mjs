import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('restored ordinary occurrences keep DOM identity, edit focus, undo and persisted IDs',async()=>{
 const w=new Window();for(const key of ['window','document','Node','Element','HTMLElement'])globalThis[key]=key==='window'?w:w[key];
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const controls={shuffle:false,repeat:false,pauseAfterCurrent:false};
 const legacy={version:1,index:0,items:[{song:{id:'current',title:'Current'}},{song:{id:'same-song',title:'First occurrence'}},{song:{id:'same-song',title:'Second occurrence'}}],controls,position:12,timestamp:1,shufflePool:[],playHistory:[]};
 const values=new Map([['navimuse.queue.v1',JSON.stringify(legacy)]]);const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const node=document.createElement('div');document.body.append(node);let root=createRoot(node),api;
 try{
  const {usePlayerQueueState}=await vite.ssrLoadModule('/src/playerQueueState.js');const {DesktopQueuePanel}=await vite.ssrLoadModule('/src/QueueOverlay.jsx');
  function Scene(){api=usePlayerQueueState(controls,{storage});return React.createElement(DesktopQueuePanel,{queue:api.queue,controls,onMoveQueueItem:api.moveQueueItem,onRemoveQueueItem:api.removeQueueItem,onUndoQueueEdit:api.undoQueueEdit,canUndoQueueEdit:api.canUndoQueueEdit});}
  flushSync(()=>root.render(React.createElement(Scene)));
  const ids=api.queueRef.current.items.map(x=>x.queueItemId);assert.equal(new Set(ids).size,3);assert.ok(ids.every(Boolean));
  const row=node.querySelector(`[data-queue-motion-key="${ids[1]}"]`);const move=node.querySelector('[aria-label="Move First occurrence down in queue"]');move.focus();flushSync(()=>move.click());
  assert.equal(node.querySelector(`[data-queue-motion-key="${ids[1]}"]`),row,'reordering retains the same DOM row');
  assert.match(document.activeElement.getAttribute('aria-label'),/Move First occurrence/);
  assert.deepEqual(api.queueRef.current.items.map(x=>x.queueItemId),[ids[0],ids[2],ids[1]]);
  flushSync(()=>node.querySelector('[aria-label="Remove Second occurrence from queue"]').click());
  assert.equal(document.activeElement.getAttribute('aria-label'),'Remove First occurrence from queue');
  flushSync(()=>api.undoQueueEdit());assert.deepEqual(api.queueRef.current.items.map(x=>x.queueItemId),[ids[0],ids[2],ids[1]]);
  flushSync(()=>api.addToQueue(api.queueRef.current.items[2]));
  const editedIds=api.queueRef.current.items.map(x=>x.queueItemId);assert.equal(new Set(editedIds).size,4,'adding another occurrence never reuses an existing ID');assert.deepEqual(editedIds.slice(0,3),[ids[0],ids[2],ids[1]]);
  api.persist(12);flushSync(()=>root.unmount());root=createRoot(node);flushSync(()=>root.render(React.createElement(Scene)));
  assert.deepEqual(api.queueRef.current.items.map(x=>x.queueItemId),editedIds,'restart preserves each occurrence ID');
  flushSync(()=>api.playNext(api.queueRef.current.items[3]));
  const nextIds=api.queueRef.current.items.map(x=>x.queueItemId);assert.equal(new Set(nextIds).size,5,'play next inserts a new occurrence before its original');assert.deepEqual([nextIds[0],...nextIds.slice(2)],editedIds,'inserting before an existing occurrence preserves its ID');
 }finally{flushSync(()=>root.unmount());await vite.close();await w.happyDOM.close();}
});
