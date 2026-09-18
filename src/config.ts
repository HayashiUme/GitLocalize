import type { ProjectConfig, TranslationFile } from './types'
import type { GitHubClient } from './github/api'
import { readTextFile } from './github/contents'
import { getParser } from './parser'

export const I18N_CONFIG_PATH = '.github/i18n.yml'

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  source: { language: 'en', directory: 'locales' },
  languages: [],
  files: ['locales/*.yml'],
  branch: { translation: 'i18n', main: 'main' },
  pullRequest: { title: 'i18n: update translations' },
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

export function normalizeConfig(raw: unknown): ProjectConfig {
  const input = (raw ?? {}) as Partial<ProjectConfig>
  return {
    source: {
      language: input.source?.language ?? DEFAULT_PROJECT_CONFIG.source.language,
      directory: input.source?.directory ?? DEFAULT_PROJECT_CONFIG.source.directory,
    },
    languages: Array.isArray(input.languages) ? input.languages.filter((item) => typeof item === 'string') : [],
    files: Array.isArray(input.files) && input.files.length > 0 ? input.files : DEFAULT_PROJECT_CONFIG.files,
    branch: {
      translation: input.branch?.translation ?? DEFAULT_PROJECT_CONFIG.branch.translation,
      main: input.branch?.main ?? DEFAULT_PROJECT_CONFIG.branch.main,
    },
    pullRequest: {
      title: input.pullRequest?.title ?? DEFAULT_PROJECT_CONFIG.pullRequest.title,
    },
    editor: input.editor,
  }
}

export async function loadProjectConfig(
  client: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<ProjectConfig> {
  try {
    const content = await readTextFile(client, owner, repo, I18N_CONFIG_PATH, ref)
    if (!content) return DEFAULT_PROJECT_CONFIG
    return normalizeConfig(getParser('yaml').parse(content))
  } catch {
    return DEFAULT_PROJECT_CONFIG
  }
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
