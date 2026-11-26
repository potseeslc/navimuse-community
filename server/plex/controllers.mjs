import {createHash,randomUUID} from 'node:crypto';
import {xmlEscape} from '../wiim/device.mjs';

// Account proof is required even for LAN clients. Persist only scoped hashes,
// never Plex tokens. Explicit browser pairing handles tokenless Companion apps.
export function createControllerAccess({source,store,now=Date.now,audit=()=>{},pollInterval=5000}){
 const grants=new Map(Object.entries(store?.value||{})),pending=new Map(),flows=new Map();
 let closed=false;
 const lifetime=30*24*3600000;
 const key=(ip,controller,receiver)=>createHash('sha256').update(`${ip}:${controller}:${source.principalFor(receiver).scope}`).digest('hex');
 const allowed=(ip,controller,receiver)=>(grants.get(key(ip,controller,receiver))||0)>now();
 let grantTail=Promise.resolve();
 function grant(ip,controller,receivers){
  const task=grantTail.then(async()=>{
  const next=new Map([...grants].filter(([,expires])=>expires>now()));
  for(const r of receivers)next.set(key(ip,controller,r),now()+lifetime);
  while(next.size>256)next.delete(next.keys().next().value);
  await store?.save(Object.fromEntries(next));grants.clear();for(const entry of next)grants.set(...entry);
  });grantTail=task.catch(()=>{});return task;
 }
 const prune=()=>{for(const [id,p] of pending)if(p.expires<=now())pending.delete(id);for(const [id,p] of flows)if(p.expires<=now())flows.delete(id);};
 function observe(ip,controller,receiver){
  prune();const id=key(ip,controller,receiver);
  if(!pending.has(id)){if(pending.size>=256)pending.delete(pending.keys().next().value);pending.set(id,{ip,controller,receiver,expires:now()+300000});}
 }
 async function check(flow){
  if(closed||!flow.link||flow.status||flow.expires<=now()||flow.busy||flow.checkedAt&&now()-flow.checkedAt<3000)return;
  flow.checkedAt=now();
  flow.busy=(async()=>{
   try{
    const account=await source.finishControllerLink(flow.link);
    if(closed||flow.expires<=now()||!account)return;
    if(account!==flow.receiver.accountId){flow.status='denied';audit({event:'controller-pairing',result:'wrong-account'});return;}
    const targets=[...new Map([...source.advertisedReceivers(),flow.receiver].filter(r=>r.accountId===account).map(r=>[r.id,r])).values()];
    await grant(flow.ip,flow.controller,targets);
    flow.status='connected';audit({event:'controller-pairing',result:'connected'});
   }catch{audit({event:'controller-pairing',result:'verification-unavailable'});}
  })();
  try{await flow.busy;}finally{flow.busy=null;}
 }
 async function checkApprovals(){prune();await Promise.all([...flows.values()].map(check));}
 const timer=setInterval(()=>{void checkApprovals().catch(()=>{});},pollInterval);timer.unref();
 async function handle(req,res,url){
  if(url.pathname!=='/pair')return false;
  const ip=req.socket.remoteAddress;prune();
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  const html=(status,body)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>NaviMuse speaker pairing</title><style>body{font:18px system-ui;background:#101417;color:#eee;max-width:38rem;margin:3rem auto;padding:1rem}button,a{font:inherit;color:#88ceaa}button{background:#202a2e;padding:1rem;border-radius:12px;border:1px solid #88ceaa}form{margin:1rem 0}</style><h1>Connect Plexamp controls</h1>${body}</html>`);};
  if(req.method==='POST'){
   if(req.headers.origin!==source.config.advertisedUrl){html(403,'<p>Open this page using the configured NaviMuse speaker address.</p>');return true;}
   const id=url.searchParams.get('controller'),candidate=pending.get(id);
   if(!candidate||candidate.ip!==ip){html(409,'<p>Select a NaviMuse speaker in Plexamp on this device, then refresh this page.</p>');return true;}
   if(flows.size>=8||[...flows.values()].some(f=>f.ip===ip&&!f.status)){html(429,'<p>A pairing is already in progress. Return to its page or wait five minutes.</p>');return true;}
   // Reserve before awaiting Plex so concurrent requests cannot mint many PINs.
   const flowId=randomUUID(),flow={...candidate,expires:now()+300000};flows.set(flowId,flow);
   try{flow.link=await source.beginControllerLink();}catch{flows.delete(flowId);html(503,'<p>Plex account linking is unavailable. Try again shortly.</p>');return true;}
   audit({event:'controller-pairing',result:'started'});
   res.writeHead(303,{Location:`/pair?flow=${flowId}`});res.end();return true;
  }
  if(req.method!=='GET'){html(405,'<p>Method unavailable.</p>');return true;}
  const flowId=url.searchParams.get('flow');
  if(flowId){
   const flow=flows.get(flowId);
   if(!flow||flow.ip!==ip||!flow.link){html(410,'<p>Pairing expired. Select the speaker again and return to this page.</p>');return true;}
   await check(flow);
   if(flow.status==='connected'){html(200,'<p>Connected. Return to Plexamp and select the speaker. Its current queue will remain in place.</p>');return true;}
   if(flow.status==='denied'){html(403,'<p>Sign in with the Plex account linked to these speakers.</p>');return true;}
   html(200,`<meta http-equiv="refresh" content="5"><p>Open <a href="https://plex.tv/link" target="_blank" rel="noreferrer">plex.tv/link</a> and enter <strong>${xmlEscape(flow.link.code)}</strong> using the speaker owner's Plex account.</p><p>After approval, return directly to Plexamp and reselect the speaker. NaviMuse checks automatically; this page will also update. Pairing does not start or change music.</p>`);return true;
  }
  const candidates=[...pending].filter(([,p])=>p.ip===ip&&!allowed(p.ip,p.controller,p.receiver));
  html(200,candidates.length?'<p>Approve this Plexamp controller to see and control your speakers for 30 days on this network address.</p>'+candidates.map(([id,p])=>`<form method="post" action="/pair?controller=${id}"><button>Connect to ${xmlEscape(p.receiver.name)}</button></form>`).join(''):'<p>First select a NaviMuse speaker in Plexamp on this device, then refresh this page. Use the same Wi-Fi connection in both apps.</p>');return true;
 }
 return {allowed,grant,observe,handle,checkApprovals,close:async()=>{closed=true;clearInterval(timer);await Promise.allSettled([...flows.values()].map(f=>f.busy).filter(Boolean));await grantTail;}};
}
