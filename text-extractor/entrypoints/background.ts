import { MSG_START_PICKER, type PickerMessage } from '../types';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'inspect-element-text',
      title: '提取此页面元素文本',
      contexts: ['all'],
    });
  });

  async function sendStartPicker(tabId: number): Promise<void> {
    const msg: PickerMessage = { action: MSG_START_PICKER };
    try {
      await browser.tabs.sendMessage(tabId, msg);
      return;
    } catch {
      // content script 未注入（扩展安装/重载前已打开的页面），动态注入后重试
    }
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['/content-scripts/content.js'],
      });
      await browser.tabs.sendMessage(tabId, msg);
    } catch (err) {
      console.warn('[text-extractor] 无法向该页面注入脚本', err);
    }
  }

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'inspect-element-text' && tab?.id != null) {
      void sendStartPicker(tab.id);
    }
  });

  browser.commands.onCommand.addListener((command) => {
    if (command !== 'start-picker') return;
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId != null) void sendStartPicker(tabId);
      })
      .catch(() => {});
  });
});
