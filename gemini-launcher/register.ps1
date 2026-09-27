# Register Chrome Native Messaging Host for Gemini Launcher
param (
    [string]$ExtensionId
)

$HostName = "com.gemini.launcher"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostDir = Join-Path $ScriptDir "host"
$ManifestTemplate = Join-Path $HostDir "com.gemini.launcher.json"
$ExePath = Join-Path $HostDir "gemini_host.exe"

# 如果未找到 exe，则尝试自动触发编译
if (-not (Test-Path $ExePath)) {
    Write-Host "未检测到 gemini_host.exe，正在自动调用编译脚本..." -ForegroundColor Yellow
    & (Join-Path $ScriptDir "build_exe.ps1")
    if (-not (Test-Path $ExePath)) {
        Write-Error "编译失败或未生成: $ExePath"
        exit 1
    }
}

# 提示用户输入 Extension ID（如果未通过参数传入）
if (-not $ExtensionId) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  Chrome Gemini Launcher - 扩展注册助手" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "1. 打开 Chrome 地址栏输入: chrome://extensions"
    Write-Host "2. 开启右上角 '开发者模式'"
    Write-Host "3. 点击 '加载已解压的扩展程序'，选择目录:"
    Write-Host "   $(Join-Path $ScriptDir 'extension')" -ForegroundColor Yellow
    Write-Host "4. 复制生成的 'ID' (形如: abcdefghijklmnopqrstuvwxyz123456)"
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
    $ExtensionId = Read-Host "请输入你的 Chrome 扩展 ID"
}

$ExtensionId = $ExtensionId.Trim()
if ([string]::IsNullOrWhiteSpace($ExtensionId)) {
    Write-Error "扩展 ID 不能为空！"
    exit 1
}

# 更新 host manifest JSON 中的 path (绝对路径指向 exe) 与 allowed_origins (无 BOM 的纯 UTF-8)
$ManifestData = @{
    name = $HostName
    description = "Chrome Native Messaging Host for Gemini Launcher"
    path = $ExePath
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
}

$JsonStr = $ManifestData | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($ManifestTemplate, $JsonStr, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "已更新配置文件: $ManifestTemplate" -ForegroundColor Green

# 写入注册表 HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.gemini.launcher
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
if (-not (Test-Path $RegPath)) {
    New-Item -Path $RegPath -Force | Out-Null
}

Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestTemplate
Write-Host "已成功注册到当前用户注册表:" -ForegroundColor Green
Write-Host "  项: $RegPath"
Write-Host "  值: $ManifestTemplate"
Write-Host ""
Write-Host "全部配置完成！请重启 Chrome 浏览器，即可在顶栏点击小图标呼出原生面板。" -ForegroundColor Cyan
