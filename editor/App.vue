<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { AVAILABLE_UI_LOCALES, setUiLocale, t, uiLocale } from '@/i18n'
import { flatten, getParser } from '@/parser'
import { translate, type MtSettings } from '@/mt'
import { remember, suggest } from '@/mt/memory'
import { downloadTextFile } from '@/storage/download'
import { makeClient, useEditor } from '@/state/editorStore'
import type { TranslationEntry } from '@/types'

const { state, entries, filteredEntries, issuesByKey, stats, errorText, noticeText, actions } = useEditor()

const repoInput = ref('')
const tokenInput = ref('')
const rememberToken = ref(false)

/* ---- Theme (dark/light) and editor UI language ---- */
const THEME_KEY = 'gitlocalize.editor.theme'
const theme = ref<'light' | 'dark'>(loadTheme())

function loadTheme(): 'light' | 'dark' {
  try {
    return (globalThis.localStorage?.getItem(THEME_KEY) as 'light' | 'dark') ?? 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(value: 'light' | 'dark'): void {
  theme.value = value
  document.documentElement.dataset.theme = value
  globalThis.localStorage?.setItem(THEME_KEY, value)
}

onMounted(() => {
  document.documentElement.dataset.theme = theme.value
})

function switchUiLocale(event: Event): void {
  setUiLocale((event.target as HTMLSelectElement).value)
}

/* ---- Weblate flow: language overview -> language dashboard -> translate ---- */
type View = 'overview' | 'dashboard' | 'translate'
type DashboardTab = 'overview' | 'translate' | 'search' | 'insights' | 'files' | 'actions'
type PanelTab = 'nearby' | 'similar' | 'occurrences' | 'comments' | 'suggestions' | 'otherLangs' | 'history'

interface LangStat {
  language: string
  name: string
  strings: number
  words: number
  chars: number
  translated: number
  readonlyStrings: number
  files: string[]
  perFile: { path: string; strings: number; translated: number }[]
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', 'zh-CN': '简体中文', 'zh-TW': '中文（繁体）', ja: '日本語', ko: '한국어',
  es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', 'pt-BR': 'Português (Brasil)',
  it: 'Italiano', ru: 'Русский', ar: 'العربية', hi: 'हिन्दी', id: 'Bahasa Indonesia',
  tr: 'Türkçe', vi: 'Tiếng Việt', th: 'ไทย', nl: 'Nederlands', pl: 'Polski',
  sv: 'Svenska', uk: 'Українська', cs: 'Čeština', da: 'Dansk', fi: 'Suomi',
}

function langName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code
}

const view = ref<View>('overview')
const dashboardTab = ref<DashboardTab>('overview')
const panelTab = ref<PanelTab>('nearby')
const activeLang = ref('')
const langStats = ref<LangStat[]>([])
const overviewProgress = ref('')
const overviewLoaded = ref(false)
const entryCache = new Map<string, Map<string, string>>()

/* ---- Single-string focus state (translate view) ---- */
const position = ref(0)
const draft = ref('')

const MT_KEY = 'gitlocalize.editor.mt'
const mt = ref<MtSettings>(loadMt())
const mtBusy = ref(false)
const mtResult = ref<string | null>(null)
const mtError = ref('')

function loadMt(): MtSettings {
  try {
    const raw = globalThis.localStorage?.getItem(MT_KEY)
    return raw ? (JSON.parse(raw) as MtSettings) : { provider: 'google', deeplKey: '' }
  } catch {
    return { provider: 'google', deeplKey: '' }
  }
}

function persistMt(): void {
  globalThis.localStorage?.setItem(MT_KEY, JSON.stringify(mt.value))
}

const current = computed<TranslationEntry | null>(() => filteredEntries.value[position.value] ?? null)
const issues = computed(() => (current.value ? (issuesByKey.value.get(current.value.key) ?? []) : []))
const translatedRatio = computed(() =>
  stats.value.total > 0 ? Math.round((stats.value.translated / stats.value.total) * 100) : 0,
)

/* ---- Overview loading errors: silently swallowed ones made counters read zero ---- */
const overviewErrors = ref<string[]>([])
const overviewFailures = ref<string[]>([])

/* ---- History: recent commits touching the current translation file ---- */
const historyEntries = ref<CommitInfo[]>([])
const historyLoading = ref(false)

async function loadHistory(): Promise<void> {
  const target = state.target
  if (!target || !state.file || historyLoading.value) return
  historyLoading.value = true
  try {
    const client = makeClient(state.token)
    const commits = await client.get<{ sha: string; html_url: string; commit: { message: string; author?: { name?: string; date?: string } } }[]>(
      `/repos/${target.owner}/${target.repo}/commits?sha=${target.translationBranch}&path=${encodeURIComponent(state.file)}&per_page=10`,
    )
    historyEntries.value = (Array.isArray(commits) ? commits : []).map((entry) => ({
      sha: entry.sha.slice(0, 7),
      message: (entry.commit.message ?? '').split('\n')[0],
      author: entry.commit.author?.name ?? '',
      date: entry.commit.author?.date ?? '',
      url: entry.html_url,
    }))
  } catch {
    historyEntries.value = []
  } finally {
    historyLoading.value = false
  }
}

/* ---- Comments: GitHub review comments on the standing translation pull request ---- */
const prComments = ref<PullComment[]>([])
const commentText = ref('')
const commentBusy = ref(false)
const commentsLoading = ref(false)

async function loadComments(): Promise<void> {
  const target = state.target
  if (!target || commentsLoading.value) return
  commentsLoading.value = true
  try {
    const client = makeClient(state.token)
    if (!state.pullRequest) await actions.ensureTranslationPullRequest()
    const number = state.pullRequest?.number
    if (!number) return
    const comments = await client.get<{ id: number; body: string; path: string; html_url: string; user?: { login?: string }; updated_at?: string }[]>(
      `/repos/${target.owner}/${target.repo}/pulls/${number}/comments?per_page=50`,
    )
    prComments.value = (Array.isArray(comments) ? comments : [])
      .filter((entry) => !state.file || entry.path === state.file)
      .map((entry) => ({
        id: entry.id,
        user: entry.user?.login ?? '',
        body: entry.body ?? '',
        path: entry.path,
        updated: (entry.updated_at ?? '').slice(0, 10),
        url: entry.html_url,
      }))
  } catch {
    prComments.value = []
  } finally {
    commentsLoading.value = false
  }
}

async function postComment(): Promise<void> {
  const target = state.target
  const focus = current.value
  if (!target || !focus || commentBusy.value || commentText.value.trim() === '') return
  commentBusy.value = true
  try {
    const client = makeClient(state.token)
    if (!state.pullRequest) await actions.ensureTranslationPullRequest()
    const number = state.pullRequest?.number
    if (!number || !state.headSha) return
    await client.post(`/repos/${target.owner}/${target.repo}/pulls/${number}/comments`, {
      body: `[${focus.key}] ${commentText.value.trim()}`,
      commit_id: state.headSha,
      path: state.file,
      position: 1,
    })
    commentText.value = ''
    await loadComments()
  } finally {
    commentBusy.value = false
  }
}

const twinHit = computed(() => {
  const entry = current.value
  if (!entry) return null
  const twin = entries.value.find((item) => item.key !== entry.key && item.source === entry.source && item.translated)
  return twin ? twin.translation : null
})

const nearby = computed(() => {
  const focus = current.value
  if (!focus) return []
  const index = entries.value.findIndex((item) => item.key === focus.key)
  if (index < 0) return []
  return entries.value.slice(Math.max(0, index - 5), index + 6)
})

/* Keys sharing the most path tokens with the current key. */
const similarKeys = computed(() => {
  const focus = current.value
  if (!focus) return []
  const tokens = focus.key.split(/[._/\-]/).filter((part) => part.length > 2)
  return entries.value
    .filter((item) => item.key !== focus.key)
    .map((item) => ({
      entry: item,
      score: tokens.filter((token) => item.key.toLowerCase().includes(token.toLowerCase())).length,
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((hit) => hit.entry)
})

/* Other keys carrying the same source text. */
const occurrences = computed(() => {
  const focus = current.value
  if (!focus) return []
  return entries.value.filter((item) => item.key !== focus.key && item.source === focus.source)
})

/* The same key as it reads in the other languages seen during the overview. */
const otherLanguages = computed(() => {
  const focus = current.value
  if (!focus) return []
  const rows: { language: string; name: string; value: string }[] = []
  for (const [language, map] of entryCache) {
    if (language === state.language) continue
    const value = map.get(focus.key)
    if (value) rows.push({ language, name: langName(language), value })
  }
  return rows
})

const historyUrl = computed(() => {
  if (!state.target || !state.file) return ''
  return `https://github.com/${state.target.owner}/${state.target.repo}/commits/${state.target.translationBranch}/${state.file}`
})

/* Keep the pager inside the filtered list: filters can shrink it at any time. */
watch(filteredEntries, (list) => {
  if (position.value >= list.length) position.value = Math.max(list.length - 1, 0)
})

watch(current, (entry) => {
  draft.value = entry?.translation ?? ''
  mtResult.value = null
})

function copy(text: string): void {
  void globalThis.navigator?.clipboard?.writeText(text)
}

function move(delta: number): void {
  position.value = Math.min(Math.max(position.value + delta, 0), Math.max(filteredEntries.value.length - 1, 0))
}

function jumpToKey(key: string): void {
  const index = filteredEntries.value.findIndex((item) => item.key === key)
  if (index >= 0) position.value = index
}

function stash(): void {
  const entry = current.value
  if (!entry) return
  actions.setTranslation(entry.key, draft.value)
  if (draft.value.trim() !== '') remember(entry.source, state.language, draft.value)
}

function saveAndStay(): void {
  stash()
}

function saveAndNext(): void {
  stash()
  move(1)
}

async function runMt(): Promise<void> {
  const entry = current.value
  if (!entry || mtBusy.value) return
  mtBusy.value = true
  try {
    mtResult.value = await translate(entry.source, state.language, mt.value)
    mtError.value = ''
  } catch (error) {
    mtResult.value = null
    mtError.value = error instanceof Error ? error.message : String(error)
  } finally {
    mtBusy.value = false
  }
}

async function signIn(): Promise<void> {
  /* The deployment hostname normally resolves the repository; the manual field is
     only shown when resolveTarget could not (local development, root pages). */
  if (state.needsTarget) {
    const [owner, repo] = repoInput.value.trim().split('/')
    actions.setTarget(owner ?? '', repo ?? '')
  }
  await actions.signIn(tokenInput.value.trim(), rememberToken.value)
}

async function openDashboard(language: string): Promise<void> {
  activeLang.value = language
  dashboardTab.value = 'overview'
  view.value = 'dashboard'
}

/* Reads every language's files once: powers the overview numbers and the
   "other languages" panel inside the translate view. */
async function loadOverview(): Promise<void> {
  if (!state.target || overviewLoaded.value) return
  overviewFailures.value = []
  const client = makeClient(state.token)
  const sourceLanguage = state.config.source.language
  const target = state.target
  const jobs: (() => Promise<void>)[] = []
  const results = new Map<string, LangStat>()
  let finished = 0

  /* state.files only ever holds source-language files, so the language set comes
     from listing the locales directory on the translation branch instead. */
  const listing = await client.get<{ name: string; path: string; type: string }[]>(
    `/repos/${target.owner}/${target.repo}/contents/${state.config.source.directory}?ref=${target.translationBranch}`,
  )
  const byLang = new Map<string, { path: string }[]>()
  for (const item of listing) {
    if (item.type !== 'file') continue
    const match = item.name.match(/^(?:app|errors)\.([A-Za-z]{2}(?:-[A-Za-z]{2,4})?)\.(?:ya?ml|json)$/)
    if (!match) continue
    byLang.set(match[1], [...(byLang.get(match[1]) ?? []), { path: item.path }])
  }

  for (const [language, files] of byLang) {
    jobs.push(async () => {
      let strings = 0
      let words = 0
      let chars = 0
      let translated = 0
      const perFile: { path: string; strings: number; translated: number }[] = []
      const keyMap = new Map<string, string>()
      for (const file of files) {
        try {
          const raw = await client.get<string>(
            `/repos/${state.target!.owner}/${state.target!.repo}/contents/${file.path}?ref=${state.target!.translationBranch}`,
            { accept: 'application/vnd.github.raw', raw: true },
          )
          const parsed = flatten(getParser(file.path).parse(raw))
          let fileStrings = 0
          let fileTranslated = 0
          for (const item of parsed) {
            const value = (item.value ?? '').trim()
            strings += 1
            fileStrings += 1
            words += value === '' ? 0 : value.split(/\s+/).length
            chars += value.length
            if (value !== '') translated += 1
            fileTranslated += value === '' ? 0 : 1
            keyMap.set(item.key, item.value ?? '')
          }
          perFile.push({ path: file.path, strings: fileStrings, translated: fileTranslated })
        } catch (error) {
          overviewFailures.value.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      entryCache.set(language, keyMap)
      results.set(language, {
        language,
        name: langName(language),
        strings,
        words,
        chars,
        translated,
        readonlyStrings: language === sourceLanguage ? strings : 0,
        files: files.map((file) => file.path),
        perFile,
      })
      finished += 1
      overviewProgress.value = `${finished}/${jobs.length}`
    })
  }

  const queue = [...jobs]
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length > 0) {
      const job = queue.shift()
      if (job) await job()
    }
  }))

  langStats.value = [...results.values()].sort((a, b) => a.language.localeCompare(b.language))
  overviewLoaded.value = true
  overviewProgress.value = ''
}

function statFor(language: string): LangStat | null {
  return langStats.value.find((item) => item.language === language) ?? null
}

async function startTranslating(language: string, file?: string): Promise<void> {
  if (state.language !== language) await actions.selectLanguage(language)
  const target = file ?? state.files.find((item) => item.language === language)?.path
  if (target && state.file !== target) await actions.selectFile(target)
  position.value = 0
  view.value = 'translate'
}

async function downloadCurrent(): Promise<void> {
  if (!current.value) return
  const content = entries.value.map((item) => `${item.key}: ${item.translation ?? ''}`).join('\n')
  await downloadTextFile(state.file ?? 'translation.txt', content)
}

async function signOut(): Promise<void> {
  actions.signOut()
  view.value = 'overview'
  overviewLoaded.value = false
  langStats.value = []
  entryCache.clear()
}

/* Panel tabs load their data on first visit. */
watch(panelTab, (tab) => {
  if (tab === 'history') void loadHistory()
  if (tab === 'comments') void loadComments()
})

/* ---- Network diagnostics on the gate: api.github.com is frequently blocked locally ---- */
interface Probe {
  name: string
  status: 'pending' | 'ok' | 'fail'
  note: string
}
const diagnostics = ref<Probe[]>([])

async function runDiagnostics(): Promise<void> {
  const probes: { name: string; run: () => Promise<string> }[] = [
    {
      name: 'api.github.com',
      run: async () => {
        const response = await fetch('https://api.github.com/zen', { signal: AbortSignal.timeout(8000) })
        return response.ok ? 'reachable' : `HTTP ${response.status}`
      },
    },
    {
      name: 'github.com',
      run: async () => {
        await fetch('https://github.com/favicon.ico', { mode: 'no-cors', signal: AbortSignal.timeout(8000) })
        return 'reachable'
      },
    },
    {
      name: 'authenticated /user',
      run: async () => {
        const response = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: 'Bearer ' + tokenInput.value.trim(),
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.timeout(8000),
        })
        if (response.status === 401) return 'token rejected (401)'
        if (!response.ok) return 'HTTP ' + response.status
        return 'reachable with credentials'
      },
    },
  ]
  diagnostics.value = probes.map((probe) => ({ name: probe.name, status: 'pending', note: 'testing…' }))
  for (let index = 0; index < probes.length; index += 1) {
    try {
      const note = await probes[index].run()
      diagnostics.value[index] = { name: probes[index].name, status: 'ok', note }
    } catch {
      diagnostics.value[index] = {
        name: probes[index].name,
        status: 'fail',
        note: 'blocked — check hosts file or proxy for this domain',
      }
    }
  }
}

