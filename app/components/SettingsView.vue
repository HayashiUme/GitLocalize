<script setup lang="ts">
import { t } from '@/i18n'
import LocaleSwitcher from '@/i18n/LocaleSwitcher.vue'
import { actions, state, type MtSettings, type Settings } from '../store'

const THEMES: Settings['theme'][] = ['system', 'light', 'dark']
const LABELS: Record<Settings['theme'], string> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
}

function onTheme(event: Event): void {
  actions.updateSettings({ theme: (event.target as HTMLSelectElement).value as Settings['theme'] })
}

function onProvider(event: Event): void {
  actions.updateMt({ provider: (event.target as HTMLSelectElement).value as MtSettings['provider'] })
}

function onDeeplKey(event: Event): void {
  actions.updateMt({ deeplKey: (event.target as HTMLInputElement).value })
}
</script>

<template>
  <main class="glz-app">
    <header class="glz-app__header">
      <h1 class="glz-app__title">{{ t('settings.title') }}</h1>
      <button class="glz-link" @click="actions.toggleSettings(false)">{{ t('settings.close') }}</button>
    </header>

    <section class="glz-card">
      <h2 class="glz-card__title">{{ t('settings.appearance') }}</h2>
      <div class="glz-form">
        <label class="glz-field">
          <span>{{ t('settings.theme') }}</span>
          <select :value="state.settings.theme" @change="onTheme">
            <option v-for="theme in THEMES" :key="theme" :value="theme">{{ t(LABELS[theme]) }}</option>
          </select>
        </label>

        <div class="glz-field">
          <span>{{ t('locale.label') }}</span>
          <LocaleSwitcher />
        </div>
      </div>
    </section>
    <section class="glz-card">
      <h2 class="glz-card__title">{{ t('mt.title') }}</h2>
      <div class="glz-form">
        <label class="glz-field">
          <span>{{ t('mt.provider') }}</span>
          <select :value="state.mt.provider" @change="onProvider">
            <option value="google">{{ t('mt.providerGoogle') }}</option>
            <option value="deepl">{{ t('mt.providerDeepl') }}</option>
            <option value="none">{{ t('mt.providerNone') }}</option>
          </select>
        </label>

        <label v-if="state.mt.provider === 'deepl'" class="glz-field">
          <span>{{ t('mt.deeplKey') }}</span>
          <input
            type="password"
            autocomplete="off"
            spellcheck="false"
            :value="state.mt.deeplKey"
            :placeholder="t('mt.deeplKeyPlaceholder')"
            @change="onDeeplKey"
          />
          <span class="glz-hint">{{ t('mt.deeplKeyHint') }}</span>
        </label>
      </div>
    </section>
  </main>
</template>
