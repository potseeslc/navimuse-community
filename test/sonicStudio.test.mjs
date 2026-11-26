import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('mix creation is explicit, cancelable, editable and saves only the reviewed order',async()=>{
 const w=new Window({url:'http://localhost/'});for(const name of ['window','document','Node','Element','HTMLElement'])globalThis[name]=name==='window'?w:w[name];Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
 const calls=[],played=[];globalThis.fetch=(url,init)=>new Promise(resolve=>calls.push({url:String(url),init,resolve}));
 const wait=()=>new Promise(resolve=>setTimeout(resolve,25));
 const reply=(call,body,status=200)=>call.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const click=button=>flushSync(()=>button.click());
 const button=label=>[...node.querySelectorAll('button')].find(el=>el.textContent.trim()===label || el.getAttribute('aria-label')===label);
 const change=(selector,value)=>{const el=node.querySelector(selector);const key=Object.keys(el).find(key=>key.startsWith('__reactProps'));flushSync(()=>el[key].onChange({target:{value}}));};
 const submit=selector=>flushSync(()=>node.querySelector(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})));
 try{
  const {SonicStudio}=await vite.ssrLoadModule('/src/SonicStudio.jsx');
  flushSync(()=>root.render(React.createElement(SonicStudio,{libraryKey:'one',onPlaySong:(...args)=>played.push(args),onAddToQueue(){},onPlayNext(){}})));
  await wait();assert.equal(calls.length,0);assert.equal(played.length,0);
  change('textarea','warm jazz');submit('.sonic-query');await wait();assert.equal(calls.length,1);
  assert.deepEqual(JSON.parse(calls[0].init.body),{mode:'sound',query:'warm jazz',limit:24});
  click(button('Cancel'));reply(calls[0],{tracks:[{id:'late',title:'Late'}]});await wait();assert.ok(!node.textContent.includes('Late'));
  submit('.sonic-query');await wait();reply(calls[1],{tracks:[{id:'a',title:'A',artist:'Artist'},{id:'b',title:'B'},{id:'c',title:'C'}]});await wait();
  assert.equal(played.length,0);assert.equal(document.activeElement,node.querySelector('h3'));
  click(button('Move B up'));click(button('Remove C from mix'));click(button('Play mix'));
  assert.deepEqual(played[0][2].map(song=>song.id),['b','a']);
  submit('.sonic-save');submit('.sonic-save');await wait();assert.equal(calls.length,3,'Only one save while pending');
  assert.deepEqual(JSON.parse(calls[2].init.body),{name:'warm jazz',songIds:['b','a']});reply(calls[2],{playlist:{id:'saved'}});await wait();assert.ok(button('Saved').disabled);
  click(button('Alchemy'));change('#sonic-seed','Artist');submit('.sonic-query');await wait();reply(calls[3],{artists:[{id:'artist',name:'Artist'}],songs:[]});await wait();click(button('Add Artist'));
  click(button('Create mix'));await wait();assert.deepEqual(JSON.parse(calls[4].init.body),{mode:'blend',items:[{id:'artist',type:'artist',op:'ADD'}],limit:24});
  reply(calls[4],{error:'Analysis unavailable'},503);await wait();assert.match(node.querySelector('[role="alert"]').textContent,/Analysis unavailable/);assert.equal(played.length,1);
  click(button('Meaning'));change('textarea','finding home');submit('.sonic-query');await wait();assert.match(calls[5].url,/lyrics\/search/);reply(calls[5],{tracks:[]});await wait();assert.match(node.textContent,/No playable matches/);
  submit('.sonic-query');await wait();flushSync(()=>root.unmount());assert.ok(calls[6].init.signal.aborted);reply(calls[6],{tracks:[]});await wait();
 }finally{await vite.close();w.happyDOM.abort();}
});
