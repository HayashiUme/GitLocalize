export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  name?: string | null
}

export interface RepositoryRef {
  owner: string
  name: string
  defaultBranch: string
}

export interface TranslationFile {
  path: string
  language: string
  format: string
}

export type ScalarKind = 'string' | 'multiline' | 'number' | 'boolean' | 'null'

export interface TranslationEntry {
  key: string
  path: (string | number)[]
  source: string
  translation: string
  kind: ScalarKind
  translated: boolean
}

export interface TranslationChange {
  file: string
  key: string
  oldValue: string
  newValue: string
}

export type RawDocument = Record<string, unknown>

export interface TranslationParser {
  id: string
  extensions: string[]
  parse(content: string): RawDocument
  serialize(document: RawDocument, originalContent?: string): string
}

export type QaCode =
  | 'placeholder-missing'
  | 'placeholder-extra'
  | 'html-tag-missing'
  | 'html-tag-extra'
  | 'empty-translation'
  | 'length-out-of-range'

export interface QaIssue {
  key: string
  code: QaCode
  message: string
  detail?: string
}

export type PermissionLevel = 'none' | 'read' | 'triage' | 'write' | 'maintain' | 'admin'

export interface ProjectConfig {
  source: {
    language: string
    directory: string
  }
  languages: string[]
  files: string[]
  branch: {
    translation: string
    main: string
  }
  pullRequest: {
    title: string
  }
  editor?: {
    rememberToken?: boolean
    deviceFlowClientId?: string
  }
}
