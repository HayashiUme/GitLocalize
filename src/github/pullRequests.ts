import type { GitHubClient } from './api'

export interface PullRequestInfo {
  number: number
  title: string
  htmlUrl: string
  state: string
  head: string
  base: string
  headSha: string
  author: string
}

interface PullRequestPayload {
  number: number
  title: string
  html_url: string
  state: string
  user: { login: string }
  head: { ref: string; sha: string; label: string }
  base: { ref: string }
}

function toInfo(payload: PullRequestPayload): PullRequestInfo {
  return {
    number: payload.number,
    title: payload.title,
    htmlUrl: payload.html_url,
    state: payload.state,
    head: payload.head.ref,
    base: payload.base.ref,
    headSha: payload.head.sha,
    author: payload.user?.login ?? '',
  }
}

export async function findOpenPullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  head: string,
  base: string,
): Promise<PullRequestInfo | null> {
  const query = new URLSearchParams({ state: 'open', head: `${owner}:${head}`, base, per_page: '5' })
  const payload = await client.get<PullRequestPayload[]>(`/repos/${owner}/${repo}/pulls?${query.toString()}`)
  if (!Array.isArray(payload) || payload.length === 0) return null
  return toInfo(payload[0])
}

export async function createPullRequest(
  client: GitHubClient,
  options: { owner: string; repo: string; title: string; head: string; base: string; body: string },
): Promise<PullRequestInfo> {
  const payload = await client.post<PullRequestPayload>(`/repos/${options.owner}/${options.repo}/pulls`, {
    title: options.title,
    head: options.head,
    base: options.base,
    body: options.body,
  })
  return toInfo(payload)
}

/* Idempotent by design: an existing i18n -> main pull request is reused instead of duplicated. */
export async function ensurePullRequest(
  client: GitHubClient,
  options: { owner: string; repo: string; title: string; head: string; base: string; body: string },
): Promise<{ created: boolean; pullRequest: PullRequestInfo | null }> {
  const existing = await findOpenPullRequest(client, options.owner, options.repo, options.head, options.base)
  if (existing) return { created: false, pullRequest: existing }
  try {
    const pullRequest = await createPullRequest(client, options)
    return { created: true, pullRequest }
  } catch (error) {
    const again = await findOpenPullRequest(client, options.owner, options.repo, options.head, options.base).catch(
      () => null,
    )
    if (again) return { created: false, pullRequest: again }
    throw error
  }
}

export function defaultPullRequestBody(changedFiles: string[], languages: string[], branch: string): string {
  const fileLines = changedFiles.length > 0 ? changedFiles.map((path) => `- \`${path}\``).join('\n') : '- (no file list)'
  const languageLines = languages.length > 0 ? languages.map((language) => `- ${language}`).join('\n') : '- (unknown)'
  return [
    '## Translation Update',
    '',
    `This PR was automatically created from the \`${branch}\` branch.`,
    '',
    '### Languages',
    languageLines,
    '',
    '### Files',
    fileLines,
    '',
    'Please review before merging.',
    '',
  ].join('\n')
}
