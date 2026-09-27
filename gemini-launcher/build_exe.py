# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
# 使用 uv + PyInstaller 将 host.py 编译为独立的无黑框原生可执行文件 (gemini_host.exe)
# 用法：uv run build_exe.py

import shutil
import subprocess
import sys
from pathlib import Path

HOST_DIR = Path(__file__).resolve().parent / "host"
HOST_PY = HOST_DIR / "host.py"

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ("utf-8", "utf8"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    if not HOST_PY.is_file():
        print(f"找不到源文件: {HOST_PY}", file=sys.stderr)
        return 1

    print("==========================================================")
    print("  正在使用 uv + PyInstaller 编译 gemini_host.exe...")
    print("==========================================================")

    # 在 host 目录执行编译，避免在仓库根目录生成临时产物。
    # 参数说明：--with pyinstaller 让 uv 临时拉取 pyinstaller 不污染环境；
    # --onefile 单文件独立 exe；--noconsole 无控制台窗口（零黑框）；
    # --distpath . 输出到 host 目录；--name gemini_host 指定输出名。
    r = subprocess.run(
        [
            "uv", "run", "--with", "pyinstaller", "pyinstaller",
            "--onefile", "--noconsole", "--distpath", ".", "--name", "gemini_host", "host.py",
        ],
        cwd=str(HOST_DIR),
    )
    if r.returncode != 0:
        return r.returncode

    # 清理 PyInstaller 生成的临时 build 目录与 .spec 规范文件
    shutil.rmtree(HOST_DIR / "build", ignore_errors=True)
    (HOST_DIR / "gemini_host.spec").unlink(missing_ok=True)

    print()
    print(f"编译成功: {HOST_DIR / 'gemini_host.exe'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
