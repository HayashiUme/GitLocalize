import type { ClientTransport } from './api'
import appEn from '../../locales/app.en.yml?raw'
import appJa from '../../locales/app.ja.yml?raw'
import appZhCn from '../../locales/app.zh-CN.yml?raw'
import appZhTw from '../../locales/app.zh-TW.yml?raw'
import errorsEn from '../../locales/errors.en.json?raw'
import errorsJa from '../../locales/errors.ja.json?raw'
import errorsZhCn from '../../locales/errors.zh-CN.json?raw'
import errorsZhTw from '../../locales/errors.zh-TW.json?raw'

const OWNER = 'mock-owner'
const REPO = 'mock-repo'
const I18N_CONFIG = [
  'source:',
  '  language: en',
  '  directory: locales',
  'languages:',
  '  - zh-CN',
  '  - zh-TW',
  '  - ja',
  'files:',
  '  - "locales/*.yml"',
  '  - "locales/*.json"',
  'branch:',
  '  translation: i18n',
  '  main: main',
  'pullRequest:',
  '  title: "i18n: update translations"',
  '',
].join('\n')

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fakeSha(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0').repeat(5)
}

/* In-memory GitHub stand-in so the editor UI can be exercised without a token or network. */
export function createMockTransport(): ClientTransport {
  const files = new Map<string, string>([
    ['locales/app.en.yml', appEn],
    ['locales/app.zh-CN.yml', appZhCn],
    ['locales/app.zh-TW.yml', appZhTw],
    ['locales/app.ja.yml', appJa],
    ['locales/errors.en.json', errorsEn],
    ['locales/errors.zh-CN.json', errorsZhCn],
    ['locales/errors.zh-TW.json', errorsZhTw],
    ['locales/errors.ja.json', errorsJa],
    ['.github/i18n.yml', I18N_CONFIG],
  ])
  const blobs = new Map<string, string>()

  let headSha = fakeSha('mock-head-0')
  let treeSha = fakeSha('mock-tree-0')
  let pendingCommitSha: string | null = null
  let version = 0

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const describe = (filePath: string, content: string) => ({
    name: filePath.split('/').pop(),
    path: filePath,
    type: 'file',
    sha: fakeSha(`${filePath}:${content}`),
    size: new TextEncoder().encode(content).length,
  })

  const payloadFor = (filePath: string) => {
    const content = files.get(filePath)
    if (content === undefined) return null
    return {
      ...describe(filePath, content),
      encoding: 'base64',
      content: toBase64(content),
    }
  }

  return {
    async fetch(input: string, init: RequestInit): Promise<Response> {
      const url = new URL(input)
      const route = decodeURIComponent(url.pathname).replace(/^\/repos\/[^/]+\/[^/]+/, '')
      const method = (init.method ?? 'GET').toUpperCase()

      if (route === '/user') {
        return json(200, { login: 'mock-translator', id: 424242, avatar_url: '', name: 'Mock Translator' })
      }
      if (route === '') {
        return json(200, {
          name: REPO,
          default_branch: 'main',
          private: false,
          html_url: `https://github.com/${OWNER}/${REPO}`,
          permissions: { admin: true, maintain: true, push: true, pull: true },
        })
      }
      if (route === '/git/ref/heads/i18n') {
        return json(200, { ref: 'refs/heads/i18n', object: { sha: headSha, type: 'commit' } })
      }
      if (route === '/commits/i18n') {
        return json(200, { sha: headSha, tree: { sha: treeSha } })
      }
      if (route === '/contents' || route.startsWith('/contents/')) {
        const filePath = route === '/contents' ? '' : route.slice('/contents/'.length)
        const payload = payloadFor(filePath)
        if (payload) return json(200, payload)
        const prefix = filePath ? `${filePath}/` : ''
        const listing = [...files.entries()]
          .filter(([item]) => item.startsWith(prefix))
          .map(([item, content]) => describe(item, content))
        return listing.length > 0 ? json(200, listing) : json(404, { message: 'Not Found' })
      }
      if (route === '/git/blobs' && method === 'POST') {
        const body = JSON.parse(String(init.body)) as { content: string }
        const blobSha = fakeSha(`blob:${body.content}`)
        blobs.set(blobSha, body.content)
        return json(201, { sha: blobSha })
      }
      if (route === '/git/trees' && method === 'POST') {
        const body = JSON.parse(String(init.body)) as { tree: { path: string; sha: string | null }[] }
        for (const item of body.tree) {
          if (item.sha === null) files.delete(item.path)
          else if (blobs.has(item.sha)) files.set(item.path, blobs.get(item.sha) as string)
        }
        version += 1
        treeSha = fakeSha(`mock-tree-${version}`)
        return json(201, { sha: treeSha, tree: [] })
      }
      if (route === '/git/commits' && method === 'POST') {
        version += 1
        pendingCommitSha = fakeSha(`mock-head-${version}`)
        return json(201, { sha: pendingCommitSha, tree: { sha: treeSha } })
      }
      if (route.startsWith('/git/refs/heads/')) {
        if (method === 'PATCH' && pendingCommitSha) {
          headSha = pendingCommitSha
          pendingCommitSha = null
        }
        return json(200, { ref: 'refs/heads/i18n', object: { sha: headSha, type: 'commit' } })
      }
      if (route.startsWith('/pulls')) {
        if (method === 'POST') {
          const body = JSON.parse(String(init.body)) as { title: string; head: string; base: string }
          return json(201, {
            number: 1,
            title: body.title,
            html_url: `https://github.com/${OWNER}/${REPO}/pull/1`,
            state: 'open',
            user: { login: 'mock-translator' },
            head: { ref: body.head, sha: headSha, label: `${OWNER}:${body.head}` },
            base: { ref: body.base },
          })
        }
        return json(200, [])
      }
      return json(404, { message: `Mock route not implemented: ${method} ${route}` })
    },
  }
}
