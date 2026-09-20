import { test, expect } from '@playwright/test';

// 被测对象：父仓库 docs 静态站点（build 产物，file:// 直开）
const SITE = 'file:///D:/Users/language_projects/.mkdocs-site/index.html';

test.describe('docs 静态站点 E2E', () => {
  test('首页标题正确', async ({ page }) => {
    await page.goto(SITE);
    await expect(page).toHaveTitle(/language_projects 文档库/);
  });

  test('导航树包含关键中文条目', async ({ page }) => {
    await page.goto(SITE);
    const nav = page.locator('.md-sidebar--primary');
    await expect(nav.locator('text=CLI 工具开发标准')).toBeVisible();
    await expect(nav.locator('text=docs 阅读体验调研')).toBeVisible();
  });

  test('点击导航条目跳转到调研笔记页', async ({ page }) => {
    await page.goto(SITE);
    await page.click('.md-sidebar--primary >> text=docs 阅读体验调研');
    await expect(page.locator('h1')).toContainText('docs 阅读体验调研');
  });

  test('5 层深层页面可达（specs 目录）', async ({ page }) => {
    await page.goto(
      'file:///D:/Users/language_projects/.mkdocs-site/projects/go_projects/liteconf/specs/01-liteconf/design.html',
    );
    await expect(page.locator('h1')).toBeVisible();
  });
});
