import { defineManifest } from '@crxjs/vite-plugin'

const icons = {
  '16': 'icons/icon-16.png',
  '32': 'icons/icon-32.png',
  '48': 'icons/icon-48.png',
  '128': 'icons/icon-128.png',
}

export default defineManifest({
  manifest_version: 3,
  name: 'Thriftbook Tools',
  version: '1.1.0',
  description:
    'Power tools for your ThriftBooks wishlist: filters, price history, a free-book finder, a deals scanner, dedupe, and a publisher/author catalog finder. Unofficial.',
  minimum_chrome_version: '116',
  icons,
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: icons,
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://www.thriftbooks.com/list/*'],
      js: ['src/content/thriftbooks.content.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'alarms', 'notifications', 'unlimitedStorage'],
  host_permissions: ['https://www.thriftbooks.com/*', 'https://openlibrary.org/*'],
  web_accessible_resources: [
    {
      resources: ['icons/*'],
      matches: ['https://www.thriftbooks.com/*'],
    },
  ],
})
