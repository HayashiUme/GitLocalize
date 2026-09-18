<script setup lang="ts">
import { computed } from 'vue'
import { t, tp } from '../i18n'
import { changes, stats, useEditor } from '../state/editorStore'

const { state } = useEditor()
const emit = defineEmits<{ cancel: []; confirm: [] }>()

const preview = computed(() => changes.value)
const branch = computed(() => state.target?.translationBranch ?? '')
</script>

<template>
  <div class="glz-modal-backdrop" @click.self="emit('cancel')">
    <div class="glz-modal">
      <header>
        <h3>{{ tp('diff.review', stats.modified) }}</h3>
        <p class="glz-muted">
          {{ t('diff.committing', { branch, login: state.user?.login ?? '' }) }}
        </p>
      </header>
      <div class="glz-diff">
        <div v-for="item in preview" :key="item.key" class="glz-diff-item">
          <div class="glz-diff-key">{{ item.key }}</div>
          <div class="glz-diff-line glz-removed">- {{ item.oldValue || t('diff.oldEmpty') }}</div>
          <div class="glz-diff-line glz-added">+ {{ item.newValue || t('diff.newEmpty') }}</div>
        </div>
        <p v-if="stats.warnings > 0" class="glz-warn">
          ⚠ {{ tp('diff.warnings', stats.warnings) }}
        </p>
      </div>
      <footer>
        <button class="glz-secondary" @click="emit('cancel')">{{ t('diff.cancel') }}</button>
        <button :disabled="state.busy" @click="emit('confirm')">{{ t('diff.confirm', { branch }) }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.glz-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 32, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 60;
}
.glz-modal {
  width: min(680px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--glz-surface);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 18px 48px rgba(15, 20, 30, 0.28);
}
.glz-modal h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.glz-diff {
  overflow: auto;
  margin: 14px 0;
  border: 1px solid var(--glz-border);
  border-radius: 8px;
}
.glz-diff-item {
  padding: 8px 12px;
  border-bottom: 1px solid var(--glz-border-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.glz-diff-item:last-child {
  border-bottom: none;
}
.glz-diff-key {
  color: var(--glz-text-muted);
  margin-bottom: 3px;
}
.glz-diff-line {
  white-space: pre-wrap;
  word-break: break-word;
}
.glz-removed {
  color: #8a2c2c;
  background: #fdecec;
}
.glz-added {
  color: #1c5f34;
  background: #eaf7ef;
}
.glz-modal footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
