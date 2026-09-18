<script setup lang="ts">
import { AVAILABLE_UI_LOCALES, setUiLocale, t, uiLocale } from '../i18n'

const NATIVE_NAMES: Record<string, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
}
</script>

<template>
  <label class="glz-ui-locale">
    <span>{{ t('locale.label') }}</span>
    <select :value="uiLocale" @change="setUiLocale(($event.target as HTMLSelectElement).value)">
      <option v-for="locale in AVAILABLE_UI_LOCALES" :key="locale" :value="locale">
        {{ NATIVE_NAMES[locale] ?? locale }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.glz-ui-locale {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--glz-text-muted);
}
.glz-ui-locale select {
  padding: 4px 8px;
  border: 1px solid var(--glz-border);
  border-radius: 6px;
  font-size: 12px;
  background: #fff;
  color: var(--glz-text);
}
</style>
