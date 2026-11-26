import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRadioFeedbackStore} from '../server/radioFeedback.mjs';
test('station feedback survives reopening, separates accounts and rejects invalid writes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nm-radio-feedback-'));
 try{
  const a='queue-scope-v1:'+'a'.repeat(64),b='queue-scope-v2:'+'b'.repeat(64);
  const store=createRadioFeedbackStore(dir);
  assert.deepEqual(store.read(a),{});
  store.write(a,'radio:one',{favorite:true,rating:4});
  assert.equal(createRadioFeedbackStore(dir).read(a)['radio:one'].rating,4);
  assert.deepEqual(store.read(b),{});
  store.write(a,'radio:two',{favorite:false,rating:0});
  store.write(a,'radio:one',{favorite:false,rating:3});
  assert.equal(Object.keys(store.read(a)).length,2);
  assert.equal(store.read(a)['radio:one'].favorite,false);
  assert.throws(()=>store.write('../escape','radio:one',{favorite:true,rating:4}));
  assert.throws(()=>store.write(a,'song:one',{favorite:true,rating:4}));
  assert.throws(()=>store.write(a,'radio:one',{favorite:true,rating:8}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('station feedback filenames cannot contain caller-controlled path components',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nm-radio-path-'));
 try{
  const store=createRadioFeedbackStore(dir);
  for(const scope of ['../escape','/tmp/escape','queue-scope-v2:'+('../'.repeat(22)),'queue-scope-v1:'+'a'.repeat(64)+'/../escape']){
   assert.throws(()=>store.read(scope),{status:403});
   assert.throws(()=>store.write(scope,'radio:one',{favorite:true,rating:1}),{status:403});
  }
  assert.deepEqual(readdirSync(dir),[]);
  store.write('queue-scope-v2:'+'f'.repeat(64),'radio:../station',{favorite:true,rating:1});
  assert.equal(readdirSync(dir).length,1);
  assert.match(readdirSync(dir)[0],/^[a-f0-9]{64}\.json$/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('corrupt and unreadable feedback fails closed without overwriting saved bytes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nm-radio-corrupt-'));
 try{
  const scope='queue-scope-v2:'+'c'.repeat(64),store=createRadioFeedbackStore(dir);
  store.write(scope,'radio:one',{favorite:true,rating:1});
  const path=join(dir,readdirSync(dir)[0]);
  for(const bad of ['{broken','null','[]']){
   writeFileSync(path,bad);
   assert.throws(()=>store.read(scope),{status:500,publicMessage:'Saved station feedback is temporarily unavailable.'});
   assert.throws(()=>store.write(scope,'radio:two',{favorite:false,rating:0}),{status:500});
   assert.equal(readFileSync(path,'utf8'),bad);
  }
  rmSync(path);mkdirSync(path);
  assert.throws(()=>store.read(scope),{status:500});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
