<#
.SYNOPSIS
    使用 uv + PyInstaller 将 host.py 编译为独立的无黑框原生可执行文件 (gemini_host.exe)
#>
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostDir = Join-Path $ScriptDir "host"
$HostPy = Join-Path $HostDir "host.py"

if (-not (Test-Path $HostPy)) {
    Write-Error "找不到源文件: $HostPy"
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  正在使用 uv + PyInstaller 编译 gemini_host.exe..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 切换到 host 目录执行编译，避免在仓库根目录生成临时产物
Push-Location $HostDir

try {
    # 参数说明：
    # --with pyinstaller : 让 uv 临时拉取 pyinstaller，不污染全局/本地环境
    # --onefile          : 打包为单文件独立 exe
    # --noconsole        : 无控制台窗口（零黑框）
    # --distpath .       : 输出到当前 host 目录
    # --name gemini_host : 指定输出 exe 名称为 gemini_host.exe
    uv run --with pyinstaller pyinstaller `
        --onefile `
        --noconsole `
        --distpath . `
        --name gemini_host `
        host.py

    Write-Host ""
    Write-Host "编译成功: $(Join-Path $HostDir 'gemini_host.exe')" -ForegroundColor Green
} finally {
    # 清理 PyInstaller 生成的临时 build 目录与 .spec 规范文件
    if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
    if (Test-Path "gemini_host.spec") { Remove-Item -Force "gemini_host.spec" }
    Pop-Location
}
