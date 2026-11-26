import test from 'node:test';import assert from 'node:assert/strict';
import {Window} from 'happy-dom';import {createServer} from 'vite';
test('pending preferences cannot disable or remove a reattached speaker autoplay queue',async()=>{
 const w=new Window({url:'http://localhost/'});
 for(const k of ['window','document','Node','Element','HTMLElement','HTMLCanvasElement','ResizeObserver','CustomEvent'])globalThis[k]=k==='window'?w:w[k];
 Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 let finishSettings;const commands=[];
 let session={id:'speaker',revision:1,generation:1,status:'paused',song:{id:'seed',title:'Seed'},queue:{index:0,items:[{queueItemId:'one',song:{id:'seed'}},{queueItemId:'two',song:{id:'suggested'},autoplay:true,provenance:'generated'}]},controls:{autoplayAfterQueue:true}};
 globalThis.fetch=async(input,init)=>{
  const u=String(input);
  if(u.endsWith('/api/settings'))return new Promise(resolve=>finishSettings=()=>resolve(Response.json({preferences:{playback:{autoplayAfterQueue:true,continueThroughQueue:true}}})));
  if(u.includes('/settings/session'))return Response.json({adminConfigured:true,authenticated:true,queueScope:`queue-scope-v1:${'a'.repeat(64)}`});
  if(u.includes('/playback/wiim/')&&u.includes('/commands')){const command=JSON.parse(init.body);commands.push(command);session={...session,revision:session.revision+1,controls:{...session.controls,...command.controls}};return Response.json({session});}
  if(u.includes('/playback/wiim/session'))return Response.json({session});
  return Response.json({});
 };
 const vite=await createServer({root:process.cwd(),appType:'custom',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true},plugins:[{name:'expose-test',enforce:'pre',transform(code,id){if(!id.endsWith('/src/main.jsx'))return;code=code.slice(0,code.lastIndexOf('\nif (nativeFirstPartyRedirect)'));return code.replace('  const surfaces = {','  globalThis.autoplaySettingsTest={setSettingsState};\n  const surfaces = {')+'\nexport {App};';}}]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');let root;
 const until=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Condition did not resolve');};
 try{
  const {App}=await vite.ssrLoadModule('/src/main.jsx');const container=document.createElement('div');document.body.append(container);root=createRoot(container);flushSync(()=>root.render(React.createElement(App)));
  await until(()=>finishSettings&&container.textContent.includes('Seed'));assert.equal(commands.length,0,'default false must not send a disable command before settings resolve');
  finishSettings();await new Promise(r=>setTimeout(r,100));assert.equal(commands.length,0,'saved enabled preference agrees with remote session');
  flushSync(()=>autoplaySettingsTest.setSettingsState(state=>({...state,preferences:{...state.preferences,playback:{...state.preferences.playback,autoplayAfterQueue:false}}})));
  await until(()=>commands.length>0);assert.equal(commands.length,1);assert.equal(commands[0].action,'controls');assert.equal(commands[0].controls.autoplayAfterQueue,false);
 }finally{if(root)flushSync(()=>root.unmount());await vite.close();w.close();}
});
