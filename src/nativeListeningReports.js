// One uploader per mounted account; records stay native until acknowledged.
export function createNativeListeningReporter({transport,scope,fetchFn,onError=()=>{}}) {
 let stopped=false,busy=false;
 async function flush(){
  if(stopped||busy)return;busy=true;
  try {
   await transport.request({action:'listening.configure',scope});
   const records=await transport.request({action:'listening.pending',scope});
   for(const record of records){
    if(stopped)return;
    if(record.scope!==scope)throw Error('Listening account changed');
    const response=await fetchFn('/api/navidrome/listening',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'NaviMuse'},body:JSON.stringify(record)});
    if(!response.ok)throw Error(`Listening sync failed (${response.status})`);
    const result=await response.json();if(!result.ok||result.id!==record.id)throw Error('Invalid listening receipt');
    if(stopped)return;
    await transport.request({action:'listening.ack',scope,id:record.id});
   }
  }catch(error){if(!stopped)onError(error);}finally{busy=false;}
 }
 return {flush,stop(){stopped=true;}};
}
