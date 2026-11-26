import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
test('an old health failure never contradicts active playback',async()=>{
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 try{
  const {PlaybackServiceWarning}=await vite.ssrLoadModule('/src/playerChrome.jsx');
  const render=props=>renderToStaticMarkup(React.createElement(PlaybackServiceWarning,props));
  const health={services:{navidrome:{ok:false}}};
  assert.equal(render({health,isPlaying:true}),'');
  assert.match(render({health,isPlaying:false}),/last Navidrome connection check failed/);
  assert.doesNotMatch(render({health,isPlaying:false}),/Navidrome is unavailable/);
  assert.equal(render({health:{services:{navidrome:{ok:true}}},isPlaying:false}),'');
  assert.equal(render({health:null,isPlaying:false}),'');
 }finally{await vite.close();}
});
