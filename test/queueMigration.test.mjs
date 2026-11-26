import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { QUEUE_PERSISTENCE_KEY, buildPersistedQueueState } from '../src/queueStore.js';
import { QUEUE_MIGRATION_KEY, scopedQueueStorage } from '../src/queueStorageScope.js';

test('legacy queue migration requires a choice and preserves the original snapshot', async () => {
  const window = new Window({url:'http://localhost/'});
  for(const key of ['window','document','Node','Element','HTMLElement']) globalThis[key]=key==='window'?window:window[key];
  const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
  const React=await import('react');
  const {createRoot}=await import('react-dom/client');
  const {flushSync}=await import('react-dom');
  const {legacyQueueMigration,QueueMigration}=await vite.ssrLoadModule('/src/QueueMigration.jsx');
  const scope=`queue-scope-v1:${'a'.repeat(64)}`;
  const original=JSON.stringify(buildPersistedQueueState({items:[{song:{id:'old-track'}}],index:0},[],[],{},15));
  window.localStorage.setItem(QUEUE_PERSISTENCE_KEY,original);
  assert.equal(legacyQueueMigration(window.localStorage,null),null);
  const migration=legacyQueueMigration(window.localStorage,scope);
  assert.ok(migration);
  assert.equal(scopedQueueStorage(window.localStorage,scope).getItem(QUEUE_PERSISTENCE_KEY),null);
  const node=document.createElement('div');document.body.append(node);
  const root=createRoot(node);
  let done=false;
  try {
    flushSync(()=>root.render(React.createElement(QueueMigration,{migration,onDone:()=>{done=true;}})));
    const restore=[...node.querySelectorAll('button')].find(button=>button.textContent==='Restore saved queue');
    assert.ok(restore);
    const setItem=migration.target.setItem;
    migration.target.setItem=()=>{throw new Error('Synthetic storage quota exceeded');};
    flushSync(()=>restore.click());
    assert.equal(done,false,'failed copy cannot complete migration');
    assert.match(node.querySelector('[role=alert]').textContent,/saved queue could not be copied/);
    assert.equal(window.localStorage.getItem(QUEUE_PERSISTENCE_KEY),original);
    assert.equal(scopedQueueStorage(window.localStorage,scope).getItem(QUEUE_PERSISTENCE_KEY),null);
    assert.equal(scopedQueueStorage(window.localStorage,scope).getItem(QUEUE_MIGRATION_KEY),null,'failed restore is not marked skipped');
    assert.ok(legacyQueueMigration(window.localStorage,scope),'the original remains eligible for recovery');
    migration.target.setItem=setItem;
    flushSync(()=>restore.click());
    assert.equal(done,true);
    assert.equal(JSON.parse(scopedQueueStorage(window.localStorage,scope).getItem(QUEUE_PERSISTENCE_KEY)).items[0].song.id,'old-track');
    assert.equal(window.localStorage.getItem(QUEUE_PERSISTENCE_KEY),original);
    assert.equal(legacyQueueMigration(window.localStorage,scope),null);
  } finally {flushSync(()=>root.unmount());await vite.close();window.close();}
});
