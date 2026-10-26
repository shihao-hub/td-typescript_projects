# DSH Tab Switcher (Chrome MV3 扩展)

针对多标签页深度开发场景，专为精准直达 **DeepSeek Harness**（`http://127.0.0.1:11111/`）设计的极简轻量 Chrome 原生扩展。支持与系统级 AutoHotkey（<kbd>Alt</kbd> + <kbd>D</kbd>）深度联动，实现跨应用与多标签页间的**抽屉式 Toggle（呼之即来，挥之即去）**。

---

## 核心痛点与设计亮点

1. **绝对精准（杜绝串台）**：
   - 底层严格按照 URL 模式 `*://127.0.0.1:11111/*` 进行内核级过滤；
   - 哪怕浏览器中打开了再多带有 `deepseek-ai/*` 或 `DeepSeek Harness` 前缀的 GitHub 仓库、文档或搜索页，也绝不会发生误切。
2. **抽屉式双向 Toggle（A ⇄ B 往返）**：
   - 当你在看论文/查资料时，按快捷键一键切到 DSH；
   - 在 DSH 标签页再次按下，**自动精准切回刚才的阅读标签页**，心流零阻断！
3. **跨窗口自动感知**：
   - 优先在当前窗口中定位；若 DSH 打开在另一个独立 Chrome 窗口中，自动聚焦目标窗口并激活。
4. **与 AHK 无缝融合**：
   - 原生桌面版 ➔ Chrome PWA 独立应用 ➔ 普通 Chrome 固定标签页，三模优先级平滑降级调度。

---

## 快速安装指引（Chrome 本地解包载入）

1. 打开 Google Chrome，在地址栏输入：
   ```text
   chrome://extensions/
   ```
2. 在页面右上角开启 **「开发者模式」**（Developer Mode）；
3. 点击左上角 **「加载已解压的扩展程序」**（Load unpacked）；
4. 选择本项目编译输出的 `dist` 目录：
   ```text
   D:\Users\language_projects\typescript_projects\dsh-tab-switcher\dist
   ```
5. 看到 `DSH Tab Switcher` 出现在扩展列表中即可！

---

## 内部联动快捷键说明

- **直达 DSH 命令（switch-to-dsh）**：<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>9</kbd>（对应系统物理键 **<kbd>Alt</kbd> + <kbd>D</kbd>**，坚决直达并锁定，绝不擅自切走）
- **往返返回命令（toggle-back）**：<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>8</kbd>（对应系统物理键 **<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd>**，在 DSH 与上一个工作标签页之间无缝 Toggle 往返）
- **配置与修改**：可在 Chrome 地址栏访问 `chrome://extensions/shortcuts` 查看或自定义该内部命令快捷键；
- 配合系统全局 AHK 脚本（`app_switcher.ahk`）后，用户在物理键盘上按：
  - **<kbd>Alt</kbd> + <kbd>D</kbd>**：立刻直达 DSH；
  - **<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd>**：切回刚才的工作标签页。

---

## 开发与构建

本项目使用 `TypeScript` 编写，由 `bun` 驱动极速零依赖构建：

```bash
# 执行一次性构建 (产物输出至 dist/)
bun run build

# 监听模式热构建
bun run dev
```
