import git from 'isomorphic-git'
import { capacitorFs } from '../native/fsAdapter'
import { nativeHttp } from '../native/httpAdapter'
import type { CommitAuthor, CommitResult, CommitSummary, FileChange, Repository } from './types'

export interface LocalGitOptions {
  dir: string
  url: string
  token: string
  branch: string
}

function resolvePath(dir: string, path: string): string {
  return `${dir.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/* Credentials ride on the http adapter, so the token never lands in .git/config on disk. */
function auth(token: string): () => { username: string; password: string } {
  return () => ({ username: 'x-access-token', password: token })
}

export function createLocalGitRepository(options: LocalGitOptions): Repository {
  const { dir, url, token, branch } = options
  const fs = capacitorFs

  async function cloned(): Promise<boolean> {
    try {
      await git.resolveRef({ fs, dir, ref: 'HEAD' })
      return true
    } catch {
      return false
    }
  }

  /* Fetches first so a push can never silently overwrite work someone else already landed. */
  async function catchUp(): Promise<'current' | 'fast-forward' | 'diverged'> {
    await git.fetch({
      fs,
      http: nativeHttp,
      dir,
      remote: 'origin',
      ref: branch,
      singleBranch: true,
      depth: 1,
      onAuth: auth(token),
    })
    const remote = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` }).catch(() => null)
    const local = await git.resolveRef({ fs, dir, ref: 'HEAD' })
    if (!remote || remote === local) return 'current'

    const canFastForward = await git
      .isDescendent({ fs, dir, oid: remote, ancestor: local, depth: -1 })
      .catch(() => false)
    if (!canFastForward) return 'diverged'

    /* A verified fast-forward is just a ref move; git.merge trips over shallow history. */
    await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: remote, force: true })
    await git.checkout({ fs, dir, ref: branch, force: true })
    return 'fast-forward'
  }

  return {
    async ensure(): Promise<void> {
      if (!(await cloned())) {
        await git.clone({
          fs,
          http: nativeHttp,
          dir,
          url,
          ref: branch,
          singleBranch: true,
          depth: 1,
          onAuth: auth(token),
        })
        return
      }
      /* Reconnecting should show whatever the branch looks like now, not what it looked like last time. */
      await catchUp()
    },

    async head(): Promise<string> {
      return git.resolveRef({ fs, dir, ref: 'HEAD' })
    },

    async listFiles(directory: string): Promise<string[]> {
      const prefix = directory.replace(/^\/+|\/+$/g, '')
      const files = await git.listFiles({ fs, dir })
      return (prefix ? files.filter((file) => file.startsWith(`${prefix}/`)) : files).sort()
    },

    async readFile(path: string): Promise<string | null> {
      try {
        const data = await fs.promises.readFile(resolvePath(dir, path), { encoding: 'utf8' })
        return typeof data === 'string' ? data : new TextDecoder().decode(data)
      } catch {
        return null
      }
    },

    async commit(changes: FileChange[], message: string, author: CommitAuthor): Promise<CommitResult> {
      let touched = 0
      for (const change of changes) {
        const target = resolvePath(dir, change.path)
        const before = await fs.promises.readFile(target, { encoding: 'utf8' }).catch(() => null)
        if (before === change.content) continue
        await fs.promises.writeFile(target, change.content, { encoding: 'utf8' })
        await git.add({ fs, dir, filepath: change.path })
        touched += 1
      }
      if (touched === 0) return { sha: '', unchanged: true }
      return { sha: await git.commit({ fs, dir, message, author }), unchanged: false }
    },

    async push({ remote = 'origin', ref = branch }: { remote?: string; ref?: string } = {}): Promise<void> {
      const moved = await catchUp()
      if (moved === 'diverged') {
        /* Resolving a three-way merge on a phone keyboard is not something to ask of anyone. */
        throw new Error('The remote branch has moved ahead. Sync again before committing.')
      }
      await git.push({ fs, http: nativeHttp, dir, remote, ref, onAuth: auth(token) })
    },

    async history(depth = 10): Promise<CommitSummary[]> {
      const commits = await git.log({ fs, dir, depth })
      return commits.map((entry) => ({
        sha: entry.oid,
        message: entry.commit.message,
        author: entry.commit.author.name,
        timestamp: entry.commit.author.timestamp,
      }))
    },
  }
}
