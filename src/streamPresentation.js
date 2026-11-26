function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function sourceSignalSummary(song = {}) {
  if (song.streamUrl) return 'Live source';

  const details = [];
  const bitDepth = positiveNumber(song.bitDepth);
  const sampleRate = positiveNumber(song.samplingRate ?? song.sampleRate);
  const channels = positiveNumber(song.channelCount ?? song.channels);
  const bitRate = positiveNumber(song.bitRate);

  if (bitDepth) details.push(`${bitDepth}-bit`);
  if (sampleRate) details.push(`${Number((sampleRate / 1000).toFixed(1))} kHz`);
  if (channels) details.push(`${channels} ch`);
  if (bitRate) details.push(`${bitRate} kbps source`);

  return details.join(' · ') || 'Source details unavailable';
}

export function requestedStreamSummary(preference = {}, live = false) {
  if (live) return 'Live request';
  if (!preference.format || preference.format === 'raw') return 'Original requested';

  const format = String(preference.format).toUpperCase();
  const bitRate = positiveNumber(preference.maxBitRate);
  return bitRate ? `${format} ≤ ${bitRate} kbps requested` : `${format} requested`;
}

export function receivedStreamSummary(details) {
  const codec=details?.codec;
  const known=['MP3','AAC','HE-AAC','HE-AAC v2','ALAC','FLAC','Opus','PCM'].includes(codec);
  const parts=known?[codec]:[];
  if (['MP3','AAC','HE-AAC','HE-AAC v2','Opus'].includes(codec)) {
    const bitrate=positiveNumber(details.estimatedBitRate);
    if(bitrate)parts.push(`${Math.round(bitrate/1000)} kbps`);
  } else {
    const rate=positiveNumber(details?.sampleRate),depth=positiveNumber(details?.bitDepth);
    if(rate)parts.push(`${Number((rate/1000).toFixed(1))} kHz`);
    if(depth)parts.push(`${depth}-bit`);
  }
  if(details?.source==='cached')parts.unshift('Playing cached audio');
  return parts.join(' · ') || 'Audio details unavailable';
}
