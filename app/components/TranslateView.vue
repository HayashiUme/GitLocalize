<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { actions, hasChanges, issuesByKey, repoLabel, state, stats, visibleEntries } from '../store'

const progress = computed(() =>
  t('editor.progress', {
    translated: stats.value.translated,
    total: stats.value.total,
    language: state.language,
  }),
)

function issuesFor(key: string) {
  return issuesByKey.value.get(key) ?? []
}

function onLanguage(event: Event): void {
  actions.selectLanguage((event.target as HTMLSelectElement).value)
}

function onFile(event: Event): void {
  actions.selectFile((event.target as HTMLSelectElement).value)
}

function onEdit(key: string, event: Event): void {
  actions.setTranslation(key, (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <main class="glz-app">
    <header class="glz-app__header">
      <div>
        <h1 class="glz-app__title">{{ repoLabel }}</h1>
        <p class="glz-app__subtitle">{{ state.target?.branch }}</p>
      </div>
      <button class="glz-icon" @click="actions.toggleSettings(true)">{{ t('app.settings') }}</button>
    </header>

    <p v-if="state.restored" class="glz-notice glz-notice--warn">{{ t('app.restored') }}</p>

    <section class="glz-card">
      <div class="glz-form">
        <label class="glz-field">
          <span>{{ t('toolbar.language') }}</span>
          <select :value="state.language" @change="onLanguage">
            <option v-for="language in state.languages" :key="language" :value="language">{{ language }}</option>
          </select>
        </label>

        <label class="glz-field">
          <span>{{ t('toolbar.file') }}</span>
          <select :value="state.file" @change="onFile">
            <option v-for="file in state.files" :key="file" :value="file">{{ file }}</option>
          </select>
        </label>

        <label class="glz-field">
          <span>{{ t('toolbar.searchPlaceholder') }}</span>
          <input v-model="state.search" autocapitalize="off" spellcheck="false" />
        </label>

        <label class="glz-toggle">
          <input v-model="state.untranslatedOnly" type="checkbox" />
          {{ t('toolbar.untranslatedOnly') }}
        </label>
      </div>
    </section>

    <p class="glz-progress">{{ progress }}</p>

    <section class="glz-entries">
      <article v-for="entry in visibleEntries" :key="entry.key" class="glz-entry">
        <p class="glz-entry__key">{{ entry.key }}</p>
        <p class="glz-entry__source">{{ entry.source }}</p>
        <textarea
          :value="entry.translation"
          rows="2"
          autocapitalize="off"
          spellcheck="false"
          @input="onEdit(entry.key, $event)"
        />
        <p v-for="issue in issuesFor(entry.key)" :key="issue.code" class="glz-entry__issue">
          {{ t(`qa.${issue.code}`, { detail: issue.detail ?? '' }) }}
        </p>
      </article>
      <p v-if="visibleEntries.length === 0" class="glz-note">{{ t('table.empty') }}</p>
    </section>

    <footer v-if="hasChanges" class="glz-commit">
      <span class="glz-commit__count">{{ t('table.modifiedCount', { count: stats.modified }) }}</span>
      <button class="glz-link" @click="actions.revert()">{{ t('diff.cancel') }}</button>
      <button class="glz-primary" :disabled="state.busy" @click="actions.submit()">{{ t('app.commit') }}</button>
    </footer>

    <p v-if="state.notice" class="glz-notice">{{ t(state.notice, { branch: state.target?.branch ?? '' }) }}</p>
    <p v-if="state.error" class="glz-notice glz-notice--error">{{ t(state.error) }}</p>

    <button class="glz-link glz-link--quiet" @click="actions.disconnect()">{{ t('app.signOut') }}</button>
  </main>
</template>
