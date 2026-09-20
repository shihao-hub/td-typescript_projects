import { defineConfig } from '@playwright/test';

// Demo 配置：直接复用系统已装的 Chrome（channel: 'chrome'），免去 npx playwright install 下载浏览器
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  reporter: 'list',
  use: {
    channel: 'chrome',
    // 有头模式：能亲眼看到浏览器被自动化驱动的全过程
    headless: false,
    viewport: { width: 1280, height: 800 },
  },
});
