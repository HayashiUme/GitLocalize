<script setup lang="ts">
import { t } from '../i18n'
import { actions, useEditor } from '../state/editorStore'

const { state } = useEditor()
</script>

<template>
  <label class="glz-select">
    <span>{{ t('toolbar.language') }}</span>
    <select
      :value="state.language"
      :disabled="state.busy"
      @change="actions.selectLanguage(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="language in state.languages" :key="language" :value="language">{{ language }}</option>
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
</style>
