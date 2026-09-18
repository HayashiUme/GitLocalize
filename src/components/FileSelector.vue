<script setup lang="ts">
import { t } from '../i18n'
import { actions, useEditor } from '../state/editorStore'

const { state } = useEditor()
</script>

<template>
  <label class="glz-select">
    <span>{{ t('toolbar.file') }}</span>
    <select
      :value="state.file"
      :disabled="state.busy"
      @change="actions.selectFile(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="file in state.files" :key="file.path" :value="file.path">{{ file.path }}</option>
    </select>
  </label>
</template>

<style scoped>
.glz-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--glz-text-muted);
}
.glz-select select {
  padding: 5px 8px;
  border: 1px solid var(--glz-border);
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: var(--glz-text);
}
.glz-hint {
  font-size: 11px;
  color: var(--glz-text-muted);
}
</style>
