import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.packages.app',
  appName: 'SAP App',
  webDir: 'build',
  server: {
    // Remove url to use local assets
    cleartext: true
  }
};

export default config;
