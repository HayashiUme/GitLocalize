import { GitHubApiError, classifyError, toApiError } from './errors'

export const GITHUB_API_BASE = 'https://api.github.com'
const API_VERSION = '2022-11-28'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  accept?: string
  allowEmpty?: boolean
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
    const headers: Record<string, string> = {
      Accept: options.accept ?? 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'GitLocalize',
    }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await this.transport.fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
    } catch (error) {
      throw toApiError(error)
    }

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
      const code = classifyError(response.status, bodyText, apiMessage)
      throw new GitHubApiError(response.status, code, apiMessage || bodyText.slice(0, 300), documentationUrl)
    }

    if (response.status === 204 || options.allowEmpty) return undefined as T
    const text = await response.text()
    if (text.trim() === '') return undefined as T
    return JSON.parse(text) as T
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
