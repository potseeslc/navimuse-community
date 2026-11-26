// Cancellation is a normal share-sheet dismissal, not a player status.
export async function shareTrackDetails({data,share,copy,isCurrent=()=>true}) {
 let shareFailed=false;
 if(share){
  try{await share(data);return isCurrent()?'Shared from NaviMuse.':null;}
  catch(error){if(error?.name==='AbortError'||!isCurrent())return null;shareFailed=true;}
 }
 // Clipboard is best-effort after native share consumes user activation.
 if(!isCurrent())return null;
 try{
  if(!await copy(`${data.text}\n${data.url}`))throw Error('Clipboard unavailable');
  return isCurrent()?'Track copied to clipboard.':null;
 }catch{
  if(!isCurrent())return null;
  return `${shareFailed?'Share failed. ':''}Copy this track: ${data.text}`;
 }
}
