<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DiffPreview from './DiffPreview.vue'
import FileSelector from './FileSelector.vue'
import GitHubLogin from './GitHubLogin.vue'
import LanguageSelector from './LanguageSelector.vue'
import StatusPanel from './StatusPanel.vue'
import TranslationTable from './TranslationTable.vue'
import { actions, stats, useEditor } from '../state/editorStore'

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
    <GitHubLogin v-if="!state.user" />

    <template v-else>
      <StatusPanel />

      <div v-if="state.error" class="glz-banner glz-banner-error">
        <span>{{ state.error }}</span>
        <button v-if="state.branchMoved" class="glz-secondary" @click="actions.reload">Reload now</button>
      </div>
      <div v-else-if="state.notice" class="glz-banner glz-banner-notice">
        <span>{{ state.notice }}</span>
        <a v-if="state.lastCommitUrl" :href="state.lastCommitUrl" target="_blank" rel="noreferrer">View commit</a>
      </div>
      <div v-if="state.pullRequest" class="glz-banner glz-banner-notice">
        <span>Translation pull request #{{ state.pullRequest.number }}</span>
        <a :href="state.pullRequest.htmlUrl" target="_blank" rel="noreferrer">Open on GitHub</a>
      </div>

      <div class="glz-toolbar">
        <LanguageSelector />
        <FileSelector />
        <input v-model="state.search" class="glz-search" type="search" placeholder="Search keys or text" spellcheck="false" />
        <label class="glz-toggle">
          <input v-model="state.untranslatedOnly" type="checkbox" />
          Untranslated only
        </label>
        <button class="glz-secondary" :disabled="stats.modified === 0" @click="actions.revertAll">
          Discard {{ stats.modified || '' }}
        </button>
      </div>

      <p v-if="state.busy && state.status === 'loading'" class="glz-muted">Loading translations from GitHub...</p>
      <TranslationTable v-else />

      <div class="glz-footer">
        <span class="glz-muted">
          {{ stats.translated }} / {{ stats.total }} translated in {{ state.language }}
        </span>
        <button :disabled="stats.modified === 0 || state.busy" @click="showDiff = true">
          Submit {{ stats.modified }} translation{{ stats.modified === 1 ? '' : 's' }}
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
