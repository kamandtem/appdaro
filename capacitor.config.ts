import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.darooto.app',
  appName: 'داروتو',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
