import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('Settings distinguishes unsaved, saving, failed and saved preferences without losing drafts', async () => {
  const w = new Window({url:'http://localhost/'});
  for (const key of ['window','document','Node','Element','HTMLElement']) globalThis[key] = key === 'window' ? w : w[key];
  Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
  const React = await import('react');
  const {createRoot} = await import('react-dom/client');
  const {flushSync} = await import('react-dom');
  const vite = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  let root;
  const requests=[];
  const wait=()=>new Promise(resolve=>setTimeout(resolve,30));
  try {
    const {SettingsSurface} = await vite.ssrLoadModule('/src/sonicSettingsSurfaces.jsx');
    const {defaultSettingsState} = await vite.ssrLoadModule('/src/appSettings.js');
    const container=document.createElement('div');document.body.append(container);root=createRoot(container);
    let settings=structuredClone(defaultSettingsState);
    let clearedMessages=0;
    const render=()=>flushSync(()=>root.render(React.createElement(SettingsSurface,{
      onClearSettingsMessage:()=>{clearedMessages++;},
      settingsState:settings,settingsSession:{adminConfigured:true,authenticated:true},navidrome:{},
      onSavePreferences:(draft)=>new Promise((resolve,reject)=>requests.push({draft,resolve,reject})),
    })));
    const button=label=>[...container.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
    const checkbox=()=>[...container.querySelectorAll('label')].find(node=>node.textContent.includes('Continue through queue')).querySelector('input');
    const click=node=>flushSync(()=>node.click());
    render();await wait();
    assert.equal(button('Save'),undefined,'Unchanged preferences do not show the floating actions');
    const initial=checkbox().checked;
    click(checkbox());await wait();
    assert.match(container.textContent,/Unsaved changes/);
    assert.equal(container.querySelectorAll('.settings-save-dock').length,1,'One shared draft action group appears');
    assert.equal(clearedMessages,1,'Editing clears the previous server message');
    settings={...settings,preferences:{...settings.preferences,library:{...settings.preferences.library,artworkSize:'1000'}}};
    render();await wait();
    assert.equal(checkbox().checked,!initial,'An unrelated refresh must preserve unsaved edits');
    click(button('Save'));await wait();
    assert.equal(requests.length,1);
    assert.equal(requests[0].draft.library.artworkSize,'1000','Unedited fields adopt refreshed saved values');
    assert.equal(checkbox().matches(':disabled'),true,'Preference edits are protected during the request');
    assert.ok(button('Saving…').disabled);
    const libraryNav=[...container.querySelectorAll('.settings-section-nav button')].find(node=>node.textContent==='Library');
    assert.equal(libraryNav.disabled,true,'Cannot switch to editable fields during the pending save');
    settings={...settings,preferences:{...settings.preferences,streaming:{...settings.preferences.streaming,wifiBitrate:'320'}}};
    render();await wait();
    assert.equal(checkbox().checked,!initial,'An in-flight refresh cannot replace the submitted draft');
    requests[0].resolve(false);await wait();
    assert.equal(checkbox().checked,!initial,'Failed save retains the unsaved draft');
    assert.match(container.querySelector('.settings-save-dock [role=alert]').textContent,/not saved/i,'Save failure stays beside the retry action');
    click(button('Discard changes'));await wait();
    assert.equal(checkbox().checked,initial,'Discard restores the actual saved preference');
    assert.equal(document.activeElement.textContent,'Playback','Discard restores focus when its button becomes disabled');
    assert.equal(clearedMessages,3,'Save and discard clear stale messages too');
    click(checkbox());click(button('Save'));await wait();
    assert.equal(requests[1].draft.streaming.wifiBitrate,'320','A failed save adopts refreshed untouched fields before retry');
    settings={...settings,preferences:{...requests[1].draft,playback:{...requests[1].draft.playback,smartBlendSeconds:6}}};render();requests[1].resolve(settings.preferences);await wait();
    assert.equal([...container.querySelectorAll('label')].find(node=>node.textContent.includes('Blend window')).querySelector('select').value,'6','Successful saves adopt canonical values from the server');
    assert.equal(checkbox().checked,!initial);
    assert.equal(button('Save'),undefined,'Successful save removes the floating actions');
    assert.match(container.textContent,/No unsaved changes/);
    click(checkbox());click(button('Save'));await wait();
    requests[2].reject(new Error('Network disconnected'));await wait();
    assert.match(container.textContent,/Network disconnected/);
    assert.equal(checkbox().matches(':disabled'),false);
    assert.equal(button('Save').disabled,false,'A rejected save can be retried');
  } finally {root?.unmount();await vite.close();w.happyDOM.abort();}
});

test('native streaming settings expose supported formats and disable bitrate for Original',async()=>{
 const w=new Window({url:'http://localhost/'});for(const key of ['window','document','Node','Element','HTMLElement'])globalThis[key]=key==='window'?w:w[key];
 Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 w.__nmAudioTransport={network:true,audioFormats:['raw','mp3','opus'],networkType:'wifi'};
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});let root;
 try{
  const {SettingsSurface}=await vite.ssrLoadModule('/src/sonicSettingsSurfaces.jsx');const {defaultSettingsState}=await vite.ssrLoadModule('/src/appSettings.js');
  const {saveDeviceStreaming}=await vite.ssrLoadModule('/src/mobileStreaming.js');const node=document.createElement('div');document.body.append(node);root=createRoot(node);
  let saved;flushSync(()=>root.render(React.createElement(SettingsSurface,{settingsState:structuredClone(defaultSettingsState),settingsSession:{adminConfigured:true,authenticated:true},navidrome:{},onSavePreferences:async draft=>{saved=saveDeviceStreaming(draft.streaming);return {...draft,streaming:saved};}})));
  const field=label=>[...node.querySelectorAll('label')].find(e=>e.textContent.startsWith(label)).querySelector('select');
  assert.deepEqual([...field('Cellular Format').options].map(o=>o.value),['raw','mp3','opus']);
  assert.equal(field('Wi-Fi Bitrate').disabled,true);
  const select=(name,value)=>flushSync(()=>{const input=field(name);input.value=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));});
  select('Wi-Fi Format','opus');assert.equal(field('Wi-Fi Bitrate').disabled,false);select('Wi-Fi Bitrate','256');
  select('Cellular Format','raw');assert.equal(field('Cellular Bitrate').disabled,true);
  flushSync(()=>[...node.querySelectorAll('button')].find(e=>e.textContent.trim()==='Save').click());await new Promise(r=>setTimeout(r,30));
  assert.equal(saved.cellularFormat,'raw');assert.equal(saved.wifiFormat,'opus');assert.equal(saved.wifiBitrate,'256');assert.match(node.textContent,/more cellular data/);
 }finally{root?.unmount();await vite.close();w.happyDOM.abort();}
});
