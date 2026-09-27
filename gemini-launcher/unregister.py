# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
# Unregister Chrome Native Messaging Host for Gemini Launcher
# 移除 HKCU 注册表项（幂等，未注册时提示无需清理）
# 用法：uv run unregister.py

import sys
import winreg

HOST_NAME = "com.gemini.launcher"
REG_PATH = r"Software\Google\Chrome\NativeMessagingHosts" + "\\" + HOST_NAME

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, REG_PATH)
        print(f"已成功移除注册表项: HKCU\\{REG_PATH}")
    except FileNotFoundError:
        print(f"未找到注册表项: HKCU\\{REG_PATH} (无需清理)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
