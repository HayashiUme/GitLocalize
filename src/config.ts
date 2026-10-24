import type { ProjectConfig, TranslationFile } from './types'
import type { GitHubClient } from './github/api'
import { readTextFile } from './github/contents'
import { getParser } from './parser'
import { directoryFromMask, normalizeMask, validateMask } from './config/filemask'

/** Looked up in order: the declarative project file first, the legacy YAML for one release. */
export const CONFIG_PATHS = ['.gitlocalize/config.json', '.github/i18n.yml'] as const
export const I18N_CONFIG_PATH = CONFIG_PATHS[1]

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  source: { language: 'en', directory: 'locales' },
  languages: [],
  files: ['locales/*.yml'],
  branch: { translation: 'i18n', main: 'main' },
  pullRequest: { title: 'i18n: update translations' },
  commitMessage: 'i18n(%language%): update translations',
}

export interface SiteTarget {
  owner: string
  repo: string
  translationBranch: string
  mainBranch: string
  sourceLanguage: string
  directory: string
  files: string[]
  deviceFlowClientId?: string
  resolvedFrom: 'injected' | 'url' | 'manual'
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Weblate-style project file: filemask + push_branch + languages[]. */
function normalizeV2(input: Record<string, unknown>): ProjectConfig {
  const masks: string[] = []
  const rawMask = asString(input.filemask)
  if (rawMask && validateMask(rawMask) === null) masks.push(normalizeMask(rawMask))

  /* Multi-component projects declare one mask per file family. */
  const components = Array.isArray(input.components) ? input.components : []
  for (const item of components) {
    if (!item || typeof item !== 'object') continue
    const componentMask = asString((item as { filemask?: unknown }).filemask)
    if (componentMask && validateMask(componentMask) === null) masks.push(normalizeMask(componentMask))
  }

  const files = masks.length > 0 ? masks : DEFAULT_PROJECT_CONFIG.files
  const directory =
    asString(input.source_directory) ??
    (masks.length > 0 ? directoryFromMask(masks[0]) : DEFAULT_PROJECT_CONFIG.source.directory)

  const declared = Array.isArray(input.languages) ? input.languages : []
  const languages: string[] = []
  const languageNames: Record<string, string> = {}
  for (const item of declared) {
    if (typeof item === 'string') {
      languages.push(item)
      continue
    }
    if (item && typeof item === 'object') {
      const entry = item as { code?: unknown; name?: unknown }
      const code = asString(entry.code)
      if (!code) continue
      languages.push(code)
      const name = asString(entry.name)
      if (name) languageNames[code] = name
    }
  }

  const editor = (input.editor ?? {}) as { remember_token?: unknown; device_flow_client_id?: unknown }
  return {
    source: {
      language: asString(input.source_language) ?? DEFAULT_PROJECT_CONFIG.source.language,
      directory,
    },
    languages,
    languageNames: Object.keys(languageNames).length > 0 ? languageNames : undefined,
    files,
    branch: {
      main: asString(input.branch) ?? DEFAULT_PROJECT_CONFIG.branch.main,
      translation: asString(input.push_branch) ?? asString(input.branch) ?? DEFAULT_PROJECT_CONFIG.branch.translation,
    },
    pullRequest: {
      title: asString(input.pull_message) ?? DEFAULT_PROJECT_CONFIG.pullRequest.title,
    },
    commitMessage: asString(input.commit_message) ?? DEFAULT_PROJECT_CONFIG.commitMessage,
    editor: {
      rememberToken: editor.remember_token === true,
      deviceFlowClientId: asString(editor.device_flow_client_id),
    },
  }
}

function isV2(raw: Record<string, unknown>): boolean {
  return 'filemask' in raw || 'push_branch' in raw || 'source_language' in raw || 'pushBranch' in raw
}

export function normalizeConfig(raw: unknown): ProjectConfig {
  const input = (raw ?? {}) as Record<string, unknown>
  if (isV2(input)) return normalizeV2(input)

  const legacy = input as Partial<ProjectConfig>
  return {
    source: {
      language: legacy.source?.language ?? DEFAULT_PROJECT_CONFIG.source.language,
      directory: legacy.source?.directory ?? DEFAULT_PROJECT_CONFIG.source.directory,
    },
    languages: Array.isArray(legacy.languages) ? legacy.languages.filter((item) => typeof item === 'string') : [],
    languageNames: legacy.languageNames,
    files: Array.isArray(legacy.files) && legacy.files.length > 0 ? legacy.files : DEFAULT_PROJECT_CONFIG.files,
    branch: {
      translation: legacy.branch?.translation ?? DEFAULT_PROJECT_CONFIG.branch.translation,
      main: legacy.branch?.main ?? DEFAULT_PROJECT_CONFIG.branch.main,
    },
    pullRequest: {
      title: legacy.pullRequest?.title ?? DEFAULT_PROJECT_CONFIG.pullRequest.title,
    },
    commitMessage: legacy.commitMessage ?? DEFAULT_PROJECT_CONFIG.commitMessage,
    editor: legacy.editor,
  }
}

export async function loadProjectConfig(
  client: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<ProjectConfig> {
  for (const path of CONFIG_PATHS) {
    try {
      const content = await readTextFile(client, owner, repo, path, ref)
      if (!content) continue
      const raw = path.endsWith('.json') ? JSON.parse(content) : getParser('yaml').parse(content)
      return normalizeConfig(raw)
    } catch {
      /* try the next location */
    }
  }
  return DEFAULT_PROJECT_CONFIG
}

const LANGUAGE_SUFFIX = /\.([A-Za-z]{2}(?:-[A-Za-z]{2,4})?)\.(ya?ml|json)$/

export function languageFromPath(path: string): string | null {
  const match = path.match(LANGUAGE_SUFFIX)
  return match ? match[1] : null
}

export function formatFromPath(path: string): string | null {
  const match = path.match(LANGUAGE_SUFFIX)
  if (!match) return null
  return /^ya?ml$/.test(match[2]) ? 'yaml' : 'json'
}

export function toTranslationFile(path: string): TranslationFile | null {
  const language = languageFromPath(path)
  const format = formatFromPath(path)
  if (!language || !format) return null
  return { path, language, format }
}

export function matchGlob(path: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`).test(path)
}

/* Languages are declared in config when present, otherwise inferred from locale file names. */
export function deriveLanguages(files: TranslationFile[], config: ProjectConfig): string[] {
  const declared = config.languages.filter((language) => language !== config.source.language)
  if (declared.length > 0) return declared
  const inferred = new Set<string>()
  for (const file of files) {
    if (file.language && file.language !== config.source.language) inferred.add(file.language)
  }
  return [...inferred].sort()
}

export function targetPathForSource(sourcePath: string, language: string): string {
  return sourcePath.replace(LANGUAGE_SUFFIX, `.${language}.$2`)
}

export function readInjectedTarget(): Partial<SiteTarget> | null {
  const injected = (globalThis as Record<string, unknown>).__GITLOCALIZE_CONFIG__
  return injected && typeof injected === 'object' ? (injected as Partial<SiteTarget>) : null
}

/* Resolves the repository from an injected config first, then from the GitHub Pages URL shape. */
export function detectSiteTarget(href: string): SiteTarget | null {
  const injected = readInjectedTarget()
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }

  let owner = ''
  let repo = ''
  const host = url.hostname
  if (host.endsWith('.github.io')) {
    owner = host.slice(0, -'.github.io'.length)
    const segment = url.pathname.split('/').filter(Boolean)[0] ?? ''
    repo = segment || `${owner}.github.io`
  }

  owner = injected?.owner ?? owner
  repo = injected?.repo ?? repo
  if (!owner || !repo) return null

  return {
    owner,
    repo,
    translationBranch: injected?.translationBranch ?? DEFAULT_PROJECT_CONFIG.branch.translation,
    mainBranch: injected?.mainBranch ?? DEFAULT_PROJECT_CONFIG.branch.main,
    sourceLanguage: injected?.sourceLanguage ?? DEFAULT_PROJECT_CONFIG.source.language,
    directory: injected?.directory ?? DEFAULT_PROJECT_CONFIG.source.directory,
    files: injected?.files ?? DEFAULT_PROJECT_CONFIG.files,
    deviceFlowClientId: injected?.deviceFlowClientId,
    resolvedFrom: injected?.owner ? 'injected' : 'url',
  }
}
