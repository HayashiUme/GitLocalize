import type { GitHubClient } from './api'
import { GitHubApiError } from './errors'

export interface CommitFileChange {
  path: string
  content: string | null
}

export interface CommitAuthor {
  name: string
  email: string
  date?: string
}

export interface CommitResult {
  commitSha: string | null
  treeSha: string
  baseSha: string
  unchanged: boolean
}

export interface CommitRequest {
  owner: string
  repo: string
  branch: string
  baseSha: string
  files: CommitFileChange[]
  message: string
  author: CommitAuthor
}

interface RefPayload {
  object: { sha: string; type: string }
}

interface CommitPayload {
  sha: string
  tree: { sha: string }
}

interface TreePayload {
  sha: string
  tree: { path: string; type: string; sha: string }[]
}

interface BlobPayload {
  sha: string
}

export async function getRefSha(client: GitHubClient, owner: string, repo: string, branch: string): Promise<string> {
  const payload = await client.get<RefPayload>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  )
  return payload.object.sha
}

export async function getBranchHeadCommit(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
): Promise<CommitPayload> {
  return client.get<CommitPayload>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`)
}

export async function getTree(
  client: GitHubClient,
  owner: string,
  repo: string,
  treeSha: string,
  recursive = false,
): Promise<TreePayload> {
  const suffix = recursive ? '?recursive=1' : ''
  return client.get<TreePayload>(`/repos/${owner}/${repo}/git/trees/${treeSha}${suffix}`)
}

export async function createBlob(client: GitHubClient, owner: string, repo: string, content: string): Promise<string> {
  const payload = await client.post<BlobPayload>(`/repos/${owner}/${repo}/git/blobs`, {
    content,
    encoding: 'utf-8',
  })
  return payload.sha
}

export function assertSameHead(current: string, expected: string, branch: string): void {
  if (current !== expected) {
    throw new GitHubApiError(
      409,
      'conflict',
      `Branch ${branch} moved from ${expected} to ${current} before the commit was written.`,
    )
  }
}

/* Builds one commit for every changed file through the Git database API, then fast-forwards the branch ref. */
export async function commitFiles(client: GitHubClient, request: CommitRequest): Promise<CommitResult> {
  const baseCommit = await getBranchHeadCommit(client, request.owner, request.repo, request.branch)
  assertSameHead(baseCommit.sha, request.baseSha, request.branch)

  const entries: { path: string; mode: string; type: string; sha: string | null }[] = []
  for (const file of request.files) {
    if (file.content === null) {
      entries.push({ path: file.path, mode: '100644', type: 'blob', sha: null })
      continue
    }
    const blobSha = await createBlob(client, request.owner, request.repo, file.content)
    entries.push({ path: file.path, mode: '100644', type: 'blob', sha: blobSha })
  }

  const tree = await client.post<TreePayload>(`/repos/${request.owner}/${request.repo}/git/trees`, {
    base_tree: baseCommit.tree.sha,
    tree: entries,
  })

  if (tree.sha === baseCommit.tree.sha) {
    return { commitSha: null, treeSha: tree.sha, baseSha: request.baseSha, unchanged: true }
  }

  const commit = await client.post<CommitPayload>(`/repos/${request.owner}/${request.repo}/git/commits`, {
    message: request.message,
    tree: tree.sha,
    parents: [request.baseSha],
    author: request.author,
  })

  const head = await getRefSha(client, request.owner, request.repo, request.branch)
  assertSameHead(head, request.baseSha, request.branch)

  try {
    await client.request(`/repos/${request.owner}/${request.repo}/git/refs/heads/${encodeURIComponent(request.branch)}`, {
      method: 'PATCH',
      body: { sha: commit.sha, force: false },
    })
  } catch (error) {
    if (error instanceof GitHubApiError) {
      throw new GitHubApiError(409, 'conflict', `Ref update rejected: ${error.detail}`)
    }
    throw error
  }

  return { commitSha: commit.sha, treeSha: tree.sha, baseSha: request.baseSha, unchanged: false }
}
