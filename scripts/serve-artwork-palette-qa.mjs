import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
const root=new URL('..',import.meta.url).pathname;
const server=await createServer({root,server:{host:'127.0.0.1',port:5208,strictPort:true,hmr:false},plugins:[{name:'synthetic-artwork',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const match=/^\/api\/navidrome\/cover\/qa-(red|blue|missing|slow)\?/.exec(req.url||'');if(!match)return next();
 if(match[1]==='missing'){res.writeHead(404);res.end();return;}
 if(match[1]==='slow')await new Promise(resolve=>setTimeout(resolve,1500));
 const file=match[1]==='blue'?'blue':'red';res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(await readFile(new URL(`../docs/evidence/m8/artwork-palette/${file}.png`,import.meta.url)));
 });}}]});await server.listen();console.log('Palette QA: http://127.0.0.1:5208/docs/evidence/m8/artwork-palette/fixture.html');
