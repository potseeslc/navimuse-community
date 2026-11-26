// Frozen Build 14 reader from 0eba0e8; only the import path is adjusted.
import {defaultAppSettings} from '../../shared/appSettings.js';

export const ACCOUNT_PREFERENCES_VERSION='navimuse-preferences/v1';
const schema={
 streaming:{cellularFormat:['opus','mp3'],cellularBitrate:['96','128','192','256','320'],wifiFormat:['raw','mp3'],wifiBitrate:['0','320','256','192']},
 playback:{replayGain:['off','track','album'],transitionStyle:['smart','preserve','crossfade'],smartBlendSeconds:'seconds',continueThroughQueue:'boolean',extendJourneysAutomatically:'boolean',autoplayAfterQueue:[false],startFullScreen:'boolean'},
 discovery:{homeArtistRadios:'boolean',homeSonicMixes:'boolean',homeSmartPlaylists:'boolean',homeRadios:'boolean',homeAudioMuse:'boolean',smartPlaylistScope:['music','all']},
 library:{defaultView:['grid','cover','list'],artworkSize:['300','600','1000']},
};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function parseAccountPreferences(value) {
 if(!exact(value,Object.keys(schema)))throw new TypeError('Invalid account preferences');
 const result={};
 for(const [group,fields] of Object.entries(schema)) {
  if(!exact(value[group],Object.keys(fields)))throw new TypeError('Invalid account preferences');
  result[group]={};
  for(const [key,rule] of Object.entries(fields)) {
   const v=value[group][key];
   if(!(Array.isArray(rule)?rule.includes(v):rule==='boolean'?typeof v==='boolean':Number.isInteger(v)&&v>=1&&v<=12))throw new TypeError('Invalid account preferences');
   result[group][key]=v;
  }
 }
 return result;
}
export const defaultAccountPreferences=()=>parseAccountPreferences(defaultAppSettings);
export function parseAccountPreferenceChange(value) {
 if(!exact(value,['expectedAccountId','expectedRevision','preferences'])||typeof value.expectedAccountId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.expectedAccountId)||!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision<0||value.expectedRevision>=Number.MAX_SAFE_INTEGER)throw new TypeError('Invalid preference change');
 return {expectedAccountId:value.expectedAccountId,expectedRevision:value.expectedRevision,preferences:parseAccountPreferences(value.preferences)};
}
