import { computed, reactive } from 'vue'
import { toTranslationFile } from '@/config'
import { t } from '@/i18n'
import { GitHubClient } from '@/github/api'
import { fetchViewer } from '@/github/auth'
import { DEFAULT_MT_SETTINGS, translate, type MtSettings } from '@/mt'
import { remember, suggest } from '@/mt/memory'
import { downloadTextFile } from '@/storage/download'
import { cloneDocument, deletePath, flatten, getParser, setPath, splitPath, type FlatEntry } from '@/parser'
import { groupIssuesByKey, qaCheckEntries } from '@/qa'
import { createLocalGitRepository } from '@/repository/localGit'
import type { Repository } from '@/repository/types'
import type { GitHubUser, QaIssue, RawDocument, TranslationEntry } from '@/types'

export const LOCALES_DIR = 'locales'
export const SOURCE_LANGUAGE = 'en'
export const DEFAULT_TRANSLATION_BRANCH = 'i18n'
const WORK_DIR = 'gitlocalize-work'
/* No sparse checkout in isomorphic-git: a large repository would land on the phone whole. */
const SIZE_WARNING_KB = 50 * 1024

const STORAGE = {
  target: 'gitlocalize.mobile.target',
  draft: 'gitlocalize.mobile.draft',
  settings: 'gitlocalize.mobile.settings',
  mt: 'gitlocalize.mobile.mt',
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  untranslatedFirst: boolean
}

const DEFAULT_SETTINGS: Settings = { theme: 'system', untranslatedFirst: false }

interface Draft {
  target: Target
  language: string
  file: string
  overrides: Record<string, string>
  /* What each key read when it was stashed, so incoming translations can win over stale drafts. */
  base: Record<string, string>
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: the app still works, it just forgets */
  }
}

export function applyTheme(theme: Settings['theme']): void {
  const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  globalThis.document?.documentElement?.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export type Phase = 'welcome' | 'connecting' | 'translating'

export interface Target {
  owner: string
  repo: string
  branch: string
  url: string
}

interface State {
  phase: Phase
  busy: boolean
  error: string
  notice: string
  warning: string
  user: GitHubUser | null
  token: string
  target: Target | null
  repository: Repository | null
  files: string[]
  languages: string[]
  language: string
  file: string
  sourceEntries: FlatEntry[]
  targetDocument: RawDocument
  targetContent: string | undefined
  overrides: Record<string, string>
  draftBase: Record<string, string>
  search: string
  untranslatedOnly: boolean
  lastCommitSha: string | null
  settings: Settings
  showSettings: boolean
  mt: MtSettings
  mtBusy: string | null
  restored: boolean
}

export const state = reactive<State>({
  phase: 'welcome',
  busy: false,
  error: '',
  notice: '',
  warning: '',
  user: null,
  token: '',
  target: null,
  repository: null,
  files: [],
  languages: [],
  language: '',
  file: '',
  sourceEntries: [],
  targetDocument: {},
  targetContent: undefined,
  overrides: {},
  draftBase: {},
  search: '',
  untranslatedOnly: false,
  lastCommitSha: null,
  settings: readJson<Settings>(STORAGE.settings, DEFAULT_SETTINGS),
  showSettings: false,
  mt: readJson<MtSettings>(STORAGE.mt, DEFAULT_MT_SETTINGS),
  mtBusy: null,
  restored: false,
})

export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/i, '').replace(/\/+$/, '')
  const full = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)$/i)
  if (full) return { owner: full[1], repo: full[2] }
  const short = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (short) return { owner: short[1], repo: short[2] }
  return null
}

export const targetPath = computed(() =>
  state.file.replace(/\.([A-Za-z]{2}(?:-[A-Za-z]{2,4})?)\.(ya?ml|json)$/, `.${state.language}.$2`),
)

