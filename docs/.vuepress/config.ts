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

const base = isBuild ? `/${siteTarget.repo}/` : '/'
const siteUrl = (process.env.GITLOCALIZE_SITE_URL ?? `https://${siteTarget.owner.toLowerCase()}.github.io/${siteTarget.repo}/`).replace(/\/$/, '')
const description = 'A translation platform with no server, no database and no backend. GitHub is the backend.'

export default defineUserConfig({
  lang: 'en-US',
  title: 'GitLocalize',
  description,
  base,
  head: [
    ['script', {}, `window.__GITLOCALIZE_CONFIG__=${JSON.stringify(siteTarget)}`],
    ['meta', { name: 'color-scheme', content: 'light' }],
    ['meta', { name: 'theme-color', content: '#226d4e' }],
    ['link', { rel: 'icon', href: `${base}favicon.ico`, sizes: 'any' }],
    ['link', { rel: 'icon', type: 'image/png', href: `${base}logo.png` }],
    ['link', { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` }],
    ['link', { rel: 'manifest', href: `${base}site.webmanifest` }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'GitLocalize' }],
    ['meta', { property: 'og:title', content: 'GitLocalize' }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: `${siteUrl}/` }],
    ['meta', { property: 'og:image', content: `${siteUrl}/og.jpg` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
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
    logo: '/logo.png',
    colorMode: 'light',
    colorModeSwitch: false,
    navbar: [
      { text: 'Editor', link: '/editor.md' },
      { text: 'Get a token', link: '/guide/token.md' },
      { text: 'Deploy', link: '/guide/deploy.md' },
      { text: 'Architecture', link: '/guide/architecture.md' },
      { text: 'Setup', link: '/guide/setup.md' },
      { text: 'Security', link: '/guide/security.md' },
      { text: 'Repository', link: `https://github.com/${siteTarget.owner}/${siteTarget.repo}` },
    ],
    sidebar: {
      '/guide/': [
        '/guide/token.md',
        '/guide/deploy.md',
        '/guide/architecture.md',
        '/guide/setup.md',
        '/guide/security.md',
      ],
    },
  }),
})
