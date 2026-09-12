# 从当前用户 PowerShell profile 移除 tooldeck 的 UTF-8 设置块（幂等）。
# 只删 begin..end 标记区间（含端点），不影响 profile 其他内容。
$begin = '# >>> tooldeck utf8 console >>>'
$end = '# <<< tooldeck utf8 console <<<'

if (-not (Test-Path -LiteralPath $PROFILE)) {
    Write-Output "profile 不存在，无需移除：$PROFILE"
    exit 0
}
if (-not (Select-String -LiteralPath $PROFILE -SimpleMatch $begin -Quiet)) {
    Write-Output "profile 中未找到 tooldeck 设置块，无需移除"
    exit 0
}

$lines = Get-Content -LiteralPath $PROFILE
$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($line in $lines) {
    if ($line.Trim() -eq $begin) { $skip = $true; continue }
    if ($skip -and $line.Trim() -eq $end) { $skip = $false; continue }
    if (-not $skip) { $out.Add($line) }
}
if ($skip) {
    Write-Output "警告：设置块缺少结束标记，已按至文件尾移除"
}

# 设置块原本即 ASCII，回写 Default（ANSI）保持 PS 5.1 原生编码习惯
Set-Content -LiteralPath $PROFILE -Value $out -Encoding Default
Write-Output "已移除：$PROFILE"
