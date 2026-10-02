# Chrome Gemini Launcher (极简图标呼出原生伴侣)

将 Chrome 顶栏原生的宽幅 `✦ 问问 Gemini` 药丸按钮隐藏，替换为只占单个图标大小（16×16）的 Gemini 官方渐变四角星扩展图标。点击即可通过长连接 Native Host 模拟系统热键 `Alt + G` 唤起 Chrome 内置原生 Gemini 伴侣侧边栏。

---

## 架构原理

```
[Chrome 扩展图标 (✦)]
       │
       ▼ (chrome.runtime.connectNative 长连接，host 常驻免启动开销)
[gemini_host.exe] (无控制台原生单文件，由 uv + PyInstaller 编译)
       │
       ▼ (读取 Local State 的 glic.launcher_hotkey，失败回退 Alt + G)
       ▼ (ctypes.windll.user32.SendInput 模拟该热键)
[Windows 物理热键（Chrome 中实际配置的组合键）]
       │
       ▼
[弹出 Chrome 原生内置 Gemini 伴侣侧边栏]
```

### 动态快捷键适配

热键不再硬编码，host 每次触发时从 Chrome 读取实际配置：

- **存储位置**：`%LOCALAPPDATA%\Google\Chrome\User Data\Local State`（浏览器级 JSON）的 `glic.launcher_hotkey`，`glic.launcher_enabled` 表示快捷键总开关。
- **解析范围**：修饰键（Alt / Ctrl / Shift / Win）+ 字母 / 数字 / F1-F24。
- **回退策略**：文件读取失败、快捷键未启用或值解析失败时，一律回退模拟 `Alt + G` 并写入 `host.log`。
- **tooltip 展示**：扩展图标悬停文案实时反映当前生效热键（`Gemini (Alt + G)` / `Gemini (Alt + G，默认回退)` / `Gemini（未启用快捷键）`）。
- **生效时滞**：Chrome 修改设置后 Local State 约 10s 内落盘（ImportantFileWriter 延迟写回），host 带 mtime 缓存按需重读，改动落盘后下次点击即生效，无需任何重启。

---

## 快速安装与配置

### 第一步：配置 Chrome 的 Gemini 开关
1. 在 Chrome 地址栏访问：`chrome://settings/ai/gemini`
2. **关闭**「在浏览器顶部显示 Gemini」（隐藏原生宽按钮，释放工具栏空间）。
3. **开启**「在系统任务栏中显示 Chrome 中的 Gemini 并开启键盘快捷键」（这一步才会注册热键；只关不开会导致快捷键失效——Chromium 会随 launcher 关闭清空热键注册）。
4. 「键盘快捷键」（打开面板用的那个）**任意组合均可**，扩展自动读取并模拟实际配置；读取失败时回退默认 `Alt + G`。「导航快捷键」`Alt + Shift + G` 是退出/返回方向，与本扩展无关。

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

## 重新生成扩展图标 (make_icons.py)

图标直接取自 **Gemini 官方 favicon**（渐变四角星：上红、右蓝、下绿、左黄），源图保存在项目根 `icon_source.png`。若需更换源图，从 Google favicon 服务重新下载：
```
https://www.google.com/s2/favicons?domain=gemini.google.com&sz=256
```
重新生成三件套：
```powershell
cd D:\Users\language_projects\typescript_projects\gemini-launcher
uv run make_icons.py
```
生成后需在 `chrome://extensions/` 中点击扩展的刷新按钮生效。

---

## 卸载清理

若未来不再需要，运行以下脚本即可清理注册表：
```powershell
cd D:\Users\language_projects\typescript_projects\gemini-launcher
uv run unregister.py
```
然后在 `chrome://extensions/` 中移除该扩展即可。
