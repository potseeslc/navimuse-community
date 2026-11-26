import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('managed users see honest service status and personal ListenBrainz while only admins get server forms',async()=>{
 const w=new Window({url:'http://localhost/'});for(const k of ['window','document','Node','Element','HTMLElement'])globalThis[k]=k==='window'?w:w[k];Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});let root;
 try{
 const {SettingsSurface}=await vite.ssrLoadModule('/src/sonicSettingsSurfaces.jsx');const {defaultSettingsState}=await vite.ssrLoadModule('/src/appSettings.js');const el=document.createElement('div');document.body.append(el);root=createRoot(el);let manage=0;
 let settings={...structuredClone(defaultSettingsState),security:{canManageServices:false},services:{navidrome:{managed:true,configured:true},audiomuse:{managed:true,configured:true}}};let health={services:{navidrome:{ok:true},audiomuse:{ok:true}}};
 const render=()=>flushSync(()=>root.render(React.createElement(SettingsSurface,{settingsState:settings,settingsSession:{adminConfigured:true,authenticated:true,authMode:'oidc'},navidrome:{},health,onOpenListenBrainz:()=>manage++})));
 const button=name=>[...el.querySelectorAll('button')].find(b=>b.textContent.trim()===name);
 render();flushSync(()=>button('Connections & status').click());
 assert.match(el.textContent,/Connected · Managed by your administrator/);assert.match(el.textContent,/Music library/);assert.match(el.textContent,/Music discovery/);assert.equal(el.querySelectorAll('input').length,0);assert.doesNotMatch(el.textContent,/Docker|API Token|Navidrome Server|No token/);
 flushSync(()=>button('Manage ListenBrainz').click());assert.equal(manage,1);
 health={services:{navidrome:{ok:false}}};render();assert.match(el.textContent,/Temporarily unavailable/);assert.match(el.textContent,/Checking connection/);
 settings=structuredClone(defaultSettingsState);settings.security={canManageServices:true};render();assert.match(el.textContent,/Navidrome Server/);assert.ok(el.querySelector('input[type=password]'));assert.ok(button('Save'));
 }finally{if(root)flushSync(()=>root.unmount());await vite.close();w.happyDOM.abort();}
});
