# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
# Register Chrome Native Messaging Host for Gemini Launcher
# 注册流程：确保 gemini_host.exe 存在（缺则自动编译）→ 更新 host manifest JSON
#           （绝对路径 + 扩展 allowed_origins，无 BOM UTF-8）→ 写入 HKCU 注册表
# 用法：uv run register.py [--extension-id <Chrome 扩展 ID>]（缺省时交互输入）

import argparse
import json
import subprocess
import sys
import winreg
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
HOST_NAME = "com.gemini.launcher"
HOST_DIR = SCRIPT_DIR / "host"
MANIFEST = HOST_DIR / "com.gemini.launcher.json"
EXE_PATH = HOST_DIR / "gemini_host.exe"
REG_PATH = r"Software\Google\Chrome\NativeMessagingHosts" + "\\" + HOST_NAME

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ("utf-8", "utf8"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser(description="注册 Chrome Gemini Launcher 的 Native Messaging Host")
    parser.add_argument("--extension-id", help="Chrome 扩展 ID（缺省时交互输入）")
    args = parser.parse_args()
    extension_id = args.extension_id

    # 如果未找到 exe，则尝试自动触发编译
    if not EXE_PATH.is_file():
        print("未检测到 gemini_host.exe，正在自动调用编译脚本...")
        r = subprocess.run(["uv", "run", str(SCRIPT_DIR / "build_exe.py")], cwd=str(SCRIPT_DIR))
        if r.returncode != 0 or not EXE_PATH.is_file():
            print(f"编译失败或未生成: {EXE_PATH}", file=sys.stderr)
            return 1

    # 提示用户输入 Extension ID（如果未通过参数传入）
    if not extension_id:
        print()
        print("==========================================================")
        print("  Chrome Gemini Launcher - 扩展注册助手")
        print("==========================================================")
        print("1. 打开 Chrome 地址栏输入: chrome://extensions")
        print("2. 开启右上角 '开发者模式'")
        print("3. 点击 '加载已解压的扩展程序'，选择目录:")
        print(f"   {SCRIPT_DIR / 'extension'}")
        print("4. 复制生成的 'ID' (形如: abcdefghijklmnopqrstuvwxyz123456)")
        print("==========================================================")
        print()
        extension_id = input("请输入你的 Chrome 扩展 ID").strip()

    if not extension_id:
        print("扩展 ID 不能为空！", file=sys.stderr)
        return 1

    # 更新 host manifest JSON：path 指向 exe 绝对路径 + allowed_origins（无 BOM 的纯 UTF-8）
    manifest = {
        "name": HOST_NAME,
        "description": "Chrome Native Messaging Host for Gemini Launcher",
        "path": str(EXE_PATH),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{extension_id}/"],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"已更新配置文件: {MANIFEST}")

    # 写入注册表 HKCU\Software\Google\Chrome\NativeMessagingHosts\com.gemini.launcher
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_PATH) as key:
        winreg.SetValueEx(key, None, 0, winreg.REG_SZ, str(MANIFEST))
    print("已成功注册到当前用户注册表:")
    print(f"  项: HKCU\\{REG_PATH}")
    print(f"  值: {MANIFEST}")
    print()
    print("全部配置完成！请重启 Chrome 浏览器，即可在顶栏点击小图标呼出原生面板。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
