# Unregister Chrome Native Messaging Host for Gemini Launcher
$HostName = "com.gemini.launcher"
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"

if (Test-Path $RegPath) {
    Remove-Item -Path $RegPath -Recurse -Force
    Write-Host "已成功移除注册表项: $RegPath" -ForegroundColor Green
} else {
    Write-Host "未找到注册表项: $RegPath (无需清理)" -ForegroundColor Yellow
}
