import { createApp } from 'vue'
import HudApp from './HudApp.vue'

/** Mounts the Vue HUD into a host element and returns its teardown. */
export function mountHud(el: HTMLElement): () => void {
  const app = createApp(HudApp)
  app.mount(el)
  return () => {
    app.unmount()
  }
}
