import { computed, reactive } from 'vue'
import type { GitHubUser, ProjectConfig, QaIssue, TranslationChange, TranslationEntry, TranslationFile } from '../types'
import {
  DEFAULT_PROJECT_CONFIG,
  deriveLanguages,
  detectSiteTarget,
  formatFromPath,
  loadProjectConfig,
  matchGlob,
  toTranslationFile,
  type SiteTarget,
} from '../config'
import { GitHubClient, type ClientTransport } from '../github/api'
import { noreplyEmail, signInWithToken, signOut, tokenStore } from '../github/auth'
import { listDirectory, readFile } from '../github/contents'
import { toApiError, type GitHubApiError, type GitHubErrorCode } from '../github/errors'
import { commitFiles, getRefSha } from '../github/gitData'
import { createMockTransport } from '../github/mockTransport'
import { getRepository, type RepositoryInfo } from '../github/permissions'
import { ensurePullRequest, findOpenPullRequest, type PullRequestInfo } from '../github/pullRequests'
import { cloneDocument, deletePath, flatten, getParser, setPath, splitPath, type FlatEntry } from '../parser'
import { groupIssuesByKey, qaCheckEntries } from '../qa'
import { initialiseUiLocale, t } from '../i18n'
import { clearDraft, loadDraft, saveDraft } from '../storage/drafts'

export type EditorStatus = 'signed-out' | 'loading' | 'ready' | 'error'

export interface EditorMessage {
  key: string
  params?: Record<string, string | number>
  detail?: string
}

/* Internal failures travel as keys so the interface can render them in the reader's language. */
class EditorError extends Error {
  constructor(
    readonly key: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(key)
    this.name = 'EditorError'
  }
}

const ERROR_KEYS: Record<GitHubErrorCode, string> = {
  unauthorized: 'error.auth.expired',
  forbidden: 'error.auth.forbidden',
  'not-found': 'error.notFound.repository',
  conflict: 'error.conflict.branchMoved',
  validation: 'error.validation.failed',
  'rate-limited': 'error.network.rateLimited',
  server: 'error.network.server',
  network: 'error.network.unreachable',
  unknown: 'error.unknown',
}

interface EditorState {
  status: EditorStatus
  error: EditorMessage | null
  notice: EditorMessage | null
  busy: boolean
  user: GitHubUser | null
  token: string
  persistedToken: boolean
  target: SiteTarget | null
  needsTarget: boolean
  repo: RepositoryInfo | null
  config: ProjectConfig
  headSha: string
  baseSha: string
  files: TranslationFile[]
  languages: string[]
  language: string
  file: string
  sourceEntries: FlatEntry[]
  targetValues: Map<string, string>
  overrides: Record<string, string>
  branchMoved: boolean
  search: string
  untranslatedOnly: boolean
  lastCommitSha: string | null
  lastCommitUrl: string | null
  pullRequest: PullRequestInfo | null
  mock: boolean
}

const state = reactive<EditorState>({
  status: 'signed-out',
  error: null,
  notice: null,
  busy: false,
  user: null,
  token: '',
  persistedToken: false,
  target: null,
  needsTarget: false,
  repo: null,
  config: DEFAULT_PROJECT_CONFIG,
  headSha: '',
  baseSha: '',
  files: [],
  languages: [],
  language: '',
  file: '',
  sourceEntries: [],
  targetValues: new Map<string, string>(),
  overrides: {},
  branchMoved: false,
  search: '',
  untranslatedOnly: false,
  lastCommitSha: null,
  lastCommitUrl: null,
  pullRequest: null,
  mock: false,
})

let client: GitHubClient | null = null
let mockTransport: ClientTransport | null = null
let bootstrapped = false
let targetDocument: Record<string, unknown> = {}
let targetContent: string | undefined

/** Mock-aware client factory, exported for editor views that need extra API calls. */
export function makeClient(token: string): GitHubClient {
  if (state.mock) {
    mockTransport = mockTransport ?? createMockTransport()
    return new GitHubClient(token, { transport: mockTransport })
  }
  return new GitHubClient(token)
}

