import { M8_STRUCTURAL_COLORS, validateArtworkPalette } from './designSystem.js';

export const ARTWORK_PALETTE_VERSION = 1;
export const FALLBACK_ARTWORK_PALETTE = M8_STRUCTURAL_COLORS;

// Pure bounded RGBA sampler, suitable for the artwork preparation worker. No
// image URL, identity, cache, DOM or network access belongs in this function.
export function artworkPaletteFromPixels(pixels) {
  if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) ||
      pixels.length===0 || pixels.length%4 || pixels.length>4096*4) return FALLBACK_ARTWORK_PALETTE;
  const buckets=new Map();
  for (let i=0;i<pixels.length;i+=4) {
    const [r,g,b,a]=pixels.subarray(i,i+4),high=Math.max(r,g,b),low=Math.min(r,g,b);
    if (a<128 || high-low<20 || high<32 || low>224) continue;
    const key=(r>>5)*64+(g>>5)*8+(b>>5);
    const bucket=buckets.get(key)||{key,count:0,r:0,g:0,b:0};
    bucket.count++;bucket.r+=r;bucket.g+=g;bucket.b+=b;buckets.set(key,bucket);
  }
  const dominant=[...buckets.values()].sort((a,b)=>b.count-a.count || a.key-b.key)[0];
  if (!dominant) return FALLBACK_ARTWORK_PALETTE;
  const r=dominant.r/dominant.count/255,g=dominant.g/dominant.count/255,b=dominant.b/dominant.count/255;
  const high=Math.max(r,g,b),low=Math.min(r,g,b),delta=high-low;
  const hue=((high===r?(g-b)/delta:high===g?(b-r)/delta+2:(r-g)/delta+4)*60+360)%360;
  for (const lightness of [0.64,0.70,0.76,0.82]) {
    const palette=Object.freeze({...M8_STRUCTURAL_COLORS,accent:hsl(hue,0.65,lightness),
      atmosphereA:hsl(hue,0.40,0.13),atmosphereB:hsl((hue+35)%360,0.30,0.12)});
    if (validateArtworkPalette(palette)) return palette;
  }
  return FALLBACK_ARTWORK_PALETTE;
}
function hsl(hue,saturation,lightness) {
  const a=saturation*Math.min(lightness,1-lightness);
  const channel=n=>{const k=(n+hue/30)%12;return lightness-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return '#'+[0,8,4].map(n=>Math.round(channel(n)*255).toString(16).padStart(2,'0')).join('');
}
