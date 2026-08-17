import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fisheepy.mira',
  appName: 'Mira',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  }
};

export default config;
