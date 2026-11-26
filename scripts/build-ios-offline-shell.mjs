import {build} from 'esbuild';
import {writeFileSync,mkdirSync} from 'node:fs';
// Embed the same application/player in the iOS binary. No cached web response or
// server login is needed to open it; native offline.status supplies the grant.
const result=await build({entryPoints:['src/main.jsx'],bundle:true,minify:true,format:'iife',write:false,outfile:'offline.js',
  define:{'process.env.NODE_ENV':'"production"','import.meta':'{"env":{"PROD":false}}'},
  loader:{'.svg':'dataurl','.png':'dataurl','.jpg':'dataurl','.woff2':'dataurl'}});
const js=result.outputFiles.find(file=>file.path.endsWith('.js')).text;
const css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'';
const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'";
mkdirSync('.scratch',{recursive:true});
writeFileSync('.scratch/ios-offline-shell.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>NaviMuse Downloads</title><style>${css.replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`);
// Online startup uses the same version-matched app, with first-party network
// access. The downloaded-music shell retains its stricter offline CSP.
// regl compiles trusted, bundled draw commands with Function. This applies only
// to the online shell; offline playback retains its no-eval, no-network policy.
const onlineCsp="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src https://navimuse.example.com data: blob:; font-src data:; connect-src https://navimuse.example.com; media-src https://navimuse.example.com blob:; worker-src blob:; base-uri 'none'; form-action https://navimuse.example.com";
writeFileSync('.scratch/ios-online-shell.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="${onlineCsp}"><title>NaviMuse</title><style>${css.replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`);
console.log('Bundled online and offline iOS screens generated from the shared React player.');
