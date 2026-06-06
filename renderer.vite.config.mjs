import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: resolve(process.cwd(), 'src/renderer'),
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true
  },
  resolve: {
    alias: {
      '@renderer': resolve(process.cwd(), 'src/renderer/src')
    }
  },
  plugins: [vue()]
})
