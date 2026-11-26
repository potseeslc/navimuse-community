// Individual keys avoid one tab overwriting another tab's pending plays.
const prefix=scope=>'navimuse:listening:'+encodeURIComponent(scope)+':';
export function browserListeningTransport(scope,storage=window.localStorage) {
 const key=id=>prefix(scope)+id;
 return {
  enqueue(event){if(event.scope!==scope)throw Error('Listening account changed');storage.setItem(key(event.id),JSON.stringify(event));},
  async request(message){
   if(message.scope!==scope)throw Error('Listening account changed');
   if(message.action==='listening.configure')return;
   if(message.action==='listening.ack'){storage.removeItem(key(message.id));return;}
   if(message.action==='listening.pending'){
    const records=[];
    for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(prefix(scope))){try{const value=JSON.parse(storage.getItem(k));if(value.scope===scope)records.push(value);}catch{/* Ignore corrupt entries without removing other history. */}}}
    return records.sort((a,b)=>a.time-b.time).slice(0,100);
   }
  }
 };
}
export function enqueueBrowserListen(scope,event,songId){
 browserListeningTransport(scope).enqueue({...event,songId,scope});
 window.dispatchEvent(new CustomEvent('navimuse-native-audio',{detail:{type:'listeningReady'}}));
}
