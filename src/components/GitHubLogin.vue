<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { pollDeviceToken, requestDeviceCode } from '../github/auth'
import { t } from '../i18n'
import { actions, errorText, useEditor } from '../state/editorStore'

const { state } = useEditor()
const token = ref('')
const remember = ref(false)
const owner = ref('')
const repo = ref('')
const branch = ref('')
const deviceMessage = ref('')
const deviceCode = ref<{ userCode: string; verificationUri: string; deviceCode: string } | null>(null)
const abortController = ref<AbortController | null>(null)

const clientId = computed(() => state.config.editor?.deviceFlowClientId ?? state.target?.deviceFlowClientId ?? '')
const canSignIn = computed(() => token.value.trim().length > 0 && (state.target !== null || targetFilled.value))
const targetFilled = computed(() => owner.value.trim().length > 0 && repo.value.trim().length > 0)

onMounted(() => {
  if (state.target) {
    owner.value = state.target.owner
    repo.value = state.target.repo
    branch.value = state.target.translationBranch
  }
})

function applyTarget(): void {
  if (targetFilled.value) actions.setTarget(owner.value.trim(), repo.value.trim(), branch.value.trim() || undefined)
}

async function signIn(): Promise<void> {
  applyTarget()
  await actions.signIn(token.value, remember.value)
}

async function startDeviceFlow(): Promise<void> {
  applyTarget()
  deviceMessage.value = ''
  try {
    const response = await requestDeviceCode(clientId.value, 'public_repo')
    deviceCode.value = {
      userCode: response.user_code,
      verificationUri: response.verification_uri,
      deviceCode: response.device_code,
    }
    abortController.value = new AbortController()
    deviceMessage.value = 'Waiting for approval in the browser...'
    const accessToken = await pollDeviceToken(clientId.value, response.device_code, {
      intervalSeconds: response.interval,
      signal: abortController.value.signal,
      onTick: (message) => {
        deviceMessage.value = message
      },
    })
    await actions.signIn(accessToken, false)
  } catch (error) {
    deviceMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    deviceCode.value = null
  }
}

function cancelDeviceFlow(): void {
  abortController.value?.abort()
  deviceMessage.value = ''
}
</script>

<template>
  <section class="glz-login">
    <h2>{{ t('login.title') }}</h2>
    <p class="glz-muted">{{ t('login.privacy') }}</p>

    <div v-if="state.needsTarget" class="glz-field-group">
      <label>
        {{ t('login.owner') }}
        <input v-model="owner" placeholder="octocat" />
      </label>
      <label>
        {{ t('login.repository') }}
        <input v-model="repo" placeholder="hello-world" />
      </label>
      <label>
        {{ t('login.branch') }}
        <input v-model="branch" placeholder="i18n" />
      </label>
    </div>

    <label class="glz-field">
      {{ t('login.tokenLabel') }}
      <input
        v-model="token"
        type="password"
        autocomplete="off"
        spellcheck="false"
        :placeholder="t('login.tokenPlaceholder')"
      />
    </label>
    <p class="glz-muted glz-hint">
      <span>{{ t('login.scopeHint') }}</span>
      <RouterLink to="/guide/token.md">{{ t('login.tokenGuide') }}</RouterLink>
    </p>

    <label class="glz-checkbox">
      <input v-model="remember" type="checkbox" />
      {{ t('login.remember') }}
    </label>

    <div class="glz-actions">
      <button :disabled="!canSignIn || state.busy" @click="signIn">{{ t('login.signIn') }}</button>
      <button v-if="clientId" class="glz-secondary" :disabled="state.busy" @click="startDeviceFlow">
        {{ t('login.deviceFlow') }}
      </button>
      <button v-if="state.mock" class="glz-secondary" :disabled="state.busy" @click="actions.signIn('mock-token', false)">
        {{ t('login.mock') }}
      </button>
    </div>

    <div v-if="deviceCode" class="glz-device">
      <p>{{ t('login.devicePrompt', { code: deviceCode.userCode }) }}</p>
      <div class="glz-device-actions">
        <a :href="deviceCode.verificationUri" target="_blank" rel="noreferrer">{{ t('login.deviceOpenPage') }}</a>
        <button class="glz-secondary" @click="cancelDeviceFlow">{{ t('login.deviceCancel') }}</button>
      </div>
    </div>
    <p v-if="deviceMessage" class="glz-muted">{{ deviceMessage }}</p>
    <p v-if="errorText" class="glz-error">{{ errorText }}</p>
  </section>
</template>

<style scoped>
.glz-login {
  border: 1px solid var(--glz-border);
  border-radius: 10px;
  padding: 20px;
  background: var(--glz-surface);
}
.glz-field,
.glz-field-group label {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--glz-text-muted);
}
.glz-field-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.glz-login input[type='text'],
.glz-login input[type='password'],
.glz-field-group input {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 7px 9px;
  border: 1px solid var(--glz-border);
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: var(--glz-text);
}
.glz-checkbox {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  color: var(--glz-text-muted);
  margin-bottom: 14px;
}
.glz-hint {
  margin: -6px 0 14px;
  line-height: 1.6;
}
.glz-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.glz-device {
  margin-top: 14px;
  padding: 12px;
  border: 1px dashed var(--glz-border);
  border-radius: 8px;
  font-size: 13px;
}
.glz-device-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.glz-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: #8a2c2c;
}
</style>
