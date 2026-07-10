import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.upview.remindeme',
  appName: 'Remindeme',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
