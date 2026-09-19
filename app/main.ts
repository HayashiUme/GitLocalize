import './polyfills'
import { createApp } from 'vue'
import { initialiseUiLocale } from '@/i18n'
import App from './App.vue'
import './styles/app.css'

initialiseUiLocale(globalThis.location?.href ?? '')

createApp(App).mount('#app')
