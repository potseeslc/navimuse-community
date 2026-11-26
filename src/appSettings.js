import {defaultAppSettings} from '../shared/appSettings.js';
export {defaultAppSettings} from '../shared/appSettings.js';

export const defaultSettingsState = {
  preferences: defaultAppSettings,
  services: {
    navidrome: {
      configured: false,
      source: 'environment',
      url: '',
      username: '',
      usernameSet: false,
      passwordSet: false,
      urlAllowed: true,
      activeUrl: ''
    },
    audiomuse: {
      configured: false,
      source: 'environment',
      url: '',
      tokenSet: false,
      urlAllowed: true,
      activeUrl: ''
    }
  },
  security: { adminConfigured: false }
};
