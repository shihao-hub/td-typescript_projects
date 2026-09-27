# Chrome Gemini Launcher (极简图标呼出原生伴侣)

将 Chrome 顶栏原生的宽幅 `✦ 问问 Gemini` 药丸按钮隐藏，替换为只占单个图标大小（16×16）的极简 `✦` 扩展图标。点击即可通过系统级热键模拟唤起 Chrome 内置原生 Gemini 伴侣侧边栏。

---

## 架构原理

```
[Chrome 扩展图标 (✦)]
       │
       ▼ (chrome.runtime.sendNativeMessage)
[gemini_host.exe] (无控制台原生单文件，由 uv + PyInstaller 编译)
       │
       ▼ (ctypes.windll.user32.SendInput)
[Windows 物理热键 Alt + Shift + G]
       │
       ▼
[弹出 Chrome 原生内置 Gemini 伴侣侧边栏]
```

---

## 快速安装与配置

### 第一步：关闭 Chrome 顶栏的原生宽按钮
1. 在 Chrome 地址栏访问：`chrome://settings/ai/gemini`
2. 关闭 **“在浏览器顶部显示 Gemini”**（释放工具栏水平空间）。
3. 确认 **“导航快捷键”** 为默认的 `Alt + Shift + G`。

### 第二步：在 Chrome 中加载扩展
1. 打开 Chrome 地址栏：`chrome://extensions/`
2. 开启右上角 **“开发者模式”** 开关。
3. 点击左上角 **“加载已解压的扩展程序”**。
4. 选择目录：`typescript_projects/gemini-launcher/extension`
5. 复制生成出来的 **扩展 ID**（形如 `bgnokdanmgeniekciaokdakhnmmienim`）。
6. 点击 Chrome 顶栏的拼图图标，把 **Gemini Launcher** 固定到顶栏。

### 第三步：一键注册 Native Messaging 宿主
在项目根目录运行：
```powershell
cd D:\Users\language_projects\typescript_projects\gemini-launcher
uv run register.py
```
* 脚本会提示你粘贴刚刚复制的 **扩展 ID**（如果未检测到 `gemini_host.exe` 会自动先调用 `build_exe.py` 进行编译）。
* 脚本将自动更新配置文件并写入注册表：
  `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.gemini.launcher`
* **提示**：注册完成后请完全重启一次 Chrome 浏览器。

---

## 自主编译 Native Host (build_exe.py)

如果修改了 `host/host.py` 中的逻辑，可以直接运行编译脚本重新生成 `gemini_host.exe`：
```powershell
cd D:\Users\language_projects\typescript_projects\gemini-launcher
uv run build_exe.py
```
该脚本通过 `uv run --with pyinstaller` 纯净拉取打包工具，零系统依赖污染，并在编译完成后自动清理中间构建缓存。

---

## 卸载清理

若未来不再需要，运行以下脚本即可清理注册表：
```powershell
cd D:\Users\language_projects\typescript_projects\gemini-launcher
uv run unregister.py
```
然后在 `chrome://extensions/` 中移除该扩展即可。
