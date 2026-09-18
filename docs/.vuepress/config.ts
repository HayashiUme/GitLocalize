import { viteBundler } from '@vuepress/bundler-vite'
import { defaultTheme } from '@vuepress/theme-default'
import { defineUserConfig } from 'vuepress'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const isBuild = process.env.NODE_ENV === 'production'

const siteTarget = {
  owner: process.env.GITLOCALIZE_OWNER ?? 'HayashiUme',
  repo: process.env.GITLOCALIZE_REPO ?? 'GitLocalize',
  translationBranch: process.env.GITLOCALIZE_BRANCH ?? 'i18n',
  mainBranch: 'main',
  sourceLanguage: 'en',
  directory: 'locales',
  files: ['locales/*.yml', 'locales/*.json'],
  deviceFlowClientId: process.env.GITLOCALIZE_CLIENT_ID ?? '',
}

export default defineUserConfig({
  lang: 'en-US',
  title: 'GitLocalize',
  description: 'GitHub-native, zero-backend translation platform.',
  base: isBuild ? `/${siteTarget.repo}/` : '/',
  head: [
    ['script', {}, `window.__GITLOCALIZE_CONFIG__=${JSON.stringify(siteTarget)}`],
    ['meta', { name: 'color-scheme', content: 'light' }],
  ],
  bundler: viteBundler({
    viteOptions: {
      resolve: {
        alias: { '@': path.join(rootDir, 'src') },
      },
      server: {
        fs: { allow: [rootDir] },
      },
    },
  }),
  theme: defaultTheme({
    logo: '/logo.svg',
    colorMode: 'light',
    colorModeSwitch: false,
    navbar: [
      { text: 'Editor', link: '/editor.md' },
      { text: 'Architecture', link: '/guide/architecture.md' },
      { text: 'Setup', link: '/guide/setup.md' },
      { text: 'Security', link: '/guide/security.md' },
      { text: 'Repository', link: `https://github.com/${siteTarget.owner}/${siteTarget.repo}` },
    ],
    sidebar: {
      '/guide/': ['/guide/architecture.md', '/guide/setup.md', '/guide/security.md'],
    },
  }),
})
