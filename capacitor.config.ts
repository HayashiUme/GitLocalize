import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.hayashiume.gitlocalize',
  appName: 'GitLocalize',
  webDir: 'app/dist',
  /* https lets the WebView keep a secure origin, which localStorage and the crypto APIs need. */
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
}

export default config
