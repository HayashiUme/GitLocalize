import { registerPlugin } from '@capacitor/core'
import type { HttpClient, HttpRequest, HttpResponse } from 'isomorphic-git'
import { base64ToBytes, bytesToBase64 } from './base64'

interface NativeHttpResponse {
  status: number
  headers: Record<string, string>
  bodyBase64: string
}

interface NativeHttpPlugin {
  request(options: {
    url: string
    method: string
    headers: Record<string, string>
    bodyBase64?: string
  }): Promise<NativeHttpResponse>
}

const NativeHttp = registerPlugin<NativeHttpPlugin>('NativeHttp')

type RequestBody = HttpRequest['body']

/* isomorphic-git hands over an async iterator; the bridge only takes a flat payload. */
async function collect(body: RequestBody): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0)
  if (body instanceof Uint8Array) return body
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
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

async function* stream(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes
}

/* The native round trip replaces fetch here: GitHub's git endpoints send no CORS headers. */
export const nativeHttp: HttpClient = {
  async request({ url, method = 'GET', headers = {}, body }: HttpRequest): Promise<HttpResponse> {
    const payload = await collect(body)
    const response = await NativeHttp.request({
      url,
      method,
      /* A compressed packfile would reach isomorphic-git still compressed. */
      headers: { ...(headers as Record<string, string>), 'Accept-Encoding': 'identity' },
      bodyBase64: payload.length > 0 ? bytesToBase64(payload) : undefined,
    })
    return {
      url,
      method,
      statusCode: response.status,
      statusMessage: String(response.status),
      headers: response.headers,
      body: stream(base64ToBytes(response.bodyBase64)),
    }
  },
}
