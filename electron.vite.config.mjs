import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [vue()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) }
  }
})
