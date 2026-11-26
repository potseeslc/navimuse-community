// Provider exceptions can contain URLs, credentials, response bodies or user
// content. Ordinary logs retain only a bounded status, never exception text.
export function requestFailureLog(error,requestUrl){
 const status=Number.isInteger(error?.status)&&error.status>=500&&error.status<=599?error.status:500;
 let operation='';
 try{
  const pathname=new URL(requestUrl,'http://local.invalid').pathname;
  operation=({'/api/navidrome/library/albums':'album-page','/api/navidrome/bootstrap':'library-bootstrap','/api/navidrome/radio-feedback':'station-feedback'})[pathname]||'';
 }catch{}
 return `NaviMuse request failed (HTTP ${status})${operation?' ['+operation+']':''}.`;
}
