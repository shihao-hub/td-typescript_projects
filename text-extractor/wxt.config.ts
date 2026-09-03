import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Text Extractor & Editor',
    version: '1.0.0',
    permissions: ['activeTab', 'contextMenus', 'clipboardWrite', 'scripting'],
    host_permissions: ['<all_urls>'],
    commands: {
      'start-picker': {
        suggested_key: { default: 'Ctrl+Shift+E' },
        description: '进入元素文本点选模式',
      },
    },
  },
});
