# 向当前用户 PowerShell profile 写入 UTF-8 控制台解码设置（幂等）。
# 背景：PS 5.1 用 [Console]::OutputEncoding 解码子进程输出，该值在会话启动时定格为 GBK，
# chcp 65001 无法刷新；tooldeck 主进程中文日志为 UTF-8，需在 profile 固化此设置。
$begin = '# >>> tooldeck utf8 console >>>'
$end = '# <<< tooldeck utf8 console <<<'
$block = @(
    $begin
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8'
    $end
)

if (Test-Path -LiteralPath $PROFILE) {
    if (Select-String -LiteralPath $PROFILE -SimpleMatch $begin -Quiet) {
        Write-Output "已存在 tooldeck UTF-8 设置块，无需重复添加：$PROFILE"
        exit 0
    }
}

$dir = Split-Path -Parent $PROFILE
if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# 设置块为纯 ASCII，用 ASCII 编码追加，避免与 profile 既有内容产生编码混合问题
Add-Content -LiteralPath $PROFILE -Value $block -Encoding ASCII
Write-Output "已写入：$PROFILE"
Write-Output "新开 PowerShell 会话自动生效；当前会话可执行 . `$PROFILE 立即生效"
