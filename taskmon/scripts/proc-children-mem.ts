/**
 * proc-children-mem.ts —— 统计指定进程（默认 sublime_text / zed）拉起的子进程
 * （含孙进程）内存占用。
 *
 * 用法（用 Bun 运行）：
 *   bun scripts/proc-children-mem.ts
 *   bun scripts/proc-children-mem.ts --editors chrome,code
 *   bun scripts/proc-children-mem.ts --cmd-width 80
 *
 * 数据源：经 powershell 子进程取 Win32_Process 进程表（系统查询通道，等价调外部命令），
 * 每进程附带 Get-Process 的工作集/私有内存，拿到后在 TS 侧做父子聚合与展示。
 */
import { spawnSync } from 'node:child_process';

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
const readArg = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : def;
};

const EDITORS: string[] = readArg('editors', 'sublime_text,zed')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const CMD_WIDTH: number = Number(readArg('cmd-width', '110'));

// 数据源：经 powershell 子进程取两张表（系统查询通道，等价调外部命令）：
//   ① Win32_Process 进程表（PID/PPID/名称/命令行）  ② Get-Process 内存表（工作集/私有内存）
// 注意：两查询保持简单管道；PS 侧 ForEach 内嵌 Get-Process 的复合管道在 Bun spawnSync
// 下输出不稳定（截断/空），故内存数据在 TS 侧按 PID join。
const PS_QUERY_PROCS =
  'Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress';
const PS_QUERY_MEM =
  'Get-Process | Select-Object Id, WorkingSet64, PrivateMemorySize64 | ConvertTo-Json -Compress';

interface ProcRow {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine: string | null;
}

interface MemRow {
  Id: number;
  WorkingSet64: number;
  PrivateMemorySize64: number;
}

function psJson<T>(query: string): T[] {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', query], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(`PowerShell 查询失败：${(r.stderr ?? '').trim()}`);
    process.exit(1);
  }
  const raw = (r.stdout ?? '').trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as T | T[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

// 命令行含这些特征视为 LSP，标注在备注列
const LSP_PATTERN =
  /LSP|language-server|gopls|pyright|tsserver|typescript-language-server|vtsls|rust-analyzer|jdtls|clangd|lua-language-server/i;

const MB = 1024 * 1024;
const all = psJson<ProcRow>(PS_QUERY_PROCS);
const memById = new Map<number, MemRow>();
for (const m of psJson<MemRow>(PS_QUERY_MEM)) memById.set(m.Id, m);
const byPid = new Map<number, ProcRow>();
for (const p of all) byPid.set(p.ProcessId, p);

const parentName = (ppid: number): string => byPid.get(ppid)?.Name ?? '(父已退出)';

/** 定宽列排版（中文按 2 列宽计），模拟原 Format-Table 输出 */
const displayWidth = (s: string): number => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
const padEnd = (s: string, width: number): string => s + ' '.repeat(Math.max(0, width - displayWidth(s)));

let grandTotal = 0;

for (const editor of EDITORS) {
  const name = editor.replace(/\.exe$/i, '');
  console.log('');
  console.log(`===== ${name} =====`);

  const rootPids = all.filter((p) => p.Name.replace(/\.exe$/i, '').toLowerCase() === name.toLowerCase()).map((p) => p.ProcessId);
  if (rootPids.length === 0) {
    console.log('  未运行');
    continue;
  }
  console.log(`  实例 PID: ${rootPids.join(', ')}`);

  const kids = all.filter((p) => rootPids.includes(p.ParentProcessId));
  const kidPids = new Set(kids.map((p) => p.ProcessId));
  const rows = [...kids, ...all.filter((p) => kidPids.has(p.ParentProcessId))];

  if (rows.length === 0) {
    console.log('  无子进程');
    continue;
  }

  const data = rows
    .map((r) => {
      const mem = memById.get(r.ProcessId);
      const ws = Math.round(((mem?.WorkingSet64 ?? 0) / MB) * 10) / 10;
      const priv = Math.round(((mem?.PrivateMemorySize64 ?? 0) / MB) * 10) / 10;
      let cl = r.CommandLine ?? '';
      if (cl.length > CMD_WIDTH) cl = `${cl.slice(0, CMD_WIDTH)}...`;
      const note = LSP_PATTERN.test(cl) ? 'LSP' : '';
      return { PID: r.ProcessId, 进程: r.Name, 父: parentName(r.ParentProcessId), ws, priv, note, cl };
    })
    .sort((a, b) => b.ws - a.ws);

  // 表头 + 按最大列宽排版
  const headers = ['PID', '进程', '父', 'WS MB', 'Priv MB', '备注', '命令行'] as const;
  const widths = headers.map((h, i) =>
    Math.max(displayWidth(h), ...data.map((d) => displayWidth(String(d[headers[i]! as keyof typeof d])))),
  );
  console.log(`  ${headers.map((h, i) => padEnd(h, widths[i]!)).join('  ').trimEnd()}`);
  for (const d of data) {
    const cells = [String(d.PID), d.进程, d.父, String(d.ws), String(d.priv), d.note, d.cl];
    console.log(`  ${cells.map((c, i) => padEnd(c, widths[i]!)).join('  ').trimEnd()}`);
  }

  const sumWs = Math.round(data.reduce((s, d) => s + d.ws, 0) * 10) / 10;
  console.log(`  合计: ${rows.length} 个子进程, 工作集 ${sumWs} MB`);
  grandTotal += sumWs;
}

console.log('');
console.log(`总计工作集: ${Math.round(grandTotal * 10) / 10} MB`);
