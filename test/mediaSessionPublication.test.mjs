import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import React from 'react';
import { useMediaSessionPublication } from '../src/useMediaSessionPublication.js';

test('position and pause updates preserve artwork publication; track/art changes and sign-out update metadata', async () => {
  const window=new Window({url:'https://fixture.invalid/'});
  for(const key of ['window','document','Node','Element','HTMLElement']) globalThis[key]=key==='window'?window:window[key];
  const metadata=[],positions=[];
  const media={set metadata(value){metadata.push(value);},setPositionState:value=>positions.push(value)};
  Object.defineProperty(globalThis,'navigator',{value:{mediaSession:media,userAgent:window.navigator.userAgent},configurable:true});
  globalThis.MediaMetadata=class {constructor(value){Object.assign(this,value);}};
  const {createRoot}=await import('react-dom/client'); const {flushSync}=await import('react-dom');
  const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  function Harness({track,playing,position}){useMediaSessionPublication(track,playing,{currentTime:position,duration:200});return null;}
  const render=(track,playing,position)=>flushSync(()=>root.render(React.createElement(Harness,{track,playing,position})));
  const track={id:'one',title:'First',artist:'Artist',album:'Album',artwork:'/api/navidrome/cover/album?size=600&artwork=v2',duration:200};
  try {
    render(track,true,0);assert.equal(metadata.length,1);assert.equal(metadata[0].artwork[0].src,track.artwork);
    for(let i=1;i<=30;i++) render({...track},true,i);
    render({...track},false,30);render({...track},true,30);
    assert.equal(metadata.length,1);assert.equal(positions.at(-1).position,30);assert.equal(media.playbackState,'playing');
    render({...track,id:'two',title:'Second'},true,0);assert.equal(metadata.length,2);assert.equal(metadata[1].title,'Second');
    render({...track,id:'two',title:'Second',artwork:'/new-cover.jpg'},true,1);assert.equal(metadata.length,3);assert.equal(metadata[2].artwork[0].src,'/new-cover.jpg');
    const station={id:'radio:1',title:'Station',artist:'Internet Radio',artwork:'/api/navidrome/radios/1/artwork?v=one',radioTitle:'First broadcast'};
    render(station,true,0);assert.equal(metadata.at(-1).title,'First broadcast');assert.equal(metadata.at(-1).artist,'Station');
    const radioCount=metadata.length;
    render({...station},true,10);assert.equal(metadata.length,radioCount,'time updates do not recreate metadata');
    render({...station,radioTitle:'Next broadcast'},true,11);assert.equal(metadata.length,radioCount+1);assert.equal(metadata.at(-1).title,'Next broadcast');
    render(null,false,0);assert.equal(metadata.at(-1),null);assert.equal(media.playbackState,'none');
  } finally {flushSync(()=>root.unmount());await window.happyDOM.close();delete globalThis.MediaMetadata;}
});
