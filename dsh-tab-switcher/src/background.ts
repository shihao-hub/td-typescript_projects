/**
 * DSH Tab Switcher - Background Service Worker
 * 核心目标：精准过滤并切换至 127.0.0.1:11111，杜绝其他 DeepSeek 网页干扰。
 * 双通道架构：
 * 1. Alt + D (switch-to-dsh): 坚决直达并锁定 DSH 标签页，记录来源，绝不擅自切走；
 * 2. Ctrl + Alt + D (toggle-back): 往返切，在 DSH 与上一个工作标签页之间无缝 Toggle。
 */

// 严格前缀匹配（Chrome Match Pattern 不支持在 host 中指定端口号，故采用 JS 精准 URL 过滤）
const DSH_URL_PREFIXES = [
  "http://127.0.0.1:11111/",
  "http://localhost:11111/",
];

// 记录各个窗口切到 DSH 之前的标签页 ID
const lastActiveTabMap = new Map<number, number>();

/**
 * 判断标签页 URL 是否属于 DeepSeek Harness
 */
function isDshTab(url?: string): boolean {
  if (!url) return false;
  return DSH_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * 通道 1：坚决直达 DSH (Alt + D 驱动)
 */
async function activateDshTab(): Promise<void> {
  try {
    const currentWindow = await chrome.windows.getCurrent({ populate: true });
    const currentTab = currentWindow.tabs?.find((t) => t.active);
    const windowId = currentWindow.id;

    // 获取全量标签页，严格匹配端口 11111
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

    // 若当前不在 DSH 标签页，记录切走前的标签页 ID，以备 Ctrl+Alt+D 往返返回
    if (windowId !== undefined && currentTab && currentTab.id !== targetTab.id) {
      lastActiveTabMap.set(windowId, currentTab.id!);
    }

    // 若已在目标标签页上，保持激活并刷新焦点，绝不切走
    if (!needSwitchWindow && currentTab && currentTab.id === targetTab.id) {
      showBadge("DSH", "#10b981");
      return;
    }

    // 激活目标窗口与目标标签页
    if (needSwitchWindow && targetTab.windowId !== undefined) {
      await chrome.windows.update(targetTab.windowId, { focused: true });
    }
    await chrome.tabs.update(targetTab.id, { active: true });
    showBadge("OK", "#10b981");
  } catch (error) {
    console.error("[DSH Tab Switcher] activateDshTab 异常:", error);
  }
}

/**
 * 通道 2：在 DSH 与上一个工作标签页之间往返切 (Ctrl + Alt + D 驱动)
 */
async function toggleBackTab(): Promise<void> {
  try {
    const currentWindow = await chrome.windows.getCurrent({ populate: true });
    const currentTab = currentWindow.tabs?.find((t) => t.active);
    const windowId = currentWindow.id;

    if (windowId === undefined || !currentTab || currentTab.id === undefined) {
      return;
    }

    const allTabs = await chrome.tabs.query({});
    const dshTabs = allTabs.filter((t) => isDshTab(t.url));
    const isCurrentDsh = isDshTab(currentTab.url);

    if (isCurrentDsh) {
      // 当前在 DSH：切回上一次记录的标签页
      const prevTabId = lastActiveTabMap.get(windowId);
      if (prevTabId && prevTabId !== currentTab.id) {
        try {
          const prevTab = await chrome.tabs.get(prevTabId);
          if (prevTab && prevTab.windowId === windowId) {
            await chrome.tabs.update(prevTabId, { active: true });
            showBadge("BACK", "#3b82f6");
            return;
          }
        } catch {
          lastActiveTabMap.delete(windowId);
        }
      }
      showBadge("NONE", "#9ca3af");
    } else {
      // 当前不在 DSH：记录当前工作页，并切到 DSH (实现 A ⇄ B 互切)
      if (dshTabs.length > 0) {
        lastActiveTabMap.set(windowId, currentTab.id);
        const targetTab = dshTabs.find((t) => t.windowId === windowId) || dshTabs[0];
        if (targetTab && targetTab.id !== undefined) {
          if (targetTab.windowId !== windowId && targetTab.windowId !== undefined) {
            await chrome.windows.update(targetTab.windowId, { focused: true });
          }
          await chrome.tabs.update(targetTab.id, { active: true });
          showBadge("DSH", "#10b981");
        }
      }
    }
  } catch (error) {
    console.error("[DSH Tab Switcher] toggleBackTab 异常:", error);
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

// 监听快捷键命令
chrome.commands.onCommand.addListener((command) => {
  if (command === "switch-to-dsh") {
    activateDshTab();
  } else if (command === "toggle-back") {
    toggleBackTab();
  }
});

// 监听扩展图标点击 (默认直达 DSH)
chrome.action.onClicked.addListener(() => {
  activateDshTab();
});

// 标签页关闭时清理历史状态
chrome.tabs.onRemoved.addListener((closedTabId, removeInfo) => {
  if (lastActiveTabMap.get(removeInfo.windowId) === closedTabId) {
    lastActiveTabMap.delete(removeInfo.windowId);
  }
});
