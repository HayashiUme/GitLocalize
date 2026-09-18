export type GitHubErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'rate-limited'
  | 'server'
  | 'network'
  | 'unknown'

const MESSAGES: Record<GitHubErrorCode, string> = {
  unauthorized: 'Authentication expired. Please sign in again.',
  forbidden: "You don't have permission to modify this repository.",
  'not-found': 'Repository or file not found, or your account cannot see it.',
  conflict: 'The translation branch has changed since you opened this file.',
  validation: 'GitHub rejected the request payload.',
  'rate-limited': 'GitHub API rate limit reached. Wait a moment and try again.',
  server: 'GitHub returned a server error. Please retry.',
  network: 'Network request failed. Check your connection.',
  unknown: 'Unexpected GitHub API error.',
}

export class GitHubApiError extends Error {
  readonly status: number
  readonly code: GitHubErrorCode
  readonly detail: string
  readonly documentationUrl?: string

  constructor(status: number, code: GitHubErrorCode, detail: string, documentationUrl?: string) {
    super(MESSAGES[code])
    this.name = 'GitHubApiError'
    this.status = status
    this.code = code
    this.detail = detail
    this.documentationUrl = documentationUrl
  }

  get isConflict(): boolean {
    return this.code === 'conflict'
  }

  get requiresSignIn(): boolean {
    return this.code === 'unauthorized'
  }
}

export function codeForStatus(status: number): GitHubErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'server'
  return 'unknown'
}

const BODY_MARKERS: { marker: string; code: GitHubErrorCode }[] = [
  { marker: 'rate limit', code: 'rate-limited' },
  { marker: 'not accessible by personal access token', code: 'forbidden' },
  { marker: 'Resource not accessible', code: 'forbidden' },
]

export function classifyError(status: number, bodyText: string, apiMessage: string): GitHubErrorCode {
  const haystack = `${bodyText} ${apiMessage}`.toLowerCase()
  for (const entry of BODY_MARKERS) {
    if (haystack.includes(entry.marker.toLowerCase())) return entry.code
  }
  return codeForStatus(status)
}

export function toApiError(error: unknown): GitHubApiError {
  if (error instanceof GitHubApiError) return error
  const detail = error instanceof Error ? error.message : String(error)
  return new GitHubApiError(0, 'network', detail)
}
