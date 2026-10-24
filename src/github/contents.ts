import type { GitHubClient } from './api'
import { encodeRepoPath } from './api'

export interface ContentFile {
  path: string
  sha: string
  content: string
  size: number
}

export interface ContentEntry {
  name: string
  path: string
  type: 'file' | 'dir' | 'symlink' | 'submodule'
  sha: string
  size: number
}

interface ContentsPayload {
  type: string
  path: string
  sha: string
  size: number
  encoding?: string
  content?: string
  name?: string
}

export function decodeBase64Utf8(base64: string): string {
  const normalized = base64.replace(/\s/g, '')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder('utf-8').decode(bytes)
}

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function listDirectory(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<ContentEntry[]> {
  const suffix = path ? `/${encodeRepoPath(path)}` : ''
  const payload = await client.get<ContentsPayload[] | ContentsPayload>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${suffix}?ref=${encodeURIComponent(ref)}`,
  )
  const list = Array.isArray(payload) ? payload : [payload]
  return list.map((entry) => ({
    name: entry.name ?? entry.path.split('/').pop() ?? '',
    path: entry.path,
    type: entry.type as ContentEntry['type'],
    sha: entry.sha,
    size: entry.size ?? 0,
  }))
}

/* Returns null when the path does not exist on the ref, so callers can treat it as untranslated. */
export async function readFile(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<ContentFile | null> {
  try {
    const payload = await client.get<ContentsPayload>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(ref)}`,
    )
    if (Array.isArray(payload) || payload.type !== 'file') return null
    const raw = payload.encoding === 'base64' && payload.content ? decodeBase64Utf8(payload.content) : ''
    return { path: payload.path, sha: payload.sha, content: raw, size: payload.size ?? raw.length }
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function readTextFile(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const file = await readFile(client, owner, repo, path, ref)
  return file ? file.content : null
}

export async function fileExists(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<boolean> {
  const file = await readFile(client, owner, repo, path, ref)
  return file !== null
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'not-found'
}
