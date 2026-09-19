export interface CommitAuthor {
  name: string
  email: string
}

export interface FileChange {
  path: string
  content: string
}

export interface CommitResult {
  sha: string
  unchanged: boolean
}

export interface CommitSummary {
  sha: string
  message: string
  author: string
  timestamp: number
}

/*
 * The web build talks to the REST API and the mobile build to a local clone. Both satisfy this
 * shape, so the layer above never has to know which one it holds.
 */
export interface Repository {
  ensure(): Promise<void>
  head(): Promise<string>
  listFiles(directory: string): Promise<string[]>
  readFile(path: string): Promise<string | null>
  commit(changes: FileChange[], message: string, author: CommitAuthor): Promise<CommitResult>
  push(options?: { remote?: string; ref?: string }): Promise<void>
  history(depth?: number): Promise<CommitSummary[]>
}
