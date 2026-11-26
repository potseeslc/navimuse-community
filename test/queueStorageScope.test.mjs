import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedQueueStorage } from '../src/queueStorageScope.js';
import { savePersistedQueue, loadPersistedQueue } from '../src/queueStore.js';
test('queue namespaces isolate users and servers without reading legacy records', () => {
  const values = new Map([['navimuse.queue.v1', 'legacy']]);
  const storage = { getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k) };
  const a = scopedQueueStorage(storage, `queue-scope-v1:${'a'.repeat(64)}`);
  const b = scopedQueueStorage(storage, `queue-scope-v1:${'b'.repeat(64)}`);
  savePersistedQueue(a,{items:[{song:{id:'private-track'}}],index:0},[],[],{},15);
  assert.equal(loadPersistedQueue(a).position,15);
  assert.equal(loadPersistedQueue(b),null);
  assert.equal(values.get('navimuse.queue.v1'),'legacy');
  assert.equal(scopedQueueStorage(storage,null),null);
  assert.equal(scopedQueueStorage(storage,'untrusted-user'),null);
});
