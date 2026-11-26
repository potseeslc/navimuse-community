import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';import {createServer} from 'vite';
test('Journey chooser exposes supported seeds, honors continuation setting, and dispatches only a selected choice',async()=>{
 const w=new Window({url:'http://localhost/'});for(const key of ['window','document','Node','Element','HTMLElement'])globalThis[key]=key==='window'?w:w[key];Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const {JourneyPicker,journeySeedOptions}=await vite.ssrLoadModule('/src/JourneyPicker.jsx');
 const seed={id:'track',title:'Track',artist:'Artist',artistId:'artist',genre:'Rock',genres:[{name:'Rock'},{name:'Alternative'}]};assert.deepEqual(journeySeedOptions(seed),{artist:{id:'artist',name:'Artist'},genres:['Rock','Alternative']});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);let selected=[],closed=0;
 const render=(seed,autoExtend=true)=>flushSync(()=>root.render(React.createElement(JourneyPicker,{seed,autoExtend,onClose:()=>closed++,onChoose:(...args)=>selected.push(args)})));
 try{
  render(seed);assert.equal(selected.length,0,'opening does not start playback');assert.equal(node.querySelector('dialog').open,true);
  const choices=[...node.querySelectorAll('.journey-choices button')];assert.deepEqual(choices.map(x=>x.querySelector('strong').textContent),['Track Journey','Artist Journey','Rock Journey','Alternative Journey','Artist DJ']);
  for(const button of choices)flushSync(()=>button.click());assert.equal(closed,5);assert.deepEqual(selected.map(x=>x[0]),['track','artist','genre','genre','artist-dj']);assert.equal(selected[2][1],'Rock');assert.equal(selected[0][2],seed,'actions use the displayed seed');
  render({id:'unknown',title:'Unknown'},false);const missing=[...node.querySelectorAll('.journey-choices button')];assert.deepEqual(missing.map(b=>b.disabled),[false,true,true,true]);assert.match(node.textContent,/Automatic continuation is off in Settings/);assert.doesNotMatch(node.textContent,/Journeys add more tracks/);
  render(null);assert.equal(node.querySelector('dialog').open,false);
 }finally{flushSync(()=>root.unmount());await vite.close();w.happyDOM.abort();}
});
