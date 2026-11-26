import test from 'node:test';
import assert from 'node:assert/strict';
import {createArtworkPaletteService} from '../src/artworkPaletteService.js';
import {artworkPaletteFromPixels,FALLBACK_ARTWORK_PALETTE} from '../src/artworkPalette.js';
const red=artworkPaletteFromPixels(new Uint8ClampedArray([220,30,30,255]));
test('new artwork cancels old work and late results cannot enter the cache',async()=>{
  const pending=[];const service=createArtworkPaletteService((url,signal)=>new Promise(resolve=>pending.push({url,signal,resolve})));
  const old=service.load('account','old');await Promise.resolve();
  const latest=service.load('account','new');await Promise.resolve();
  assert.equal(pending[0].signal.aborted,true);pending[0].resolve(red);pending[1].resolve(red);
  assert.equal(await old,FALLBACK_ARTWORK_PALETTE);assert.equal(await latest,red);
  const retry=service.load('account','old');await Promise.resolve();assert.equal(pending.length,3);pending[2].resolve(red);await retry;service.clear();
});
test('palette cache is bounded, reuses artwork, and clears across account boundaries',async()=>{
  let count=0;const service=createArtworkPaletteService(async()=>{count++;return red;});
  await service.load('a','cover');await service.load('a','cover');assert.equal(count,1);
  for(let i=0;i<16;i++)await service.load('a',String(i));
  await service.load('a','cover');assert.equal(count,18,'Oldest entry was evicted');
  await service.load('b','cover');assert.equal(count,19);
  await service.load(null,'cover');await service.load('b','cover');assert.equal(count,20,'Lock clears cached private artwork');service.clear();
});
test('failures fall back without caching and identical pending requests share preparation',async()=>{
  let resolve,count=0;const service=createArtworkPaletteService(()=>{count++;return new Promise(done=>{resolve=done;});});
  const first=service.load('a','cover'),second=service.load('a','cover');assert.equal(first,second);await Promise.resolve();resolve(null);
  assert.equal(await first,FALLBACK_ARTWORK_PALETTE);
  const retry=service.load('a','cover');await Promise.resolve();assert.equal(count,2);resolve(red);assert.equal(await retry,red);service.clear();
});
