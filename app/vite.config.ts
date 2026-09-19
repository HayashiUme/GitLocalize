import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const appDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(appDir, '..')

/* Kept out of the repository root so VuePress never picks this config up for its own build. */
export default defineConfig({
  root: appDir,
  /* Capacitor loads the bundle from a custom scheme, so every asset reference must be relative. */
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
