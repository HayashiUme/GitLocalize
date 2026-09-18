<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { pollDeviceToken, requestDeviceCode } from '../github/auth'
import { actions, useEditor } from '../state/editorStore'

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
    <h2>Sign in to translate</h2>
    <p class="glz-muted">
      The token stays in this browser. It is never sent to any server other than
      <code>api.github.com</code>, never written to the repository, and never placed in the URL.
    </p>

    <div v-if="state.needsTarget" class="glz-field-group">
      <label>
        Owner
        <input v-model="owner" placeholder="octocat" />
      </label>
      <label>
        Repository
        <input v-model="repo" placeholder="hello-world" />
      </label>
      <label>
        Translation branch
        <input v-model="branch" placeholder="i18n" />
      </label>
    </div>

    <label class="glz-field">
      Personal access token
      <input v-model="token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_..." />
    </label>

    <label class="glz-checkbox">
      <input v-model="remember" type="checkbox" />
      Keep the token in this tab only (sessionStorage). Leave off for memory-only sessions.
    </label>

    <div class="glz-actions">
      <button :disabled="!canSignIn || state.busy" @click="signIn">Sign in</button>
      <button v-if="clientId" class="glz-secondary" :disabled="state.busy" @click="startDeviceFlow">
        Use GitHub device flow
      </button>
      <button v-if="state.mock" class="glz-secondary" :disabled="state.busy" @click="actions.signIn('mock-token', false)">
        Continue with mock data
      </button>
    </div>

    <div v-if="deviceCode" class="glz-device">
      <p>
        Open <a :href="deviceCode.verificationUri" target="_blank" rel="noreferrer">{{ deviceCode.verificationUri }}</a>
        and enter <strong>{{ deviceCode.userCode }}</strong>
      </p>
      <button class="glz-secondary" @click="cancelDeviceFlow">Cancel</button>
    </div>
    <p v-if="deviceMessage" class="glz-muted">{{ deviceMessage }}</p>
    <p v-if="state.error" class="glz-error">{{ state.error }}</p>
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
</style>
