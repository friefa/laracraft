import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the Angular browser bundle for Android and iOS.
 * Run `nx run laracraft:cap-sync` to build the web app and copy it
 * into the native projects.
 */
const config: CapacitorConfig = {
  appId: 'app.laracraft',
  appName: 'laracraft',
  webDir: '../../dist/apps/laracraft',
};

export default config;
