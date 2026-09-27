// Chrome Gemini Launcher - background service worker
const HOST_NAME = "com.gemini.launcher";

chrome.action.onClicked.addListener((tab) => {
  // 发送消息给本地 Native Messaging Host 触发物理按键模拟
  chrome.runtime.sendNativeMessage(
    HOST_NAME,
    { action: "trigger", timestamp: Date.now() },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Native Messaging Error:", chrome.runtime.lastError.message);
      } else {
        console.log("Native Messaging Response:", response);
      }
    }
  );
});
