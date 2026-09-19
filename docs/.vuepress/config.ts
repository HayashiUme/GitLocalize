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

/* The docs are hosted from this branch, so translated pages live under a per-language prefix. */
const LANGS = [
  { path: '/', lang: 'en-US', label: 'English' },
  { path: '/zh/', lang: 'zh-CN', label: '简体中文' },
  { path: '/zh-tw/', lang: 'zh-TW', label: '繁體中文' },
  { path: '/ja/', lang: 'ja', label: '日本語' },
  { path: '/ko/', lang: 'ko', label: '한국어' },
  { path: '/es/', lang: 'es', label: 'Español' },
  { path: '/fr/', lang: 'fr', label: 'Français' },
  { path: '/de/', lang: 'de', label: 'Deutsch' },
  { path: '/pt/', lang: 'pt-BR', label: 'Português' },
  { path: '/it/', lang: 'it', label: 'Italiano' },
  { path: '/ru/', lang: 'ru', label: 'Русский' },
  { path: '/ar/', lang: 'ar', label: 'العربية' },
  { path: '/hi/', lang: 'hi', label: 'हिन्दी' },
  { path: '/id/', lang: 'id', label: 'Bahasa Indonesia' },
  { path: '/tr/', lang: 'tr', label: 'Türkçe' },
  { path: '/vi/', lang: 'vi', label: 'Tiếng Việt' },
  { path: '/th/', lang: 'th', label: 'ไทย' },
  { path: '/nl/', lang: 'nl', label: 'Nederlands' },
  { path: '/pl/', lang: 'pl', label: 'Polski' },
  { path: '/sv/', lang: 'sv', label: 'Svenska' },
  { path: '/uk/', lang: 'uk', label: 'Українська' },
  { path: '/cs/', lang: 'cs', label: 'Čeština' },
]

const navbarFor = (prefix: string) => [
  { text: 'Editor', link: '/editor.md' },
  { text: 'Guide', link: `${prefix}guide/index.md` },
  { text: 'Get a token', link: '/guide/token.md' },
  { text: 'Deploy', link: '/guide/deploy.md' },
  { text: 'Repository', link: `https://github.com/${siteTarget.owner}/${siteTarget.repo}` },
  {
    text: LANGS.find((entry) => entry.path === prefix)?.label ?? 'Language',
    children: LANGS.map(({ path: target, label }) => ({
      text: label,
      link: `${target}guide/index.md`,
    })),
  },
]

const locales = Object.fromEntries(
  LANGS.map(({ path: prefix, lang }) => [
    prefix,
    {
      lang,
      title: 'GitLocalize',
      description,
      navbar: navbarFor(prefix),
      sidebar: { [`${prefix}guide/`]: [`${prefix}guide/index.md`] },
    },
  ]),
)

export default defineUserConfig({
  lang: 'en-US',
  title: 'GitLocalize',
  description,
  base,
  locales,
  head: [
    ['script', {}, `window.__GITLOCALIZE_CONFIG__=${JSON.stringify(siteTarget)}`],
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
    colorMode: 'auto',
    colorModeSwitch: true,
    locales,
  }),
})
