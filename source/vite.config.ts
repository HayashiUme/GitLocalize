import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const appDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(appDir, '..')

export default defineConfig({
  root: appDir,
  /* Relative base: the page lives at /GitLocalize/Editor/ in production and anywhere in dev. */
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  resolve: {
    alias: { '@': path.join(rootDir, 'src') },
  },
  plugins: [vue()],
})
