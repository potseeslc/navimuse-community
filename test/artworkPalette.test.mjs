import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkPaletteFromPixels,FALLBACK_ARTWORK_PALETTE} from '../src/artworkPalette.js';
import {validateArtworkPalette,contrastRatio} from '../src/designSystem.js';
const sample=(r,g,b,a=255)=>new Uint8ClampedArray([r,g,b,a]);
test('missing, transparent, neutral and oversized artwork use the fixed fallback',()=>{
  for (const pixels of [null,[],sample(0,0,0),sample(255,255,255),sample(255,0,0,0),new Uint8ClampedArray(4097*4)]) assert.equal(artworkPaletteFromPixels(pixels),FALLBACK_ARTWORK_PALETTE);
});
test('artwork hue is deterministic while structural neutrals remain stable',()=>{
  const red=artworkPaletteFromPixels(sample(220,30,30)),blue=artworkPaletteFromPixels(sample(30,30,220));
  assert.notEqual(red.accent,blue.accent);
  assert.deepEqual(red,artworkPaletteFromPixels(sample(220,30,30)));
  for (const key of ['background','surface','surfaceRaised','foreground','mutedForeground']) assert.equal(red[key],FALLBACK_ARTWORK_PALETTE[key]);
  const a=new Uint8ClampedArray([220,30,30,255,30,30,220,255]);
  const b=new Uint8ClampedArray([30,30,220,255,220,30,30,255]);
  assert.deepEqual(artworkPaletteFromPixels(a),artworkPaletteFromPixels(b),'Equal populations use a deterministic tie break');
});
test('generated gamut preserves readable foreground and controls on all structural surfaces',()=>{
  for (let r=0;r<=255;r+=51) for(let g=0;g<=255;g+=51) for(let b=0;b<=255;b+=51) {
    const palette=artworkPaletteFromPixels(sample(r,g,b));assert.ok(validateArtworkPalette(palette));
    for (const surface of [palette.background,palette.surface,palette.surfaceRaised,palette.atmosphereA,palette.atmosphereB]) {
      assert.ok(contrastRatio(palette.foreground,surface)>=7);assert.ok(contrastRatio(palette.mutedForeground,surface)>=4.5);assert.ok(contrastRatio(palette.accent,surface)>=4.5);
    }
    assert.ok(contrastRatio(palette.accentForeground,palette.accent)>=4.5);
  }
});
test('a palette readable only on the background cannot pass validation',()=>{
  assert.equal(validateArtworkPalette({...FALLBACK_ARTWORK_PALETTE,surface:'#ffffff'}),null);
  assert.equal(validateArtworkPalette({...FALLBACK_ARTWORK_PALETTE,surfaceRaised:'#ffffff'}),null);
  assert.equal(validateArtworkPalette({...FALLBACK_ARTWORK_PALETTE,atmosphereA:'#ffffff'}),null);
});