const translationValues = computed(() => {
  const values = new Map<string, string>()
  for (const entry of flatten(state.targetDocument)) values.set(entry.key, entry.value)
  return values
})

export const entries = computed<TranslationEntry[]>(() =>
  state.sourceEntries.map((entry) => {
    const override = state.overrides[entry.key]
    const translation = override !== undefined ? override : (translationValues.value.get(entry.key) ?? '')
    return {
      key: entry.key,
      path: entry.path,
      source: entry.value,
      translation,
      kind: entry.kind,
      translated: translation.trim() !== '',
    }
  }),
)

export const visibleEntries = computed(() => {
  const query = state.search.trim().toLowerCase()
  return entries.value.filter((entry) => {
    if (state.untranslatedOnly && entry.translated) return false
    if (!query) return true
    return (
      entry.key.toLowerCase().includes(query) ||
      entry.source.toLowerCase().includes(query) ||
      entry.translation.toLowerCase().includes(query)
    )
  })
})

export const issuesByKey = computed<Map<string, QaIssue[]>>(() => groupIssuesByKey(qaCheckEntries(entries.value)))

export const stats = computed(() => {
  const all = entries.value
  const issues = qaCheckEntries(all)
  return {
    total: all.length,
    translated: all.filter((entry) => entry.translated).length,
    modified: all.filter((entry) => state.overrides[entry.key] !== undefined).length,
    warnings: issues.filter((issue) => issue.code !== 'empty-translation').length,
  }
})

export const hasChanges = computed(() => Object.keys(state.overrides).length > 0)

/* For each untranslated key: the translation memory first, then a twin source from this file. */
export const suggestions = computed<Map<string, string>>(() => {
  const map = new Map<string, string>()
  const bySource = new Map<string, string>()
  for (const entry of entries.value) {
    if (entry.translated && entry.source.trim() !== '' && !bySource.has(entry.source)) {
      bySource.set(entry.source, entry.translation)
    }
  }
  for (const entry of entries.value) {
    if (entry.translated || entry.source.trim() === '') continue
    const memory = suggest(entry.source, state.language)
    if (memory) map.set(entry.key, memory)
    else {
      const twin = bySource.get(entry.source)
      if (twin) map.set(entry.key, twin)
    }
  }
  return map
})

/* Weblate-style nearby-strings context: what sits directly around each key in the file. */
export const neighborsMap = computed(() => {
  const map = new Map<string, { prev: { key: string; source: string } | null; next: { key: string; source: string } | null }>()
  for (let index = 0; index < entries.value.length; index += 1) {
    const entry = entries.value[index]
    const before = entries.value[index - 1]
    const after = entries.value[index + 1]
    map.set(entry.key, {
      prev: before ? { key: before.key, source: before.source } : null,
      next: after ? { key: after.key, source: after.source } : null,
    })
  }
  return map
})

export const repoLabel = computed(() => (state.target ? `${state.target.owner}/${state.target.repo}` : ''))

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildTargetContent(): string {
  const document = cloneDocument(state.targetDocument)
  for (const [key, value] of Object.entries(state.overrides)) {
    const path = splitPath(key)
    if (value.trim() === '') deletePath(document, path)
    else setPath(document, path, value)
  }
  return getParser(targetPath.value).serialize(document, state.targetContent)
}

