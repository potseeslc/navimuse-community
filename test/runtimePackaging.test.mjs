import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

test('packaged account runtime imports without client src files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'navimuse-runtime-package-'));
 try {
  // Docker's runtime stage includes server/ and shared/, not client src/.
  await cp(resolve('server'),join(root,'server'),{recursive:true});
  await cp(resolve('shared'),join(root,'shared'),{recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  await symlink(resolve('node_modules'),join(root,'node_modules'));
  const runtimeUrl=pathToFileURL(join(root,'server/accountRuntime.mjs')).href;
  const preferencesUrl=pathToFileURL(join(root,'shared/accountPreferences.js')).href;
  const script=`const {openLocalAccountRuntime}=await import(${JSON.stringify(runtimeUrl)});const {defaultAccountPreferences}=await import(${JSON.stringify(preferencesUrl)});console.log(JSON.stringify({runtime:typeof openLocalAccountRuntime,preferences:defaultAccountPreferences()}));`;
  const {defaultAppSettings,defaultSettingsState}=await import('../src/appSettings.js');
  assert.deepEqual(defaultSettingsState.preferences,defaultAppSettings);
  for (const cwd of [root,tmpdir()]) {
   const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',script],{cwd,timeout:15000});
   const result=JSON.parse(stdout);assert.equal(result.runtime,'function');
   assert.deepEqual(result.preferences,defaultAppSettings);
  }
 } finally {await rm(root,{recursive:true,force:true});}
});
