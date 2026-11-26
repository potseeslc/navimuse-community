import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,chmodSync,symlinkSync,statSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadAccountSecrets} from '../server/accountSecrets.mjs';
const exec=promisify(execFile);
function fixture(t) {const dataDir=mkdtempSync(join(tmpdir(),'navimuse-secrets-'));t.after(()=>rmSync(dataDir,{recursive:true,force:true}));return dataDir;}
test('account secrets require explicit creation, persist across restart and are returned as independent buffers',t=>{
  const dataDir=fixture(t),path=join(dataDir,'account-secrets-v1');
  assert.throws(()=>loadAccountSecrets({dataDir}),/Account secrets unavailable/);
  assert.deepEqual(readdirSync(dataDir),[]);
  const first=loadAccountSecrets({dataDir,allowCreate:true});
  assert.equal(first.throttleSecret.length,32);assert.equal(first.queueSecret.length,32);
  assert.notDeepEqual(first.throttleSecret,first.queueSecret);
  assert.equal(statSync(path).mode&0o777,0o600);
  const persisted=readFileSync(path);
  first.queueSecret.fill(0);
  assert.deepEqual(loadAccountSecrets({dataDir}).queueSecret,persisted.subarray(32));
  assert.deepEqual(loadAccountSecrets({dataDir,allowCreate:true}).throttleSecret,persisted.subarray(0,32));
  assert.deepEqual(readFileSync(path),persisted);
});
test('concurrent startup processes publish one complete persistent secret file',async t=>{
  const dataDir=fixture(t);
  const moduleUrl=new URL('../server/accountSecrets.mjs',import.meta.url).href;
  const code=`import {loadAccountSecrets} from ${JSON.stringify(moduleUrl)};import {createHash} from 'node:crypto';const s=loadAccountSecrets({dataDir:process.argv[1],allowCreate:true});process.stdout.write(createHash('sha256').update(s.throttleSecret).update(s.queueSecret).digest('hex'));`;
  const results=await Promise.all(Array.from({length:12},()=>exec(process.execPath,['--input-type=module','-e',code,dataDir])));
  assert.equal(new Set(results.map(result=>result.stdout)).size,1);
  assert.deepEqual(readdirSync(dataDir),['account-secrets-v1']);
  assert.equal(readFileSync(join(dataDir,'account-secrets-v1')).length,64);
});
test('unsafe, symlinked and malformed files fail closed without replacement',t=>{
  for (const kind of ['short','oversized','public','symlink']) {
    const dataDir=fixture(t),path=join(dataDir,'account-secrets-v1');
    const original=Buffer.alloc(kind==='short'?63:kind==='oversized'?65:64,7);
    if(kind==='symlink') {const other=join(dataDir,'other');writeFileSync(other,original,{mode:0o600});symlinkSync(other,path);}
    else writeFileSync(path,original,{mode:kind==='public'?0o644:0o600});
    assert.throws(()=>loadAccountSecrets({dataDir,allowCreate:true}),/^Error: Account secrets unavailable$/);
    assert.deepEqual(readFileSync(path),original);
  }
  const dataDir=fixture(t);chmodSync(dataDir,0o777);
  assert.throws(()=>loadAccountSecrets({dataDir,allowCreate:true}),/Account secrets unavailable/);
  assert.deepEqual(readdirSync(dataDir),[]);
});
