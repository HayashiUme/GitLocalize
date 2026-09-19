<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@/i18n'
import LocaleSwitcher from '@/i18n/LocaleSwitcher.vue'
import { actions, savedTarget, state } from '../store'

/* The repository is remembered; the token never is. */
const repoInput = ref(savedTarget ? `${savedTarget.owner}/${savedTarget.repo}` : '')
const token = ref('')
const branch = ref(savedTarget?.branch ?? '')
const guideOpen = ref(false)

function submit(): void {
  actions.connect({ repoInput: repoInput.value, token: token.value, branch: branch.value })
}
</script>

<template>
  <main class="glz-app">
    <header class="glz-app__header">
      <div>
        <h1 class="glz-app__title">{{ t('name') }}</h1>
        <p class="glz-app__subtitle">{{ t('tagline') }}</p>
      </div>
      <LocaleSwitcher />
    </header>

    <section class="glz-card">
      <h2 class="glz-card__title">{{ t('onboarding.title') }}</h2>

      <div class="glz-form">
        <label class="glz-field">
          <span>{{ t('onboarding.repositoryLabel') }}</span>
          <input
            v-model="repoInput"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('onboarding.repositoryPlaceholder')"
          />
        </label>

        <label class="glz-field">
          <span>{{ t('login.tokenLabel') }}</span>
          <input
            v-model="token"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('login.tokenPlaceholder')"
          />
        </label>

        <label class="glz-field">
          <span>{{ t('login.branch') }}</span>
          <input v-model="branch" autocapitalize="off" spellcheck="false" placeholder="i18n" />
        </label>

        <p class="glz-hint">{{ t('login.scopeHint') }}</p>

        <button class="glz-primary" :disabled="state.busy" @click="submit">
          {{ state.busy ? t('onboarding.connecting') : t('onboarding.connect') }}
        </button>

        <button class="glz-link" @click="guideOpen = !guideOpen">{{ t('onboarding.guideLink') }}</button>

        <ol v-if="guideOpen" class="glz-guide">
          <li>{{ t('onboarding.guideStep1') }}</li>
          <li>{{ t('onboarding.guideStep2') }}</li>
          <li>{{ t('onboarding.guideStep3') }}</li>
        </ol>
      </div>
    </section>

    <p class="glz-note">{{ t('login.privacy') }}</p>
    <p v-if="state.warning" class="glz-notice glz-notice--warn">{{ t(state.warning) }}</p>
    <p v-if="state.error" class="glz-notice glz-notice--error">{{ t(state.error) }}</p>

    <button class="glz-link glz-link--quiet" @click="actions.toggleSettings(true)">{{ t('app.settings') }}</button>
  </main>
</template>
