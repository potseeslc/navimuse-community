import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync,copyFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const destination=process.argv[2]||'docs/evidence/m8/offline-downloads/ui';mkdirSync(destination,{recursive:true});
const app='com.developer.navimuse.downloadsfixture';
for(const [width,height,settings] of [[402,800,false],[402,800,true],[874,350,false],[874,350,true]]){
 try{execFileSync('xcrun',['simctl','terminate','booted',app],{stdio:'ignore'});}catch{}
 const start=Date.now();execFileSync('xcrun',['simctl','launch','booted',app,String(width),String(height),...(settings?['settings']:[])],{stdio:'ignore'});
 const directory=join(execFileSync('xcrun',['simctl','get_app_container','booted',app,'data'],{encoding:'utf8'}).trim(),'Documents');let file;
 for(let i=0;i<100;i++){
  file=readdirSync(directory).find(f=>f.endsWith('.json')&&statSync(join(directory,f)).mtimeMs>=start);
  if(file && readdirSync(directory).includes(file.replace('.json','.png')) && statSync(join(directory,file.replace('.json','.png'))).mtimeMs>=start)break;
  file=null;await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(file,'native fixture produced image and metrics');const metrics=JSON.parse(readFileSync(join(directory,file),'utf8'));
 assert.ok(metrics.surface);assert.ok(metrics.bodyWidth<=metrics.viewport.width);assert.ok(metrics.surface.scrollWidth<=metrics.surface.width+1,'no horizontal surface overflow');
 for(const control of metrics.controls){assert.ok(control.rect.height>=44,`${control.label}: touch height`);assert.ok(control.rect.left>=0&&control.rect.right<=metrics.viewport.width+1,`${control.label}: stays inside width`);}
 for(const suffix of ['.json','.png'])copyFileSync(join(directory,file.replace('.json',suffix)),join(destination,file.replace('.json',suffix)));
 console.log(`PASS ${file}`);
}
execFileSync('xcrun',['simctl','terminate','booted',app],{stdio:'ignore'});
