import { createApp } from 'vue'
import App from './App.vue'

async function bootstrap() {
  if (import.meta.env.DEV && typeof window !== 'undefined' && !window.electron) {
    await import('./devMock')
  }

  createApp(App).mount('#app')
}

bootstrap()
