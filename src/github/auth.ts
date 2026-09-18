import type { GitHubUser } from '../types'
import { GitHubClient } from './api'

export const DEVICE_CODE_ENDPOINT = 'https://github.com/login/device/code'
export const DEVICE_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token'
const SESSION_KEY = 'gitlocalize.session.token'

export type AuthSource = 'pat' | 'device-flow'

export interface Session {
  user: GitHubUser
  token: string
  source: AuthSource
  persisted: boolean
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

/* Token storage is memory-first. sessionStorage is opt-in because a stored token survives reloads. */
export const tokenStore = {
  memory: null as string | null,

  load(): string | null {
    if (this.memory) return this.memory
    try {
      const stored = globalThis.sessionStorage?.getItem(SESSION_KEY) ?? null
      this.memory = stored
      return stored
    } catch {
      return null
    }
  },

  save(token: string, persist: boolean): void {
    this.memory = token
    try {
      if (persist) globalThis.sessionStorage?.setItem(SESSION_KEY, token)
      else globalThis.sessionStorage?.removeItem(SESSION_KEY)
    } catch {
      this.memory = token
    }
  },

  clear(): void {
    this.memory = null
    try {
      globalThis.sessionStorage?.removeItem(SESSION_KEY)
    } catch {
      this.memory = null
    }
  },
}

export async function fetchViewer(client: GitHubClient): Promise<GitHubUser> {
  return client.get<GitHubUser>('/user')
}

export async function signInWithToken(
  token: string,
  options: { persist?: boolean; client?: GitHubClient } = {},
): Promise<Session> {
  const trimmed = token.trim()
  if (!trimmed) throw new Error('Access token is empty.')
  const client = options.client ?? new GitHubClient(trimmed)
  const user = await fetchViewer(client)
  tokenStore.save(trimmed, options.persist === true)
  return { user, token: trimmed, source: 'pat', persisted: options.persist === true }
}

export function signOut(): void {
  tokenStore.clear()
}

const DEVICE_ERROR_MESSAGES: Record<string, string> = {
  authorization_pending: 'Waiting for approval in the browser...',
  slow_down: 'GitHub asked us to slow down the polling.',
  expired_token: 'The device code expired. Start again.',
  access_denied: 'Authorization was denied.',
  incorrect_device_code: 'The device code was rejected.',
}

export async function requestDeviceCode(clientId: string, scope: string): Promise<DeviceCodeResponse> {
  const response = await fetch(DEVICE_CODE_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope }),
  })
  if (!response.ok) {
    throw new Error(`Device flow is unavailable (HTTP ${response.status}). Use a personal access token instead.`)
  }
  return (await response.json()) as DeviceCodeResponse
}

/* Polls GitHub until the user approves the device code, honouring GitHub's slow_down signal. */
export async function pollDeviceToken(
  clientId: string,
  deviceCode: string,
  options: { intervalSeconds?: number; signal?: AbortSignal; onTick?: (message: string) => void } = {},
): Promise<string> {
  let intervalSeconds = options.intervalSeconds ?? 5
  for (;;) {
    if (options.signal?.aborted) throw new Error('Device flow was cancelled.')
    await delay(intervalSeconds * 1000, options.signal)
    const response = await fetch(DEVICE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })
    const payload = (await response.json()) as {
      access_token?: string
      error?: string
      error_description?: string
      interval?: number
    }
    if (payload.access_token) return payload.access_token
    const error = payload.error ?? 'unknown_error'
    if (error === 'slow_down') intervalSeconds += 5
    if (error === 'authorization_pending' || error === 'slow_down') {
      options.onTick?.(DEVICE_ERROR_MESSAGES[error])
      continue
    }
    throw new Error(DEVICE_ERROR_MESSAGES[error] ?? payload.error_description ?? `Device flow failed: ${error}`)
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('Device flow was cancelled.'))
    })
  })
}

export function noreplyEmail(user: GitHubUser): string {
  return `${user.id}+${user.login}@users.noreply.github.com`
}
