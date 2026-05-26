import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.soteriaforge.lms',
  appName: 'Soteria Forge',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
