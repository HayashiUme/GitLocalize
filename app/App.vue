<script setup lang="ts">
import { onMounted } from 'vue'
import Onboarding from './components/Onboarding.vue'
import SettingsView from './components/SettingsView.vue'
import TranslateView from './components/TranslateView.vue'
import { applyTheme, state } from './store'

onMounted(() => applyTheme(state.settings.theme))
</script>

<template>
  <SettingsView v-if="state.showSettings" />
  <TranslateView v-else-if="state.phase === 'translating'" />
  <Onboarding v-else />
</template>
