import { defaultAppSettings } from './appSettings.js';
export const hasMobileNetwork = () => globalThis.window?.__nmAudioTransport?.network === true;
export function deviceStreamFormats() {
  return ['raw','mp3',...(globalThis.window?.__nmAudioTransport?.audioFormats?.includes('opus') ? ['opus'] : [])];
}
export function deviceStreamFormatOptions() {return deviceStreamFormats().map(format=>[format,{raw:'Original',mp3:'MP3',opus:'Opus'}[format]]);}
const key = 'navimuse-device-streaming-v1';
export function deviceStreaming(fallback = defaultAppSettings.streaming) {
  if (!hasMobileNetwork()) return fallback;
  try { return normalizeDeviceStreaming(JSON.parse(window.localStorage.getItem(key)) || fallback); } catch { return normalizeDeviceStreaming(fallback); }
}
export function normalizeDeviceStreaming(value = {}) {
  const pick=(name,values,fallback)=>values.includes(String(value[name]))?String(value[name]):fallback;
  return {cellularFormat:pick('cellularFormat',deviceStreamFormats(),'mp3'),cellularBitrate:pick('cellularBitrate',['96','128','192','256','320'],'128'),wifiFormat:pick('wifiFormat',deviceStreamFormats(),'raw'),wifiBitrate:pick('wifiBitrate',['0','192','256','320'],'0')};
}
export function saveDeviceStreaming(value) { const normalized=normalizeDeviceStreaming(value); window.localStorage.setItem(key,JSON.stringify(normalized)); return normalized; }
export function mobileNetworkType() { return hasMobileNetwork() ? window.__nmAudioTransport.networkType : null; }
export function chooseStreamPreference(streaming = defaultAppSettings.streaming) {
  const type=mobileNetworkType();
  const value=hasMobileNetwork()?deviceStreaming(streaming):streaming;
  // Unknown connectivity uses the cellular preference until native detection completes.
  if(hasMobileNetwork() && !['wifi','wired'].includes(type)) return value.cellularFormat==='raw'?{format:'raw',maxBitRate:'0'}:{format:value.cellularFormat,maxBitRate:value.cellularBitrate};
  return value.wifiFormat==='raw'?{format:'raw',maxBitRate:'0'}:{format:value.wifiFormat||'mp3',maxBitRate:value.wifiBitrate||'320'};
}