function apiClient(): GitHubClient {
  if (!client) throw new EditorError('message.notSignedIn')
  return client
}

function fail(error: unknown): void {
  if (error instanceof EditorError) {
    state.error = { key: error.key, params: error.params }
    return
  }
  const apiError = toApiError(error)
  state.error = { key: ERROR_KEYS[apiError.code], params: errorParams(apiError), detail: apiError.detail }
}

function errorParams(apiError: GitHubApiError): Record<string, string> {
  if (apiError.code === 'forbidden') {
    return { repo: state.target ? `${state.target.owner}/${state.target.repo}` : '—' }
  }
  if (apiError.code === 'rate-limited') {
    return { resetAt: new Date(client?.lastRateLimit?.resetAt ?? Date.now()).toLocaleTimeString() }
  }
  return {}
}

export const errorText = computed(() => (state.error ? t(state.error.key, state.error.params) : ''))

export const noticeText = computed(() => (state.notice ? t(state.notice.key, state.notice.params) : ''))

export const targetPath = computed(() =>
  state.file.replace(/\.([A-Za-z]{2}(?:-[A-Za-z]{2,4})?)\.(ya?ml|json)$/, `.${state.language}.$2`),
)

export const entries = computed<TranslationEntry[]>(() =>
  state.sourceEntries.map((entry) => {
    const override = state.overrides[entry.key]
    const translation = override !== undefined ? override : (state.targetValues.get(entry.key) ?? '')
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

export const filteredEntries = computed<TranslationEntry[]>(() => {
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

export const changes = computed<TranslationChange[]>(() =>
  entries.value
    .filter((entry) => state.overrides[entry.key] !== undefined)
    .map((entry) => ({
      file: targetPath.value,
      key: entry.key,
      oldValue: state.targetValues.get(entry.key) ?? '',
      newValue: entry.translation,
    })),
)

export const issuesByKey = computed<Map<string, QaIssue[]>>(() => groupIssuesByKey(qaCheckEntries(entries.value)))

export const stats = computed(() => {
  const all = entries.value
  const issues = qaCheckEntries(all)
  return {
    total: all.length,
    translated: all.filter((entry) => entry.translated).length,
    untranslated: all.filter((entry) => !entry.translated).length,
    modified: all.filter((entry) => state.overrides[entry.key] !== undefined).length,
    warnings: issues.filter((issue) => issue.code !== 'empty-translation').length,
    blocking: issues.filter((issue) => issue.code !== 'empty-translation').length,
  }
})

function draftKey(owner: string, repo: string, branch: string, path: string): string {
  return `${owner}/${repo}@${branch}:${path}`
}

async function resolveTarget(): Promise<boolean> {
  if (state.target) return true
  const detected = detectSiteTarget(globalThis.location?.href ?? '')
  if (!detected) {
    state.needsTarget = true
    state.error = { key: 'message.noTarget' }
    return false
  }
  state.target = detected
  return true
}

async function bootstrap(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true
  initialiseUiLocale(globalThis.location?.href ?? '')
  state.mock = new URLSearchParams(globalThis.location?.search ?? '').has('mock')
  const resolved = await resolveTarget()
  if (!resolved) {
    state.status = 'signed-out'
    return
  }
  const stored = tokenStore.load()
  if (!stored) return
  state.token = stored
  state.persistedToken = true
  await openSession(stored, true)
}

async function openSession(token: string, persist: boolean): Promise<void> {
  const trimmed = token.trim()
  if (!trimmed) {
    state.error = { key: 'message.tokenEmpty' }
    return
  }
  if (!(await resolveTarget())) {
    state.error = { key: 'message.targetFirst' }
    return
  }
  state.busy = true
  state.error = null
  state.notice = null
  try {
    const session = await signInWithToken(trimmed, { persist, client: makeClient(trimmed) })
    client = makeClient(trimmed)
    state.user = session.user
    state.token = session.token
    state.persistedToken = persist
    await loadAll()
  } catch (error) {
    client = null
    state.user = null
    state.token = ''
    tokenStore.clear()
    state.status = 'error'
    fail(error)
  } finally {
    state.busy = false
  }
}

async function loadAll(): Promise<void> {
  const target = state.target
  if (!target || !client) return
  state.status = 'loading'
  state.busy = true
  state.error = null
  try {
    const api = apiClient()
    const repo = await getRepository(api, target.owner, target.repo)
    state.repo = repo
    const branch = target.translationBranch
    const config = await loadProjectConfig(api, target.owner, target.repo, branch)
    state.config = {
      ...config,
      branch: { translation: branch, main: target.mainBranch },
      source: { ...config.source, language: target.sourceLanguage || config.source.language },
      editor: { ...config.editor, deviceFlowClientId: config.editor?.deviceFlowClientId ?? target.deviceFlowClientId },
    }
    state.headSha = await getRefSha(api, target.owner, target.repo, branch)
    state.baseSha = state.headSha

    const listing = await listDirectory(api, target.owner, target.repo, state.config.source.directory, branch)
    const candidates = listing
      .filter((item) => item.type === 'file')
      .map((item) => item.path)
      .filter((path) => formatFromPath(path) !== null)
      .filter((path) => state.config.files.some((pattern) => matchGlob(path, pattern)))

    const allFiles = candidates.map(toTranslationFile).filter((file): file is TranslationFile => file !== null)
    state.files = allFiles.filter((file) => file.language === state.config.source.language)
    state.languages = deriveLanguages(allFiles, state.config)
    if (state.languages.length === 0) throw new EditorError('message.noLanguages')
    if (state.files.length === 0) throw new EditorError('message.noSourceFiles')

    state.language = state.languages.includes(state.language) ? state.language : state.languages[0]
    const preferred = state.files.find((file) => file.path === state.file) ?? state.files[0]
    state.file = preferred.path
    await loadFile()
    state.status = 'ready'
  } catch (error) {
    state.status = 'error'
    fail(error)
  } finally {
    state.busy = false
  }
}

async function loadFile(): Promise<void> {
  const target = state.target
  if (!target || !client || !state.file) return
  const api = apiClient()
  const branch = target.translationBranch
  const sourceFile = await readFile(api, target.owner, target.repo, state.file, branch)
  if (!sourceFile) throw new EditorError('message.sourceMissing', { path: state.file })

  state.sourceEntries = flatten(getParser(state.file).parse(sourceFile.content))

  const translationFile = await readFile(api, target.owner, target.repo, targetPath.value, branch)
  if (translationFile) {
    targetDocument = getParser(translationFile.path).parse(translationFile.content)
    targetContent = translationFile.content
  } else {
    targetDocument = {}
    targetContent = undefined
  }
  const values = new Map<string, string>()
  for (const entry of flatten(targetDocument)) values.set(entry.key, entry.value)
  state.targetValues = values
  state.branchMoved = false

  const stored = loadDraft(draftKey(target.owner, target.repo, branch, targetPath.value))
  state.overrides = stored && stored.baseSha === state.headSha ? { ...stored.overrides } : {}
}

async function selectLanguage(language: string): Promise<void> {
  state.language = language
  await loadFile()
}

async function selectFile(path: string): Promise<void> {
  state.file = path
  await loadFile()
}

function setTranslation(key: string, value: string): void {
  const original = state.targetValues.get(key) ?? ''
  if (value === original) delete state.overrides[key]
  else state.overrides[key] = value
  const target = state.target
  if (!target) return
  saveDraft(
    draftKey(target.owner, target.repo, target.translationBranch, targetPath.value),
    state.baseSha,
    { ...state.overrides },
  )
}

function revertAll(): void {
  state.overrides = {}
  const target = state.target
  if (target) clearDraft(draftKey(target.owner, target.repo, target.translationBranch, targetPath.value))
}

function buildTargetContent(): string {
  const document = cloneDocument(targetDocument)
  for (const [key, value] of Object.entries(state.overrides)) {
    const path = splitPath(key)
    if (value.trim() === '') deletePath(document, path)
    else setPath(document, path, value)
  }
  return getParser(targetPath.value).serialize(document, targetContent)
}

async function refreshTarget(): Promise<void> {
  const target = state.target
  if (!target || !client) return
  const file = await readFile(apiClient(), target.owner, target.repo, targetPath.value, target.translationBranch)
  targetDocument = file ? getParser(file.path).parse(file.content) : {}
  targetContent = file?.content
  const values = new Map<string, string>()
  for (const entry of flatten(targetDocument)) values.set(entry.key, entry.value)
  state.targetValues = values
}

async function submit(): Promise<void> {
  const target = state.target
  const user = state.user
  if (!target || !user) return
  if (Object.keys(state.overrides).length === 0) {
    state.notice = { key: 'message.nothingToCommit' }
    return
  }
  state.busy = true
  state.error = null
  state.notice = null
  try {
    const api = apiClient()
    const content = buildTargetContent()
    const message = `i18n(${state.language}): update translations\n\nTranslation-By: @${user.login}\n`
    const result = await commitFiles(api, {
      owner: target.owner,
      repo: target.repo,
      branch: target.translationBranch,
      baseSha: state.baseSha,
      files: [{ path: targetPath.value, content }],
      message,
      author: { name: user.login, email: noreplyEmail(user) },
    })

    if (result.unchanged || !result.commitSha) {
      state.overrides = {}
      state.notice = { key: 'message.noContentChange' }
      return
    }

    state.lastCommitSha = result.commitSha
    const repoUrl = state.repo?.htmlUrl ?? `https://github.com/${target.owner}/${target.repo}`
    state.lastCommitUrl = `${repoUrl}/commit/${result.commitSha}`
    state.headSha = result.commitSha
    state.baseSha = result.commitSha
    state.overrides = {}
    clearDraft(draftKey(target.owner, target.repo, target.translationBranch, targetPath.value))
    await refreshTarget()
    state.pullRequest =
      (await findOpenPullRequest(api, target.owner, target.repo, target.translationBranch, target.mainBranch).catch(
        () => null,
      )) ?? null
    state.notice = {
      key: 'message.committed',
      params: { sha: result.commitSha.slice(0, 7), branch: target.translationBranch },
    }
  } catch (error) {
    if (toApiError(error).code === 'conflict') state.branchMoved = true
    fail(error)
  } finally {
    state.busy = false
  }
}

async function ensureTranslationPullRequest(): Promise<void> {
  const target = state.target
  if (!target || !client) return
  const result = await ensurePullRequest(apiClient(), {
    owner: target.owner,
    repo: target.repo,
    title: state.config.pullRequest.title,
    head: target.translationBranch,
    base: target.mainBranch,
    body: 'Translations committed from the GitLocalize editor.',
  })
  state.pullRequest = result.pullRequest
}

export const actions = {
  bootstrap,
  signIn: openSession,
  signOut(): void {
    signOut()
    client = null
    state.user = null
    state.token = ''
    state.persistedToken = false
    state.status = 'signed-out'
    state.overrides = {}
  },
  setTarget(owner: string, repo: string, translationBranch?: string): void {
    state.target = {
      owner,
      repo,
      translationBranch: translationBranch || state.config.branch.translation,
      mainBranch: state.config.branch.main,
      sourceLanguage: state.config.source.language,
      directory: state.config.source.directory,
      files: state.config.files,
      resolvedFrom: 'manual',
    }
    state.needsTarget = false
  },
  reload: loadAll,
  selectLanguage,
  selectFile,
  setTranslation,
  revertAll,
  submit,
  ensureTranslationPullRequest,
}

export function useEditor() {
  return { state, entries, filteredEntries, changes, issuesByKey, stats, targetPath, errorText, noticeText, actions }
}
