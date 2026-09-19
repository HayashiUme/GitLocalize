import { GitHubApiError, classifyError, toApiError } from './errors'

export const GITHUB_API_BASE = 'https://api.github.com'
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
    this.baseUrl = options.baseUrl ?? GITHUB_API_BASE
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
        const response = await this.transport.fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal,
        })

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

        if (response.status === 204 || options.allowEmpty) return undefined as T
        const text = await response.text()
        if (text.trim() === '') return undefined as T
        if (options.raw) return text as T
        return JSON.parse(text) as T
      } catch (error) {
        if (error instanceof GitHubApiError) throw error
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

export function createClient(token: string, options?: { transport?: ClientTransport; baseUrl?: string }): GitHubClient {
  return new GitHubClient(token, options)
}