async function loadFile(): Promise<void> {
  const repository = state.repository
  if (!repository || !state.file) return
  const source = await repository.readFile(state.file)
  if (source === null) throw new Error(`${state.file} is missing from the clone`)
  state.sourceEntries = flatten(getParser(state.file).parse(source))

  const target = await repository.readFile(targetPath.value)
  if (target === null) {
    state.targetDocument = {}
    state.targetContent = undefined
  } else {
    state.targetDocument = getParser(targetPath.value).parse(target)
    state.targetContent = target
  }

  /* Local edits survive the app being killed. A key whose file value changed upstream is dropped:
     incoming translations win over stale drafts, exactly as the product intends. */
  const draft = readJson<Draft | null>(STORAGE.draft, null)
  const usable = draft && draft.file === state.file && draft.language === state.language ? draft : null
  const current = new Map(flatten(state.targetDocument).map((entry) => [entry.key, entry.value]))
  const overrides: Record<string, string> = {}
  const bases: Record<string, string> = {}
  if (usable) {
    for (const [key, value] of Object.entries(usable.overrides)) {
      const base = usable.base?.[key] ?? (current.get(key) ?? '')
      if (base !== (current.get(key) ?? '')) continue
      overrides[key] = value
      bases[key] = base
    }
  }
  state.overrides = overrides
  state.draftBase = bases
  state.restored = Object.keys(overrides).length > 0
}

function persistDraft(): void {
  if (!state.target) return
  writeJson(STORAGE.draft, {
    target: state.target,
    language: state.language,
    file: state.file,
    overrides: state.overrides,
    base: state.draftBase,
  } satisfies Draft)
}

async function connect(options: { repoInput: string; token: string; branch?: string }): Promise<void> {
  const parsed = parseRepoInput(options.repoInput)
  if (!parsed) {
    state.error = 'connect.error.repository'
    return
  }
  const token = options.token.trim()
  if (!token) {
    state.error = 'connect.error.token'
    return
  }

  state.phase = 'connecting'
  state.busy = true
  state.error = ''
  state.notice = ''
  state.warning = ''
  try {
    const client = new GitHubClient(token)
    state.user = await fetchViewer(client)

    const info = await client.get<{ size: number }>(`/repos/${parsed.owner}/${parsed.repo}`)
    if (info.size > SIZE_WARNING_KB) state.warning = 'connect.warning.largeRepository'

    const branch = options.branch?.trim() || DEFAULT_TRANSLATION_BRANCH
    state.target = { ...parsed, branch, url: `https://github.com/${parsed.owner}/${parsed.repo}.git` }
    state.token = token
    writeJson(STORAGE.target, state.target)

    const repository = createLocalGitRepository({ dir: WORK_DIR, url: state.target.url, token, branch })
    await repository.ensure()
    state.repository = repository

    const listed = await repository.listFiles(LOCALES_DIR)
    const translationFiles = listed.map(toTranslationFile).filter((file) => file !== null)
    const sourceFiles = translationFiles.filter((file) => file.language === SOURCE_LANGUAGE)
    if (sourceFiles.length === 0) throw new Error('connect.error.noLocales')

    const languages = [...new Set(translationFiles.map((file) => file.language))]
      .filter((language) => language !== SOURCE_LANGUAGE)
      .sort()
    if (languages.length === 0) throw new Error('connect.error.noLanguages')

    state.files = sourceFiles.map((file) => file.path).sort()
    state.languages = languages
    state.language = languages[0]
    state.file = state.files[0]
    await loadFile()

    state.notice = 'connect.connected'
    state.phase = 'translating'
  } catch (error) {
    state.phase = 'welcome'
    state.error = describe(error)
  } finally {
    state.busy = false
  }
}

async function selectLanguage(language: string): Promise<void> {
  state.language = language
  await loadFile()
}

async function selectFile(file: string): Promise<void> {
  state.file = file
  await loadFile()
}

function setTranslation(key: string, value: string): void {
  const original = translationValues.value.get(key) ?? ''
  if (value === original) {
    delete state.overrides[key]
    delete state.draftBase[key]
  } else {
    if (state.draftBase[key] === undefined) state.draftBase[key] = original
    state.overrides[key] = value
  }
  persistDraft()
}

function revert(): void {
  state.overrides = {}
  state.draftBase = {}
  state.restored = false
  writeJson(STORAGE.draft, null)
}

