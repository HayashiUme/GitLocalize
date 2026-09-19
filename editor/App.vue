<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { t } from '@/i18n'
import { translate, type MtSettings } from '@/mt'
import { remember, suggest } from '@/mt/memory'
import { useEditor } from '@/state/editorStore'
import type { TranslationEntry } from '@/types'

const { state, entries, filteredEntries, issuesByKey, stats, errorText, noticeText, actions } = useEditor()

function persistMt(): void {
  globalThis.localStorage?.setItem(MT_KEY, JSON.stringify(mt.value))
}

const ownerInput = ref('')
const repoInput = ref('')
const tokenInput = ref('')
const rememberToken = ref(false)

/* Single-string focus: everything revolves around the entry at this position. */
const position = ref(0)
const draft = ref('')
const tab = ref<'nearby' | 'suggestions'>('nearby')

const MT_KEY = 'gitlocalize.editor.mt'
const mt = ref<MtSettings>(loadMt())
const mtBusy = ref(false)
const mtResult = ref<string | null>(null)

function loadMt(): MtSettings {
  try {
    const raw = globalThis.localStorage?.getItem(MT_KEY)
    return raw ? (JSON.parse(raw) as MtSettings) : { provider: 'google', deeplKey: '' }
  } catch {
    return { provider: 'google', deeplKey: '' }
  }
}

const current = computed<TranslationEntry | null>(() => filteredEntries.value[position.value] ?? null)
const issues = computed(() => (current.value ? (issuesByKey.value.get(current.value.key) ?? []) : []))
const translatedRatio = computed(() =>
  stats.value.total > 0 ? Math.round((stats.value.translated / stats.value.total) * 100) : 0,
)

const memoryHit = computed(() => (current.value ? suggest(current.value.source, state.language) : null))

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
  return entries.value.slice(Math.max(0, index - 2), index + 3)
})

watch(current, (entry) => {
  draft.value = entry?.translation ?? ''
  mtResult.value = null
})

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
  } catch {
    mtResult.value = null
  } finally {
    mtBusy.value = false
  }
}

async function signIn(): Promise<void> {
  actions.setTarget(ownerInput.value.trim(), repoInput.value.trim())
  await actions.signIn(tokenInput.value.trim(), rememberToken.value)
}

function copy(text: string): void {
  void globalThis.navigator?.clipboard?.writeText(text)
}

onMounted(() => void actions.bootstrap())
</script>

