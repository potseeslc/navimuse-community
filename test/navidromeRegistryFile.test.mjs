import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,chmodSync,symlinkSync,unlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadNavidromeRegistryFile} from '../server/navidromeRegistryFile.mjs';
const entries=[{credentialRef:'owner',serverId:'10000000-0000-4000-8000-000000000001',url:'http://fixture.invalid',username:'MusicOwner',password:'  Exact fixture password  '}];
function fixture(t) {
 const directory=mkdtempSync(join(tmpdir(),'navimuse-registry-file-')),path=join(directory,'registry.json');
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const write=value=>writeFileSync(path,value,{mode:0o600});
 write(JSON.stringify({version:'navimuse-navidrome-registry/v1',entries}));
 return {directory,path,write};
}
test('private registry file preserves exact credentials and rereads operator replacement',t=>{
 const f=fixture(t);assert.deepEqual(loadNavidromeRegistryFile(f.path),entries);
 f.write(JSON.stringify({version:'navimuse-navidrome-registry/v1',entries:[]}));
 assert.deepEqual(loadNavidromeRegistryFile(f.path),[]);
});
test('registry rejects unsafe permissions, symlink targets and untrusted parent directory',t=>{
 const f=fixture(t),denied=()=>assert.throws(()=>loadNavidromeRegistryFile(f.path),/^Error: Navidrome registry file unavailable$/);
 chmodSync(f.path,0o644);denied();chmodSync(f.path,0o600);
 chmodSync(f.directory,0o777);denied();chmodSync(f.directory,0o700);
 const target=join(f.directory,'target');writeFileSync(target,'private',{mode:0o600});
 unlinkSync(f.path);symlinkSync(target,f.path);denied();unlinkSync(f.path);mkdirSync(f.path);denied();
 assert.throws(()=>loadNavidromeRegistryFile('relative.json'),/^Error: Navidrome registry file unavailable$/);
});
test('registry rejects oversize, invalid UTF-8 and malformed schemas without echoing content',t=>{
 const f=fixture(t);
 for (const content of [Buffer.alloc(1024*1024+1),Buffer.from([0xff]),'private invalid JSON','null','[]',
  JSON.stringify({version:'wrong',entries}),JSON.stringify({version:'navimuse-navidrome-registry/v1',entries,secret:'private'}),
  JSON.stringify({version:'navimuse-navidrome-registry/v1',entries:Array(257).fill({})})]) {
  f.write(content);assert.throws(()=>loadNavidromeRegistryFile(f.path),/^Error: Navidrome registry file unavailable$/);
 }
 unlinkSync(f.path);assert.throws(()=>loadNavidromeRegistryFile(f.path),/^Error: Navidrome registry file unavailable$/);
});
