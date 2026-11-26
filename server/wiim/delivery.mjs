// Only observed receiver fields and the media response MIME type belong here.
// Library tags and requested transcoding settings are not delivery evidence.
export function mediaCodec(contentType = '') {
  return ({'audio/flac':'FLAC','audio/x-flac':'FLAC','audio/mpeg':'MP3',
    'audio/mp3':'MP3','audio/aac':'AAC','audio/aacp':'HE-AAC'})[
    String(contentType).split(';')[0].trim().toLowerCase()] || null;
}

export function receiverDetails(metadata, artwork) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const fields = Object.fromEntries(Object.entries(metadata).map(([key,value])=>[key.trim(),value]));
  // The unique artwork grant identifies this queue occurrence. Firmware can
  // briefly retain the previous track's format after its transport URI changes.
  if (!artwork || fields.albumArtURI !== artwork) return null;
  const result = {};
  for (const [field,key,max,scale] of [['sampleRate','sampleRate',768000,1],
    ['bitDepth','bitDepth',64,1],['bitRate','estimatedBitRate',100000,1000]]) {
    if (!['string','number'].includes(typeof fields[field])) continue;
    const value = Number(fields[field]);
    if (Number.isFinite(value) && value > 0 && value <= max) result[key] = value * scale;
  }
  return Object.keys(result).length ? result : null;
}

export function receiverVolume(status) {
 const raw=status?.vol;
 if(!['string','number'].includes(typeof raw)||String(raw).trim()==='')return null;
 const value=Number(raw);
 return Number.isInteger(value)&&value>=0&&value<=100?value:null;
}
