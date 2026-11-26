import {useEffect,useRef,useState} from 'react';
import {appendUniqueAlbums,checkedAlbumPage} from './albumPage.js';
import {navidromeLibraryAlbums} from './services/navidromeService.js';
export function usePagedShelf(seed,sort,libraryKey){
 const [extra,setExtra]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[more,setMore]=useState(true);
 const cursor=useRef(0),pending=useRef(null),generation=useRef(0);
 useEffect(()=>{generation.current++;pending.current?.abort();pending.current=null;setExtra([]);setLoading(false);setError('');cursor.current=seed?.length||0;setMore((seed?.length||0)>=18);},[seed,sort,libraryKey]);
 const load=async()=>{
  if(pending.current||!more)return;const controller=new AbortController();pending.current=controller;const current=generation.current;setLoading(true);setError('');
  try{const offset=cursor.current;const payload=checkedAlbumPage(await navidromeLibraryAlbums({sort,musicFolderId:libraryKey,offset:String(offset),limit:'18'},{signal:controller.signal}),offset);if(current!==generation.current)return;
   setExtra(old=>appendUniqueAlbums(old,payload.albums));setMore(payload.page?.nextOffset!=null&&payload.page.nextOffset>cursor.current);cursor.current=payload.page?.nextOffset;
  }catch(e){if(current===generation.current&&e.name!=='AbortError')setError('Could not load more albums. Retry');}
  finally{if(current===generation.current){pending.current=null;setLoading(false);}}
 };
 useEffect(()=>()=>{generation.current++;pending.current?.abort();},[]);
 return {albums:appendUniqueAlbums(seed||[],extra),loading,error,more,load};
}
