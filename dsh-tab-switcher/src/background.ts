/**
 * DSH Tab Switcher - Background Service Worker
 * 核心目标：精准过滤并切换至 127.0.0.1:11111，杜绝其他 DeepSeek 网页干扰。
 * 行为原则：坚决停留在 DSH 标签页，绝不擅自切回其他页面。
 */

// 严格前缀匹配（Chrome Match Pattern 不支持在 host 中指定端口号，故采用 JS 精准 URL 过滤）
const DSH_URL_PREFIXES = [
  "http://127.0.0.1:11111/",
  "http://localhost:11111/",
];

/**
 * 判断标签页 URL 是否属于 DeepSeek Harness
 */
function isDshTab(url?: string): boolean {
  if (!url) return false;
  return DSH_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * 执行切换至 DeepSeek Harness 核心函数
 */
async function activateDshTab(): Promise<void> {
  try {
    const currentWindow = await chrome.windows.getCurrent({ populate: true });
    const currentTab = currentWindow.tabs?.find((t) => t.active);
    const windowId = currentWindow.id;

    // 1. 获取全量标签页，严格匹配端口 11111
    const allTabs = await chrome.tabs.query({});
    const dshTabs = allTabs.filter((t) => isDshTab(t.url));

    if (!dshTabs || dshTabs.length === 0) {
      showBadge("?", "#f59e0b");
      return;
    }

    // 优先选择属于当前活动窗口的 DSH 标签页；若不在当前窗口，则选择第一个匹配项
    let targetTab = dshTabs.find((t) => t.windowId === windowId);
    let needSwitchWindow = false;

    if (!targetTab) {
      targetTab = dshTabs[0];
      needSwitchWindow = true;
    }

    if (!targetTab || targetTab.id === undefined) {
      return;
    }

    // 2. 若已经在目标标签页上，保持激活并刷新焦点，绝不切走
    if (!needSwitchWindow && currentTab && currentTab.id === targetTab.id) {
      showBadge("DSH", "#10b981");
      return;
    }

    // 3. 激活目标窗口与目标标签页
    if (needSwitchWindow && targetTab.windowId !== undefined) {
      await chrome.windows.update(targetTab.windowId, { focused: true });
    }
    await chrome.tabs.update(targetTab.id, { active: true });
    showBadge("OK", "#10b981");
  } catch (error) {
    console.error("[DSH Tab Switcher] 切换异常:", error);
  }
}

/**
 * 轻量状态角标提示 (1.5 秒后自动清除)
 */
function showBadge(text: string, color: string): void {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
    }, 1500);
  } catch {
    // 忽略后台挂起异常
  }
}

// 监听快捷键命令 (由 AHK 触发或用户手动按下)
chrome.commands.onCommand.addListener((command) => {
  if (command === "switch-to-dsh") {
    activateDshTab();
  }
});

// 监听扩展图标点击
chrome.action.onClicked.addListener(() => {
  activateDshTab();
});
