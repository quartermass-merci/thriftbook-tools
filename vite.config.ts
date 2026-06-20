import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// MV3 extension build. @crxjs wires the service worker, content scripts, and the
// popup/options HTML referenced by the manifest. The dashboard is a standalone
// extension page (opened in a tab via chrome.runtime.getURL), so it is added as
// an explicit rollup input here.
export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      input: { dashboard: 'src/dashboard/index.html' },
    },
  },
  server: { port: 5180, strictPort: true },
})
