import { GitHubApiError, classifyError, toApiError } from './errors'

export const GITHUB_API_BASE = 'https://api.github.com'

const API_BASE_KEY = 'gitlocalize.api.base'

/* The API host can be pointed elsewhere with ?api=... or a stored choice, which is what
   machines behind a proxy that blocks api.github.com need. */
export function resolveApiBase(): string {
  const query = new URLSearchParams(globalThis.location?.search ?? '').get('api')
  const stored = globalThis.localStorage?.getItem(API_BASE_KEY)
  const picked = (query || stored || '').trim()
  return picked ? picked.replace(/\/+$/, '') : GITHUB_API_BASE
}

export function rememberApiBase(value: string): void {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed) globalThis.localStorage?.setItem(API_BASE_KEY, trimmed)
  else globalThis.localStorage?.removeItem(API_BASE_KEY)
}

export function apiBaseHost(): string {
  try {
    return new URL(resolveApiBase()).host
  } catch {
    return GITHUB_API_BASE
  }
}
const API_VERSION = '2022-11-28'
const REQUEST_TIMEOUT_MS = 15000
const RETRY_DELAY_MS = 600
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  accept?: string
  allowEmpty?: boolean
  /** Return the raw response text instead of parsing it as JSON. */
  raw?: boolean
}

export interface RateLimitInfo {
  limit: number
  remaining: number
  resetAt: number
}

export interface ClientTransport {
  fetch(input: string, init: RequestInit): Promise<Response>
}

export function encodeRepoPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

/* Thin typed wrapper over the GitHub REST API. Tokens live only in memory here and are never logged. */
export class GitHubClient {
  readonly token: string
  private readonly transport: ClientTransport
  private readonly baseUrl: string
  lastRateLimit: RateLimitInfo | null = null

  constructor(token: string, options: { transport?: ClientTransport; baseUrl?: string } = {}) {
    this.token = token
    this.transport = options.transport ?? { fetch: (input, init) => fetch(input, init) }
    this.baseUrl = options.baseUrl ?? resolveApiBase()
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET'
    const headers: Record<string, string> = {
      Accept: options.accept ?? 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'GitLocalize',
    }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    /* GETs are idempotent: ride out transient network failures and server hiccups. */
    const attempts = method === 'GET' ? 3 : 1
    let lastError: unknown

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const signal = options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        const started = Date.now()
        logRequest(`-> ${method} ${path}`)
        const response = await this.transport.fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal,
        })
        logRequest(`<- ${response.status} ${method} ${path} (${Date.now() - started}ms)`)

        this.captureRateLimit(response)

        if (!response.ok) {
          const bodyText = await response.text().catch(() => '')
          let apiMessage = ''
          let documentationUrl: string | undefined
          try {
            const parsed = JSON.parse(bodyText) as { message?: string; documentation_url?: string }
            apiMessage = parsed.message ?? ''
            documentationUrl = parsed.documentation_url
          } catch {
            apiMessage = bodyText.slice(0, 300)
          }
          if (response.headers.get('x-ratelimit-remaining') === '0') {
            const resetAt = new Date(Number(response.headers.get('x-ratelimit-reset')) * 1000)
            apiMessage +=
              ` (anonymous quota is 60 requests/hour per IP; signing in raises it to 5,000/hour. ` +
              `Quota resets at ${resetAt.toLocaleTimeString()})`
          }
          const code = classifyError(response.status, bodyText, apiMessage)
          const retryable = method === 'GET' && (response.status >= 500 || response.status === 429)
          if (retryable && attempt < attempts - 1) {
            await delay(RETRY_DELAY_MS * (attempt + 1))
            continue
          }
          throw new GitHubApiError(response.status, code, apiMessage || bodyText.slice(0, 300), documentationUrl)
        }

        if (response.status === 204 || options.allowEmpty) {
          logRequest(`   (no body expected for ${method} ${path})`)
          return undefined as T
        }
        const text = await response.text()
        if (text.trim() === '') {
          logRequest(`   (empty body for ${method} ${path})`)
          throw new Error(`${method} ${path} answered ${response.status} with an empty body`)
        }
        if (options.raw) return text as T
        try {
          return JSON.parse(text) as T
        } catch (error) {
          logRequest(`   (unparsable body: ${text.slice(0, 200)})`)
          throw new Error(`${method} ${path} answered with a body that is not JSON: ${text.slice(0, 200)}`)
        }
      } catch (error) {
        if (error instanceof GitHubApiError) {
          logRequest(`!! ${method} ${path} -> ${error.status} ${error.detail ?? ''}`)
          throw error
        }
        logRequest(`!! ${method} ${path} -> ${error instanceof Error ? error.message : String(error)}`)
        lastError = error
        if (attempt < attempts - 1) {
          await delay(RETRY_DELAY_MS * (attempt + 1))
          continue
        }
        throw toApiError(error)
      }
    }

    throw toApiError(lastError)
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body })
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body })
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body })
  }

  delete<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE', body })
  }

  private captureRateLimit(response: Response): void {
    const limit = Number(response.headers.get('x-ratelimit-limit'))
    const remaining = Number(response.headers.get('x-ratelimit-remaining'))
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    if (Number.isFinite(limit) && Number.isFinite(remaining) && Number.isFinite(reset)) {
      this.lastRateLimit = { limit, remaining, resetAt: reset * 1000 }
    }
  }
}

const LOG_LIMIT = 80
const requestLog: string[] = []

function logRequest(line: string): void {
  requestLog.push(line)
  if (requestLog.length > LOG_LIMIT) requestLog.shift()
}

/* Hands over the recent request log so the interface can show what actually happened. */
export function takeApiLog(): string[] {
  return requestLog.splice(0, requestLog.length)
}

export function createClient(token: string, options?: { transport?: ClientTransport; baseUrl?: string }): GitHubClient {
  return new GitHubClient(token, options)
}