<template>
  <div class="wz">
    <!-- Signed out: token + target, mirroring the old editor's bootstrap flow -->
    <div v-if="state.status !== 'ready'" class="wz-card wz-gate">
      <h1 class="wz-gate__title">GitLocalize</h1>
      <p class="wz-gate__hint">{{ t('login.scopeHint') }}</p>
      <label class="wz-field">
        <span>GitHub</span>
        <input v-model="tokenInput" type="password" autocomplete="off" spellcheck="false" :placeholder="t('login.tokenPlaceholder')" />
      </label>
      <label class="wz-field">
        <span>{{ t('login.branch') }}</span>
        <input v-model="repoInput" autocapitalize="off" spellcheck="false" placeholder="owner/repo" />
      </label>
      <label class="wz-check"><input v-model="rememberToken" type="checkbox" />{{ t('login.rememberToken') }}</label>
      <button class="wz-button wz-button--primary" :disabled="state.busy" @click="signIn">
        {{ state.busy ? t('editor.loading') : t('login.signIn') }}
      </button>
      <p v-if="state.error" class="wz-error">{{ t(state.error.key, state.error.params) }}</p>
    </div>

    <template v-else>
      <!-- Dark top bar: identity, breadcrumb, live progress -->
      <header class="wz-topbar">
        <span class="wz-topbar__brand">GitLocalize</span>
        <span class="wz-topbar__crumbs">
          {{ state.target?.owner }} / {{ state.target?.repo }} / {{ state.language }} /
          {{ t('editor.pro.translate') }}
        </span>
        <span class="wz-topbar__badge">{{ translatedRatio }}%</span>
      </header>

      <!-- Position / filter toolbar -->
      <div class="wz-nav">
        <div class="wz-nav__pager">
          <button class="wz-iconbtn" :disabled="position === 0" @click="position = 0">|◀</button>
          <button class="wz-iconbtn" :disabled="position === 0" @click="move(-1)">◀</button>
          <span class="wz-nav__position">{{ position + 1 }} / {{ filteredEntries.length }}</span>
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
          <!-- Focused string card -->
          <section class="wz-card">
            <div class="wz-card__head">
              <code class="wz-card__key">{{ current?.key }}</code>
              <span v-if="issues.length" class="wz-pill wz-pill--warn">{{ issues.length }} ⚠</span>
            </div>

            <div class="wz-source">
              <div class="wz-source__label">English <button class="wz-minibtn" @click="copy(current?.source ?? '')">⧉</button></div>
              <p class="wz-source__text">{{ current?.source }}</p>
            </div>

            <label class="wz-source__label" :for="'wz-input'">{{ state.language }}</label>
            <textarea id="wz-input" v-model="draft" class="wz-input" rows="3" spellcheck="false"></textarea>
            <div class="wz-meta">
              <span>{{ draft.length }} {{ t('editor.pro.chars') }}</span>
              <span v-for="issue in issues" :key="issue.code" class="wz-qa">{{ t(`qa.${issue.code}`, { detail: issue.detail ?? '' }) }}</span>
            </div>

            <div class="wz-actions">
              <button class="wz-button" @click="saveAndStay">{{ t('editor.pro.saveAndStay') }}</button>
              <button class="wz-button wz-button--primary" @click="saveAndNext">{{ t('editor.pro.saveAndNext') }}</button>
              <button class="wz-button wz-button--suggest" @click="tab = 'suggestions'">{{ t('editor.pro.suggest') }}</button>
              <button class="wz-skip" @click="move(1)">{{ t('editor.pro.skip') }} »</button>
            </div>
          </section>

          <!-- Nearby strings / automatic suggestions -->
          <section class="wz-card">
            <div class="wz-tabs">
              <button class="wz-tab" :class="{ 'wz-tab--on': tab === 'nearby' }" @click="tab = 'nearby'">
                {{ t('editor.pro.nearby') }}
              </button>
              <button class="wz-tab" :class="{ 'wz-tab--on': tab === 'suggestions' }" @click="tab = 'suggestions'">
                {{ t('editor.pro.suggestions') }}
              </button>
            </div>

            <table v-if="tab === 'nearby'" class="wz-table">
              <thead>
                <tr><th>Key</th><th>English</th><th>{{ state.language }}</th><th></th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in nearby"
                  :key="item.key"
                  :class="{ 'wz-table__row--on': item.key === current?.key }"
                  @click="jumpToKey(item.key)"
                >
                  <td><code>{{ item.key }}</code></td>
                  <td>{{ item.source }}</td>
                  <td>{{ item.translation || '—' }}</td>
                  <td><button class="wz-minibtn" @click.stop="copy(item.translation || item.source)">⧉</button></td>
                </tr>
              </tbody>
            </table>

            <div v-else class="wz-suggest">
              <button class="wz-button wz-button--suggest" :disabled="mtBusy" @click="runMt">
                {{ mtBusy ? t('app.mtBusy') : t('editor.pro.mtGenerate') }}
              </button>
              <div v-if="mtResult" class="wz-suggest__card">
                <span class="wz-suggest__tag">Machine translation</span>
                <p>{{ mtResult }}</p>
                <button class="wz-minibtn" @click="draft = mtResult">{{ t('editor.pro.useMt') }}</button>
              </div>
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

      <!-- Commit bar: staged changes reach the repository from here -->
      <footer class="wz-commitbar">
        <span>{{ t('table.modifiedCount', { count: Object.keys(state.overrides).length }) }}</span>
        <span v-if="state.notice" class="wz-commitbar__notice">{{ noticeText }}</span>
        <button class="wz-button wz-button--primary" :disabled="state.busy" @click="actions.submit()">
          {{ t('app.commit') }}
        </button>
      </footer>
      <p v-if="state.error" class="wz-error wz-error--bar">{{ t(state.error.key, state.error.params) }}</p>
    </template>
  </div>
</template>
