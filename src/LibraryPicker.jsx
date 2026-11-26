import React from 'react';
export function LibraryPicker({folders=[],value='',onChange,disabled=false}) {
 if(!Array.isArray(folders)||!folders.length)return null;
 const ids=folders.map(f=>String(f.id)),selected=value?value.split(','):ids;
 const names=folders.filter(f=>selected.includes(String(f.id))).map(f=>f.name);
 return <details className="library-multi-picker"><summary aria-label="Choose music libraries">{names.length===1?names[0]:`${names.length} libraries`}</summary><fieldset disabled={disabled}><legend>Show libraries</legend>{folders.map(folder=>{const id=String(folder.id),checked=selected.includes(id);return <label key={id}><input type="checkbox" checked={checked} disabled={checked&&selected.length===1} onChange={()=>onChange((checked?selected.filter(v=>v!==id):[...selected,id]).sort().join(','))}/><span>{folder.name}</span></label>;})}</fieldset></details>;
}
