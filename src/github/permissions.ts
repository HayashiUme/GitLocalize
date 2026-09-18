import type { PermissionLevel } from '../types'
import type { GitHubClient } from './api'

const ORDER: PermissionLevel[] = ['none', 'read', 'triage', 'write', 'maintain', 'admin']

export interface RepositoryInfo {
  owner: string
  name: string
  defaultBranch: string
  private: boolean
  viewerCanPush: boolean
  viewerCanMaintain: boolean
  viewerPermission: PermissionLevel
  htmlUrl: string
}

interface RepoPayload {
  name: string
  default_branch: string
  private: boolean
  html_url: string
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; triage?: boolean; pull?: boolean }
}

interface CollaboratorPermissionPayload {
  permission: PermissionLevel
  role_name?: string
}

export function rank(level: PermissionLevel): number {
  const index = ORDER.indexOf(level)
  return index < 0 ? 0 : index
}

export function isAtLeast(level: PermissionLevel, required: PermissionLevel): boolean {
  return rank(level) >= rank(required)
}

export function canWrite(level: PermissionLevel): boolean {
  return isAtLeast(level, 'write')
}

export function canMaintain(level: PermissionLevel): boolean {
  return isAtLeast(level, 'maintain')
}

function levelFromPermissions(permissions: RepoPayload['permissions']): PermissionLevel {
  if (!permissions) return 'none'
  if (permissions.admin) return 'admin'
  if (permissions.maintain) return 'maintain'
  if (permissions.push) return 'write'
  if (permissions.triage) return 'triage'
  if (permissions.pull) return 'read'
  return 'none'
}

export async function getRepository(client: GitHubClient, owner: string, repo: string): Promise<RepositoryInfo> {
  const payload = await client.get<RepoPayload>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
  const viewerPermission = levelFromPermissions(payload.permissions)
  return {
    owner,
    name: payload.name,
    defaultBranch: payload.default_branch,
    private: payload.private,
    viewerCanPush: canWrite(viewerPermission),
    viewerCanMaintain: canMaintain(viewerPermission),
    viewerPermission,
    htmlUrl: payload.html_url,
  }
}

/* Reads another collaborator's effective permission. Requires push access to the repository. */
export async function getCollaboratorPermission(
  client: GitHubClient,
  owner: string,
  repo: string,
  username: string,
): Promise<PermissionLevel> {
  try {
    const payload = await client.get<CollaboratorPermissionPayload>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}/permission`,
    )
    return payload.permission ?? 'none'
  } catch {
    return 'none'
  }
}

export function describePermission(level: PermissionLevel): string {
  const labels: Record<PermissionLevel, string> = {
    none: 'No access',
    read: 'Read',
    triage: 'Triage',
    write: 'Write',
    maintain: 'Maintain',
    admin: 'Admin',
  }
  return labels[level]
}