async function submit(): Promise<void> {
  const repository = state.repository
  const target = state.target
  const user = state.user
  if (!repository || !target || !user || !hasChanges.value) return

  state.busy = true
  state.error = ''
  state.notice = ''
  try {
    const result = await repository.commit(
      [{ path: targetPath.value, content: buildTargetContent() }],
      `i18n(${state.language}): update translations\n\nTranslation-By: @${user.login}\n`,
      { name: user.login, email: `${user.id}+${user.login}@users.noreply.github.com` },
    )
    if (result.unchanged) {
      state.notice = 'message.noContentChange'
      return
    }
    state.lastCommitSha = result.sha
    await repository.push()
    writeJson(STORAGE.draft, null)
    /* Landed translations feed the memory that powers suggestions on the next run. */
    for (const [key, value] of Object.entries(state.overrides)) {
      const source = state.sourceEntries.find((item) => item.key === key)?.value
      if (source) remember(source, state.language, value)
    }
    state.notice = 'app.pushed'
    await loadFile()
  } catch (error) {
    state.error = describe(error)
  } finally {
    state.busy = false
  }
}

function disconnect(): void {
  state.phase = 'welcome'
  state.repository = null
  state.target = null
  state.user = null
  state.token = ''
  state.overrides = {}
  state.error = ''
  state.notice = ''
  state.warning = ''
  state.lastCommitSha = null
}

function updateSettings(patch: Partial<Settings>): void {
  state.settings = { ...state.settings, ...patch }
  writeJson(STORAGE.settings, state.settings)
  applyTheme(state.settings.theme)
}

function toggleSettings(open?: boolean): void {
  state.showSettings = open ?? !state.showSettings
}

function updateMt(patch: Partial<MtSettings>): void {
  state.mt = { ...state.mt, ...patch }
  writeJson(STORAGE.mt, state.mt)
}

async function applyMt(key: string): Promise<void> {
  const entry = entries.value.find((item) => item.key === key)
  if (!entry || state.mtBusy) return
  state.mtBusy = key
  state.error = ''
  try {
    const value = await translate(entry.source, state.language, state.mt)
    setTranslation(key, value)
  } catch (error) {
    state.error = describe(error)
  } finally {
    state.mtBusy = null
  }
}

/* One request at a time: the free Google endpoint throttles hard under parallel load. */
async function applyMtAll(): Promise<void> {
  if (state.mtBusy) return
  const targets = entries.value.filter((entry) => !entry.translated && entry.source.trim() !== '')
  if (targets.length === 0) return
  state.mtBusy = '__all__'
  state.error = ''
  let count = 0
  try {
    for (const entry of targets) {
      const value = await translate(entry.source, state.language, state.mt)
      setTranslation(entry.key, value)
      count += 1
    }
    state.notice = t('app.mtAllDone', { count })
  } catch (error) {
    state.error = describe(error)
  } finally {
    state.mtBusy = null
  }
}

function applySuggestion(key: string): void {
  const value = suggestions.value.get(key)
  if (value !== undefined) setTranslation(key, value)
}

async function downloadFile(): Promise<void> {
  const repository = state.repository
  if (!repository || !state.file) return
  state.busy = true
  state.error = ''
  try {
    const content =
      (hasChanges.value ? buildTargetContent() : null) ?? (await repository.readFile(targetPath.value)) ?? ''
    const where = await downloadTextFile(targetPath.value, content)
    state.notice = t('app.downloaded', { path: where })
  } catch (error) {
    state.error = describe(error)
  } finally {
    state.busy = false
  }
}

export const savedTarget = readJson<Target | null>(STORAGE.target, null)

export const actions = {
  connect,
  selectLanguage,
  selectFile,
  setTranslation,
  revert,
  submit,
  disconnect,
  updateSettings,
  toggleSettings,
  updateMt,
  applyMt,
  applyMtAll,
  applySuggestion,
  downloadFile,
}

export function useApp() {
  return { state, entries, visibleEntries, issuesByKey, stats, hasChanges, repoLabel, targetPath, actions }
}
