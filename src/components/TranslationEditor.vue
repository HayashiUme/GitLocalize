<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DiffPreview from './DiffPreview.vue'
import FileSelector from './FileSelector.vue'
import GitHubLogin from './GitHubLogin.vue'
import LanguageSelector from './LanguageSelector.vue'
import StatusPanel from './StatusPanel.vue'
import TranslationTable from './TranslationTable.vue'
import LocaleSwitcher from '../i18n/LocaleSwitcher.vue'
import { t, tp } from '../i18n'
import { actions, errorText, noticeText, stats, useEditor } from '../state/editorStore'

const { state } = useEditor()
const showDiff = ref(false)

const hasUnsaved = computed(() => stats.value.modified > 0)

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsaved.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  globalThis.addEventListener?.('beforeunload', beforeUnload)
  void actions.bootstrap()
})

onBeforeUnmount(() => {
  globalThis.removeEventListener?.('beforeunload', beforeUnload)
})

async function confirmSubmit(): Promise<void> {
  await actions.submit()
  showDiff.value = false
}
</script>

<template>
  <div class="glz-editor">
    <div class="glz-editor-head">
      <LocaleSwitcher />
    </div>

    <GitHubLogin v-if="!state.user" />

    <template v-else>
      <StatusPanel />

      <div v-if="state.error" class="glz-banner glz-banner-error">
        <span>
          {{ errorText }}
          <em v-if="state.branchMoved">{{ t('error.conflict.reloadRequired') }}</em>
          <small v-if="state.error.detail">{{ state.error.detail }}</small>
        </span>
        <button v-if="state.branchMoved" class="glz-secondary" @click="actions.reload">
          {{ t('editor.reloadNow') }}
        </button>
      </div>
      <div v-else-if="state.notice" class="glz-banner glz-banner-notice">
        <span>{{ noticeText }}</span>
        <a v-if="state.lastCommitUrl" :href="state.lastCommitUrl" target="_blank" rel="noreferrer">
          {{ t('editor.viewCommit') }}
        </a>
      </div>
      <div v-if="state.pullRequest" class="glz-banner glz-banner-notice">
        <span>{{ t('editor.pullRequest', { number: state.pullRequest.number }) }}</span>
        <a :href="state.pullRequest.htmlUrl" target="_blank" rel="noreferrer">{{ t('editor.openOnGitHub') }}</a>
      </div>

      <div class="glz-toolbar">
        <LanguageSelector />
        <FileSelector />
        <input
          v-model="state.search"
          class="glz-search"
          type="search"
          :placeholder="t('toolbar.searchPlaceholder')"
          spellcheck="false"
        />
        <label class="glz-toggle">
          <input v-model="state.untranslatedOnly" type="checkbox" />
          {{ t('toolbar.untranslatedOnly') }}
        </label>
        <button class="glz-secondary" :disabled="stats.modified === 0" @click="actions.revertAll">
          {{ t('toolbar.discard', { count: stats.modified }) }}
        </button>
      </div>

      <p v-if="state.busy && state.status === 'loading'" class="glz-muted">{{ t('editor.loading') }}</p>
      <TranslationTable v-else />

      <div class="glz-footer">
        <span class="glz-muted">
          {{ t('editor.progress', { translated: stats.translated, total: stats.total, language: state.language }) }}
        </span>
        <button :disabled="stats.modified === 0 || state.busy" @click="showDiff = true">
          {{ tp('editor.submit', stats.modified) }}
        </button>
      </div>

      <DiffPreview v-if="showDiff" @cancel="showDiff = false" @confirm="confirmSubmit" />
    </template>
  </div>
</template>

<style scoped>
.glz-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 24px 0;
}
.glz-editor-head {
  display: flex;
  justify-content: flex-end;
}
.glz-banner em {
  display: block;
  font-style: normal;
  opacity: 0.85;
}
.glz-banner small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.7;
  word-break: break-word;
}
.glz-toolbar {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}
.glz-search {
  flex: 1 1 200px;
  min-width: 160px;
  padding: 6px 10px;
  border: 1px solid var(--glz-border);
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: var(--glz-text);
}
.glz-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--glz-text-muted);
  white-space: nowrap;
}
.glz-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.glz-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid;
}
.glz-banner-error {
  border-color: #f0c2c2;
  background: #fdecec;
  color: #8a2c2c;
}
.glz-banner-notice {
  border-color: #c8e2d2;
  background: #eaf7ef;
  color: #1c5f34;
}
</style>
