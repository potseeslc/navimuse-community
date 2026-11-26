// Run only the authored, account-free fixture and collect its own WebKit snapshots.
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync,copyFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const destination=process.argv[2]||'docs/evidence/m8/phone-player';mkdirSync(destination,{recursive:true});
const app='com.developer.navimuse.playerfixture';
for(const [width,height,menu] of [[874,350,false],[874,350,true],[402,800,false],[402,800,true]]){
 try{execFileSync('xcrun',['simctl','terminate','booted',app],{stdio:'ignore'});}catch{}
 const start=Date.now();execFileSync('xcrun',['simctl','launch','booted',app,String(width),String(height),...(menu?['menu']:[])],{stdio:'ignore'});
 const directory=join(execFileSync('xcrun',['simctl','get_app_container','booted',app,'data'],{encoding:'utf8'}).trim(),'Documents');
 let file;
 for(let i=0;i<200;i++){
  file=readdirSync(directory).find(f=>f.endsWith('.json')&&statSync(join(directory,f)).mtimeMs>=start);
  if(file && readdirSync(directory).includes(file.replace('.json','.png')) && statSync(join(directory,file.replace('.json','.png'))).mtimeMs>=start)break;
  file=null;await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(file,'fixture produced both a snapshot and geometry');
 const metrics=JSON.parse(readFileSync(join(directory,file),'utf8'));assert.ok(metrics.viewport);assert.deepEqual(metrics.errors||[],[],'fixture must not have JavaScript errors');
 if(width>height){
  assert.ok(metrics.viewport.landscape);
  assert.ok(metrics['.cover-art'].rect.right < metrics['.track-copy'].rect.left);
  assert.ok(metrics['.transport'].rect.bottom<=metrics.viewport.height);
  assert.equal(metrics['.desktop-player-zone'].visibility,'hidden');
 }
 if(width<height){
  assert.equal(metrics['.art-stage'].rect.top,0,'art reaches the top edge');
  assert.equal(metrics['.art-stage'].rect.left,0);
  assert.equal(metrics['.art-stage'].rect.right,metrics.viewport.width);
  assert.ok(metrics['.player-topline'].rect.height>=100,'header reserves the phone safe area');
  assert.ok(metrics['.transport'].rect.bottom<=metrics.viewport.height-34,'transport stays above the home indicator');
 }
 if(menu){const r=metrics['.player-action-panel'].rect;assert.ok(r.left>=0 && r.right<=metrics.viewport.width && r.top>=0 && r.bottom<=metrics.viewport.height,'menu stays inside native viewport');}
 for(const suffix of ['.json','.png'])copyFileSync(join(directory,file.replace('.json',suffix)),join(destination,file.replace('.json',suffix)));
 console.log(`PASS ${file}`);
}
execFileSync('xcrun',['simctl','terminate','booted',app],{stdio:'ignore'});
