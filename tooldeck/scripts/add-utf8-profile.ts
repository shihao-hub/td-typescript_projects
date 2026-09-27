/**
 * add-utf8-profile.ts —— 向当前用户 PowerShell profile 写入 UTF-8 控制台解码设置（幂等）。
 * 背景：PS 5.1 用 [Console]::OutputEncoding 解码子进程输出，该值在会话启动时定格为 GBK，
 * chcp 65001 无法刷新；tooldeck 主进程中文日志为 UTF-8，需在 profile 固化此设置。
 *
 * 用法：bun scripts/add-utf8-profile.ts
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const BEGIN = '# >>> tooldeck utf8 console >>>';
const END = '# <<< tooldeck utf8 console <<<';
// 设置块为纯 ASCII，用 ASCII 字节追加，避免与 profile 既有内容产生编码混合问题
const BLOCK = `${BEGIN}\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${END}\n`;

// 经 powershell 查询 $PROFILE 真实路径（自动处理 Documents 目录重定向）
const r = spawnSync('powershell', ['-NoProfile', '-Command', 'Write-Output $PROFILE'], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error('无法定位 PowerShell $PROFILE 路径');
  process.exit(1);
}
const profile = (r.stdout ?? '').trim().split(/\r?\n/)[0]!;

if (existsSync(profile)) {
  // latin1 读 = 字节保真，任何编码下 ASCII 标记串的搜索结果都与原脚本一致
  const text = readFileSync(profile, 'latin1');
  if (text.includes(BEGIN)) {
    console.log(`已存在 tooldeck UTF-8 设置块，无需重复添加：${profile}`);
    process.exit(0);
  }
}

appendFileSync(profile, BLOCK, { encoding: 'latin1' });
console.log(`已写入：${profile}`);
console.log('新开 PowerShell 会话自动生效；当前会话可执行 . $PROFILE 立即生效');
