// Chrome Gemini Launcher - background service worker
// 使用长连接 (connectNative)：host 进程常驻，点击零启动开销。
// Chrome 116+ 中活跃的 Native Messaging 端口会阻止 MV3 service worker 空闲停机。
const HOST_NAME = "com.gemini.launcher";

let port = undefined;

function updateTitle(info) {
  let title;
  if (info.enabled === false) {
    title = "Gemini（未启用快捷键）";
  } else if (info.source === "dynamic") {
    title = `Gemini (${info.hotkey})`;
  } else {
    title = `Gemini (${info.hotkey || "Alt+G"}，默认回退)`;
  }
  chrome.action.setTitle({ title });
}

function getPort() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onDisconnect.addListener(() => {
    // host 退出（如浏览器关闭/扩展重载）后清空，下次点击重新拉起
    port = undefined;
  });
  port.onMessage.addListener((msg) => {
    // trigger 与 get_hotkey 响应都携带热键信息，顺带刷新 tooltip
    if (msg && msg.source && (msg.action === "triggered" || msg.action === "get_hotkey")) {
      updateTitle(msg);
    }
  });
  return port;
}

function refreshHotkey() {
  getPort().postMessage({ action: "get_hotkey" });
}

chrome.action.onClicked.addListener((tab) => {
  getPort().postMessage({ action: "trigger", timestamp: Date.now() });
});

// setTitle 不跨浏览器会话持久：会话启动与扩展安装/重载时预取刷新
chrome.runtime.onStartup.addListener(refreshHotkey);
chrome.runtime.onInstalled.addListener(refreshHotkey);
