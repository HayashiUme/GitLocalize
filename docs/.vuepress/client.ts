import { defineClientConfig } from 'vuepress/client'
import TranslationEditor from '../../src/components/TranslationEditor.vue'
import '../../src/styles/editor.css'

export default defineClientConfig({
  enhance({ app }) {
    app.component('TranslationEditor', TranslationEditor)
  },
})
