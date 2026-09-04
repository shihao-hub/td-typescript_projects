# proc-children-mem.ps1
# 统计指定进程（默认 sublime_text / zed）拉起的子进程（含孙进程）内存占用。
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\proc-children-mem.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\proc-children-mem.ps1 -Editors chrome,code
param(
    # 目标进程名（可带可不带 .exe，大小写不敏感）
    [string[]]$Editors = @('sublime_text', 'zed'),
    # 命令行截断长度
    [int]$CmdWidth = 110
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$all = Get-CimInstance Win32_Process
$byPid = @{}
foreach ($p in $all) { $byPid[[uint32]$p.ProcessId] = $p }

function Get-ParentName([uint32]$ppid) {
    $pp = $byPid[$ppid]
    if ($pp) { return $pp.Name }
    return '(父已退出)'
}

# 命令行含这些特征视为 LSP，标注在备注列
$lspPattern = 'LSP|language-server|gopls|pyright|tsserver|typescript-language-server|vtsls|rust-analyzer|jdtls|clangd|lua-language-server'

$grandTotal = 0

foreach ($editor in $Editors) {
    $name = $editor -replace '\.exe$', ''
    Write-Output ''
    Write-Output ('===== ' + $name + ' =====')

    $rootPids = @($all | Where-Object { ($_.Name -replace '\.exe$', '') -eq $name } | Select-Object -ExpandProperty ProcessId)
    if ($rootPids.Count -eq 0) {
        Write-Output ('  未运行')
        continue
    }
    Write-Output ('  实例 PID: ' + ($rootPids -join ', '))

    $kids = @($all | Where-Object { $rootPids -contains $_.ParentProcessId })
    $kidPids = @($kids | Select-Object -ExpandProperty ProcessId)
    $gkids = @($all | Where-Object { $kidPids -contains $_.ParentProcessId })
    $rows = @($kids) + @($gkids)

    if ($rows.Count -eq 0) {
        Write-Output ('  无子进程')
        continue
    }

    $sumWs = 0.0
    $data = foreach ($r in $rows) {
        $proc = Get-Process -Id $r.ProcessId -ErrorAction SilentlyContinue
        $ws = if ($proc) { [math]::Round($proc.WorkingSet64 / 1MB, 1) } else { 0 }
        $priv = if ($proc) { [math]::Round($proc.PrivateMemorySize64 / 1MB, 1) } else { 0 }
        $sumWs += $ws
        $cl = [string]$r.CommandLine
        if ($cl.Length -gt $CmdWidth) { $cl = $cl.Substring(0, $CmdWidth) + '...' }
        $note = if ($cl -match $lspPattern) { 'LSP' } else { '' }
        [PSCustomObject]@{
            PID     = $r.ProcessId
            进程    = $r.Name
            父      = Get-ParentName ([uint32]$r.ParentProcessId)
            'WS MB' = $ws
            'Priv MB' = $priv
            备注    = $note
            命令行  = $cl
        }
    }

    $data | Sort-Object 'WS MB' -Descending | Format-Table -AutoSize | Out-String -Width 300 | Write-Output
    Write-Output ('  合计: ' + $rows.Count + ' 个子进程, 工作集 ' + [math]::Round($sumWs, 1) + ' MB')
    $grandTotal += $sumWs
}

Write-Output ''
Write-Output ('总计工作集: ' + [math]::Round($grandTotal, 1) + ' MB')