onMounted(() => {
  void actions.bootstrap()
  if (state.status === 'ready') void loadOverview()
})

watch(() => state.status, (status) => {
  if (status === 'ready' && !overviewLoaded.value) void loadOverview()
})
</script>

<template>
  <div class="wz">
    <div v-if="state.status !== 'ready'" class="wz-card wz-gate">
      <h1 class="wz-gate__title">GitLocalize</h1>
      <p class="wz-gate__hint">{{ t('login.scopeHint') }}</p>
      <label class="wz-field">
        <span>GitHub</span>
        <input v-model="tokenInput" type="password" autocomplete="off" spellcheck="false" :placeholder="t('login.tokenPlaceholder')" />
      </label>
      <label v-if="state.needsTarget" class="wz-field">
        <span>{{ t('login.branch') }}</span>
        <input v-model="repoInput" autocapitalize="off" spellcheck="false" placeholder="owner/repo" />
      </label>
      <label class="wz-check"><input v-model="rememberToken" type="checkbox" />{{ t('editor.rememberToken') }}</label>
      <button class="wz-button wz-button--primary" :disabled="state.busy" @click="signIn">
        {{ state.busy ? t('editor.loading') : t('login.signIn') }}
      </button>
      <button class="wz-skip" @click="runDiagnostics">{{ t('editor.pro.runDiagnostics') }}</button>
      <ul v-if="diagnostics.length" class="wz-diag">
        <li v-for="probe in diagnostics" :key="probe.name" :class="'wz-diag--' + probe.status">
          <code>{{ probe.name }}</code> — {{ probe.note }}
        </li>
      </ul>
      <p v-if="state.error" class="wz-error">{{ t(state.error.key, state.error.params) }}<code v-if="state.error.detail" class="wz-diag__detail">{{ state.error.detail }}</code></p>
    </div>

    <template v-else>
      <header class="wz-topbar">
        <span class="wz-topbar__brand">GitLocalize</span>
        <span class="wz-topbar__crumbs">
          {{ state.repo?.owner ?? state.target?.owner }} / {{ state.repo?.name ?? state.target?.repo }}
          <template v-if="view !== 'overview'"> / {{ langName(activeLang || state.config.source.language) }}</template>
          <template v-if="view === 'translate'"> / {{ t('editor.pro.translate') }}</template>
        </span>
        <span class="wz-topbar__tools">
          <select class="wz-topbar__select" :value="uiLocale" @change="switchUiLocale" :title="t('editor.pro.uiLocale')">
            <option v-for="locale in AVAILABLE_UI_LOCALES" :key="locale" :value="locale">{{ locale }}</option>
          </select>
          <button class="wz-topbar__theme" @click="applyTheme(theme === 'dark' ? 'light' : 'dark')" :title="t('editor.pro.theme')">
            {{ theme === 'dark' ? '☀' : '☾' }}
          </button>
        </span>
        <span class="wz-topbar__badge">{{ translatedRatio }}%</span>
      </header>

      <!-- Language overview -->
      <div v-if="view === 'overview'" class="wz-body" style="grid-template-columns: 1fr">
        <main class="wz-main">
          <section class="wz-card">
            <div class="wz-card__head">
              <h2 class="wz-card__title">{{ t('editor.pro.overview') }}</h2>
              <span class="wz-suggest__tag">{{ overviewProgress }}</span>
            </div>
            <div class="wz-langs">
              <button v-for="stat in langStats" :key="stat.language" class="wz-lang" @click="openDashboard(stat.language)">
                <span class="wz-lang__name">{{ stat.name }}</span>
                <span class="wz-lang__bar">
                  <span
                    class="wz-lang__fill"
                    :style="{ width: (stat.strings > 0 ? Math.round((stat.translated / stat.strings) * 100) : 0) + '%' }"
                  ></span>
                </span>
                <span class="wz-lang__meta">
                  {{ stat.strings ? Math.round((stat.translated / stat.strings) * 100) : 0 }}% ·
                  {{ stat.translated }}/{{ stat.strings }} {{ t('editor.pro.strings') }}
                </span>
                <span v-for="entry in stat.perFile" :key="entry.path" class="wz-lang__meta wz-lang__file">
                  {{ entry.path.split('/').pop() }}: {{ entry.translated }}/{{ entry.strings }}
                </span>
              </button>
              <p v-if="overviewLoaded && langStats.length === 0" class="wz-side__muted">{{ t('editor.pro.noLangs') }}</p>
              <ul v-if="overviewFailures.length" class="wz-diag">
                <li v-for="failure in overviewFailures" :key="failure" class="wz-diag--fail">{{ failure }}</li>
              </ul>
            </div>
          </section>
        </main>
      </div>

      <!-- Language dashboard -->
      <template v-else-if="view === 'dashboard'">
        <div class="wz-nav">
          <button class="wz-iconbtn" @click="view = 'overview'">← {{ t('editor.pro.overview') }}</button>
          <div class="wz-tabs">
            <button
              v-for="tab in (['overview', 'translate', 'search', 'insights', 'files', 'actions'] as const)"
              :key="tab"
              class="wz-tab"
              :class="{ 'wz-tab--on': dashboardTab === tab }"
              @click="dashboardTab = tab"
            >
              {{ t(`editor.pro.tab.${tab}`) }}
            </button>
          </div>
        </div>

        <div class="wz-body" style="grid-template-columns: 1fr">
          <main class="wz-main">
            <section v-if="dashboardTab === 'overview'" class="wz-card">
              <h2 class="wz-card__title">{{ t('editor.pro.tab.overview') }}</h2>
              <div class="wz-states">
                <div class="wz-state">
                  <strong>{{ statFor(activeLang)?.strings ?? 0 }}</strong>
                  <span>{{ t('editor.pro.allStrings') }}</span>
                  <button class="wz-minibtn" @click="void startTranslating(activeLang)">{{ t('editor.pro.browse') }}</button>
                </div>
                <div class="wz-state">
                  <strong>{{ statFor(activeLang)?.translated ?? 0 }}</strong>
                  <span>{{ t('editor.pro.translated') }}</span>
                  <button class="wz-minibtn" @click="void startTranslating(activeLang)">{{ t('editor.pro.browse') }}</button>
                </div>
                <div class="wz-state">
                  <strong>{{ (statFor(activeLang)?.strings ?? 0) - (statFor(activeLang)?.translated ?? 0) }}</strong>
                  <span>{{ t('editor.pro.untranslated') }}</span>
                  <button class="wz-minibtn" @click="void startTranslating(activeLang)">{{ t('editor.pro.translate') }}</button>
                </div>
                <div class="wz-state">
                  <strong>{{ statFor(activeLang)?.readonlyStrings ?? 0 }}</strong>
                  <span>{{ t('editor.pro.readonly') }}</span>
                  <span class="wz-suggest__tag">{{ t('editor.pro.sourceLang') }}</span>
                </div>
              </div>
            </section>

            <section v-else-if="dashboardTab === 'translate'" class="wz-card">
              <h2 class="wz-card__title">{{ t('editor.pro.tab.translate') }}</h2>
              <p class="wz-side__muted">{{ t('editor.pro.translateHint') }}</p>
              <button class="wz-button wz-button--primary" @click="void startTranslating(activeLang)">{{ t('editor.pro.translate') }}</button>
            </section>

            <section v-else-if="dashboardTab === 'search'" class="wz-card">
              <h2 class="wz-card__title">{{ t('editor.pro.tab.search') }}</h2>
              <input v-model="state.search" class="wz-input" :placeholder="t('toolbar.searchPlaceholder')" />
              <button class="wz-button wz-button--primary" style="margin-top:10px" @click="void startTranslating(activeLang)">
                {{ t('editor.pro.searchInTranslations') }}
              </button>
            </section>

            <section v-else-if="dashboardTab === 'insights'" class="wz-card">
              <h2 class="wz-card__title">{{ t('editor.pro.tab.insights') }}</h2>
              <div class="wz-lang__bar" style="margin-bottom:8px">
                <span
                  class="wz-lang__fill"
                  :style="{
                    width:
                      statFor(activeLang) && statFor(activeLang)!.strings > 0
                        ? Math.round((statFor(activeLang)!.translated / statFor(activeLang)!.strings) * 100) + '%'
                        : '0%',
                  }"
                ></span>
              </div>
              <dl class="wz-info">
                <dt>{{ t('editor.pro.strings') }}</dt><dd>{{ statFor(activeLang)?.strings ?? 0 }}</dd>
                <dt>{{ t('editor.pro.words') }}</dt><dd>{{ statFor(activeLang)?.words ?? 0 }}</dd>
                <dt>{{ t('editor.pro.chars') }}</dt><dd>{{ statFor(activeLang)?.chars ?? 0 }}</dd>
              </dl>
            </section>

            <section v-else-if="dashboardTab === 'files'" class="wz-card">
              <h2 class="wz-card__title">{{ t('editor.pro.tab.files') }}</h2>
              <p v-for="file in statFor(activeLang)?.files ?? []" :key="file" class="wz-file">
                <code>{{ file }}</code>
                <button class="wz-minibtn" @click="void startTranslating(activeLang, file)">{{ t('editor.pro.translate') }}</button>
              </p>
            </section>

            <section v-else-if="dashboardTab === 'actions'" class="wz-card">
              <h2 class="wz-card__title">{{ t('editor.pro.tab.actions') }}</h2>
              <div class="wz-actions">
                <button class="wz-button" @click="downloadCurrent">{{ t('app.download') }}</button>
                <button class="wz-button wz-button--primary" :disabled="state.busy" @click="actions.submit()">{{ t('app.commit') }}</button>
                <button class="wz-button" @click="signOut">{{ t('app.signOut') }}</button>
              </div>
            </section>
          </main>
        </div>
      </template>

      <!-- Translate view -->
      <template v-else>
        <div class="wz-nav">
          <button class="wz-iconbtn" @click="view = 'dashboard'">← {{ langName(activeLang) }}</button>
          <div class="wz-nav__pager">
            <button class="wz-iconbtn" :disabled="position === 0" @click="position = 0">|◀</button>
            <button class="wz-iconbtn" :disabled="position === 0" @click="move(-1)">◀</button>
            <span class="wz-nav__position">
            {{ position + 1 }} / {{ filteredEntries.length }}
            <span class="wz-nav__scope" v-if="statFor(activeLang)">{{ t('editor.pro.langTotal', { total: statFor(activeLang)!.strings }) }}</span>
          </span>
            <button class="wz-iconbtn" :disabled="position >= filteredEntries.length - 1" @click="move(1)">▶</button>
            <button
              class="wz-iconbtn"
              :disabled="position >= filteredEntries.length - 1"
              @click="position = filteredEntries.length - 1"
            >▶|</button>
          </div>
          <input v-model="state.search" class="wz-search" :placeholder="t('toolbar.searchPlaceholder')" />
          <label class="wz-check wz-nav__filter">
            <input v-model="state.untranslatedOnly" type="checkbox" />{{ t('toolbar.untranslatedOnly') }}
          </label>
        </div>

        <div class="wz-body">
          <main class="wz-main">
            <section class="wz-card">
              <div class="wz-card__head">
                <code class="wz-card__key">{{ current?.key }}</code>
                <span v-if="issues.length" class="wz-pill wz-pill--warn">{{ issues.length }} ⚠</span>
              </div>

              <div class="wz-source">
                <div class="wz-source__label">
                  {{ state.config.source.language }}
                  <button class="wz-minibtn" @click="copy(current?.source ?? '')">⧉</button>
                </div>
                <p class="wz-source__text">{{ current?.source }}</p>
              </div>

              <label class="wz-source__label" for="wz-input">{{ activeLang ? langName(activeLang) : state.language }}</label>
              <textarea id="wz-input" v-model="draft" class="wz-input" rows="3" spellcheck="false"></textarea>
              <div class="wz-meta">
                <span>{{ draft.length }} {{ t('editor.pro.chars') }}</span>
                <span v-for="issue in issues" :key="issue.code" class="wz-qa">{{ t(`qa.${issue.code}`, { detail: issue.detail ?? '' }) }}</span>
              </div>

              <div class="wz-actions">
                <button class="wz-button" @click="saveAndStay">{{ t('editor.pro.saveAndStay') }}</button>
                <button class="wz-button wz-button--primary" @click="saveAndNext">{{ t('editor.pro.saveAndNext') }}</button>
                <button class="wz-button wz-button--suggest" @click="panelTab = 'suggestions'; void runMt()">{{ t('editor.pro.mtGenerate') }}</button>
                <button class="wz-skip" @click="move(1)">{{ t('editor.pro.skip') }} »</button>
              </div>
            </section>

            <section class="wz-card">
              <div class="wz-tabs">
                <button
                  v-for="tab in (['nearby', 'similar', 'occurrences', 'comments', 'suggestions', 'otherLangs', 'history'] as const)"
                  :key="tab"
                  class="wz-tab"
                  :class="{ 'wz-tab--on': panelTab === tab }"
                  @click="panelTab = tab"
                >
                  {{ t(`editor.pro.panel.${tab}`) }}
                </button>
              </div>

              <table v-if="panelTab === 'nearby'" class="wz-table">
                <thead><tr><th>Key</th><th>{{ state.config.source.language }}</th><th>{{ state.language }}</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="item in nearby" :key="item.key" :class="{ 'wz-table__row--on': item.key === current?.key }" @click="jumpToKey(item.key)">
                    <td><code>{{ item.key }}</code></td>
                    <td>{{ item.source }}</td>
                    <td>{{ item.translation || '—' }}</td>
                    <td><button class="wz-minibtn" @click.stop="copy(item.translation || item.source)">⧉</button></td>
                  </tr>
                </tbody>
              </table>

              <table v-else-if="panelTab === 'similar'" class="wz-table">
                <tbody>
                  <tr v-for="item in similarKeys" :key="item.key" @click="jumpToKey(item.key)">
                    <td><code>{{ item.key }}</code></td>
                    <td>{{ item.source }}</td>
                    <td><button class="wz-minibtn" @click.stop="copy(item.translation || item.source)">⧉</button></td>
                  </tr>
                </tbody>
              </table>

              <table v-else-if="panelTab === 'occurrences'" class="wz-table">
                <tbody>
                  <tr v-for="item in occurrences" :key="item.key" @click="jumpToKey(item.key)">
                    <td><code>{{ item.key }}</code></td>
                    <td><button class="wz-minibtn" @click.stop="copy(item.translation || item.source)">⧉</button></td>
                  </tr>
                </tbody>
              </table>

              <div v-else-if="panelTab === 'comments'" class="wz-comments">
                <p class="wz-side__muted">{{ t('editor.pro.commentsIntro') }}</p>
                <p v-if="commentsLoading" class="wz-side__muted">{{ t('editor.pro.loadingComments') }}</p>
                <p v-else-if="prComments.length === 0" class="wz-side__muted">{{ t('editor.pro.noComments') }}</p>
                <div v-for="comment in prComments" :key="comment.id" class="wz-comment">
                  <div class="wz-comment__meta">
                    <strong>{{ comment.user }}</strong>
                    <span>{{ comment.updated }}</span>
                    <a :href="comment.url" target="_blank" rel="noopener">GitHub ↗</a>
                  </div>
                  <p class="wz-comment__body">{{ comment.body }}</p>
                </div>
                <label class="wz-field">
                  <span>{{ t('editor.pro.commentNew') }}</span>
                  <textarea v-model="commentText" class="wz-input" rows="2" :placeholder="t('editor.pro.commentPlaceholder')"></textarea>
                </label>
                <button class="wz-button wz-button--primary" :disabled="commentBusy || commentText.trim() === ''" @click="postComment">
                  {{ commentBusy ? t('editor.loading') : t('editor.pro.commentPost') }}
                </button>
              </div>

              <div v-else-if="panelTab === 'suggestions'" class="wz-suggest">
                <button class="wz-button wz-button--suggest" :disabled="mtBusy" @click="runMt">
                  {{ mtBusy ? t('app.mtBusy') : t('editor.pro.mtGenerate') }}
                </button>
                <div v-if="mtResult" class="wz-suggest__card">
                  <span class="wz-suggest__tag">Machine translation</span>
                  <p>{{ mtResult }}</p>
                  <button class="wz-minibtn" @click="draft = mtResult">{{ t('editor.pro.useMt') }}</button>
                </div>
                <p v-if="mtError" class="wz-qa">{{ t('editor.pro.mtFailed', { detail: mtError }) }}</p>
                <div v-if="memoryHit" class="wz-suggest__card">
                  <span class="wz-suggest__tag">Translation memory</span>
                  <p>{{ memoryHit }}</p>
                  <button class="wz-minibtn" @click="draft = memoryHit">{{ t('editor.pro.useMt') }}</button>
                </div>
                <div v-if="twinHit" class="wz-suggest__card">
                  <span class="wz-suggest__tag">Same source</span>
                  <p>{{ twinHit }}</p>
                  <button class="wz-minibtn" @click="draft = twinHit">{{ t('editor.pro.useMt') }}</button>
                </div>
              </div>

              <table v-else-if="panelTab === 'otherLangs'" class="wz-table">
                <tbody>
                  <tr v-for="row in otherLanguages" :key="row.language">
                    <td>{{ row.name }}</td>
                    <td>{{ row.value }}</td>
                    <td><button class="wz-minibtn" @click="copy(row.value)">⧉</button></td>
                  </tr>
                </tbody>
              </table>

              <div v-else-if="panelTab === 'history'" class="wz-history">
                <p v-if="historyLoading" class="wz-side__muted">{{ t('editor.pro.loadingHistory') }}</p>
                <p v-else-if="historyEntries.length === 0" class="wz-side__muted">{{ t('editor.pro.noHistory') }}</p>
                <div v-for="entry in historyEntries" :key="entry.sha" class="wz-history__row">
                  <a :href="entry.url" target="_blank" rel="noopener"><code>{{ entry.sha }}</code></a>
                  <span class="wz-history__msg">{{ entry.message }}</span>
                  <span class="wz-history__meta">{{ entry.author }} · {{ entry.date.slice(0, 10) }}</span>
                </div>
                <a v-if="historyUrl" :href="historyUrl" target="_blank" rel="noopener" class="wz-history__all">{{ t('editor.pro.openHistory') }}</a>
              </div>
            </section>
          </main>

          <aside class="wz-side">
            <section class="wz-card">
              <h2 class="wz-card__title">{{ t('editor.pro.checks') }}</h2>
              <p v-if="issues.length === 0" class="wz-side__muted">{{ t('editor.pro.noChecks') }}</p>
              <p v-for="issue in issues" :key="issue.code" class="wz-qa">{{ t(`qa.${issue.code}`, { detail: issue.detail ?? '' }) }}</p>
            </section>

            <section class="wz-card">
              <h2 class="wz-card__title">{{ t('editor.pro.stringInfo') }}</h2>
              <dl class="wz-info">
                <dt>Key</dt><dd><code>{{ current?.key }}</code></dd>
                <dt>Source length</dt><dd>{{ current?.source.length }}</dd>
                <dt>Status</dt>
                <dd>{{ current?.translated ? t('editor.pro.translated') : t('editor.pro.untranslated') }}</dd>
                <dt>Modified</dt>
                <dd>{{ state.overrides[current?.key ?? ''] !== undefined ? 'yes' : 'no' }}</dd>
              </dl>
            </section>

            <section class="wz-card">
              <h2 class="wz-card__title">{{ t('mt.title') }}</h2>
              <select v-model="mt.provider" class="wz-input wz-input--select" @change="persistMt">
                <option value="google">Google</option>
                <option value="deepl">DeepL</option>
                <option value="none">—</option>
              </select>
            </section>
          </aside>
        </div>

        <footer class="wz-commitbar">
          <span>{{ t('table.modifiedCount', { count: Object.keys(state.overrides).length }) }}</span>
          <span v-if="state.notice" class="wz-commitbar__notice">{{ noticeText }}</span>
          <button class="wz-button wz-button--primary" :disabled="state.busy" @click="actions.submit()">
            {{ t('app.commit') }}
          </button>
        </footer>
        <p v-if="state.error" class="wz-error wz-error--bar">{{ errorText }}</p>
      </template>
    </template>
  </div>
</template>
