// The app's settings are in app.json. This adds what cannot be kept in the public repository: the
// Firebase file Android needs for notifications, from Expo's environment (a file variable named
// GOOGLE_SERVICES_JSON), when it is there.

import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const firebase = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...config,
    name: config.name ?? 'Punch List',
    slug: config.slug ?? 'punch-list',
    android: { ...config.android, ...(firebase ? { googleServicesFile: firebase } : {}) },
  };
};
