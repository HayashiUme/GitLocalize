import { Capacitor } from '@capacitor/core'
import { nativeHttp } from '../native/httpAdapter'

export type MtProvider = 'none' | 'google' | 'deepl'

export interface MtSettings {
  provider: MtProvider
  deeplKey: string
}

export const DEFAULT_MT_SETTINGS: MtSettings = { provider: 'google', deeplKey: '' }

/* DeepL only exposes a Simplified Chinese variant; Google handles both. */
function deeplLanguage(language: string): string {
  const base = language.split('-')[0]
  return base === 'zh' ? 'ZH' : base.toUpperCase()
}

async function collectBody(body: AsyncIterableIterator<Uint8Array> | undefined): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of body) {
    chunks.push(chunk)
    total += chunk.length
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

/* Native builds must leave the WebView for these calls: DeepL sends no CORS headers at all. */
async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  if (Capacitor.isNativePlatform()) {
    const headers = Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
    let payload: string | undefined
    if (typeof init.body === 'string') payload = init.body
    const response = await nativeHttp.request({
      url,
      method: init.method ?? 'GET',
      headers,
      bodyBase64: payload ? bytesToBase64(new TextEncoder().encode(payload)) : undefined,
    })
    const bytes = await collectBody(response.body)
    return JSON.parse(new TextDecoder().decode(bytes))
  }
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function googleTranslate(text: string, target: string): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
    `&sl=auto&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(text)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  /* Interception pages (proxies, bot checks) answer with HTTP 200 + HTML. */
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) throw new Error('translate service returned a non-JSON page (a proxy may be intercepting it)')
  const data = (await response.json()) as unknown
  const segments = (data as unknown[][][])[0]
  if (!Array.isArray(segments)) throw new Error('unexpected Google response')
  return segments.map((segment) => String(segment?.[0] ?? '')).join('')
}

async function deeplTranslate(text: string, target: string, key: string): Promise<string> {
  const data = (await requestJson('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: [text], target_lang: deeplLanguage(target) }),
  })) as { translations?: { text: string }[] }
  const first = data.translations?.[0]
  if (!first) throw new Error('unexpected DeepL response')
  return first.text
}

export async function translate(text: string, target: string, settings: MtSettings): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (settings.provider === 'deepl') {
    if (!settings.deeplKey) throw new Error('mt.error.noKey')
    return deeplTranslate(trimmed, target, settings.deeplKey)
  }
  return googleTranslate(trimmed, target)
}
