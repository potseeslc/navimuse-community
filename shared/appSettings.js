import { defaultContinuationPreferences, defaultTransitionPreferences } from './playbackPreferences.js';

export const defaultAppSettings = {
  appearance: {theme:'dark',accent:'orange'},
  streaming: {
    cellularFormat: 'opus',
    cellularBitrate: '128',
    wifiFormat: 'raw',
    wifiBitrate: '0'
  },
  playback: {
    replayGain: 'album',
    ...defaultContinuationPreferences,
    ...defaultTransitionPreferences,
    startFullScreen: true
  },
  discovery: {
    homeArtistRadios: true,
    homeSonicMixes: true,
    homeSmartPlaylists: true,
    homeRadios: true,
    homeAudioMuse: true,
    smartPlaylistScope: 'music'
  },
  library: {
    selectedFolders: null,
    defaultView: 'grid',
    artworkSize: '600'
  }
};
