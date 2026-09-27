/**
 * remove-utf8-profile.ts —— 从当前用户 PowerShell profile 移除 tooldeck 的 UTF-8 设置块（幂等）。
 * 只删 begin..end 标记区间（含端点），不影响 profile 其他内容。
 *
 * 用法：bun scripts/remove-utf8-profile.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const BEGIN = '# >>> tooldeck utf8 console >>>';
const END = '# <<< tooldeck utf8 console <<<';

// 经 powershell 查询 $PROFILE 真实路径（自动处理 Documents 目录重定向）
const r = spawnSync('powershell', ['-NoProfile', '-Command', 'Write-Output $PROFILE'], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error('无法定位 PowerShell $PROFILE 路径');
  process.exit(1);
}
const profile = (r.stdout ?? '').trim().split(/\r?\n/)[0]!;

if (!existsSync(profile)) {
  console.log(`profile 不存在，无需移除：${profile}`);
  process.exit(0);
}

// latin1 读写 = 字节保真：无论 profile 是 ASCII/ANSI/UTF-8 哪种编码，回写都不破坏原有字节
const text = readFileSync(profile, 'latin1');
if (!text.includes(BEGIN)) {
  console.log('profile 中未找到 tooldeck 设置块，无需移除');
  process.exit(0);
}

const lines = text.split('\n');
const out: string[] = [];
let skip = false;
for (const line of lines) {
  if (line.trim() === BEGIN) {
    skip = true;
    continue;
  }
  if (skip && line.trim() === END) {
    skip = false;
    continue;
  }
  if (!skip) out.push(line);
}
if (skip) console.log('警告：设置块缺少结束标记，已按至文件尾移除');

writeFileSync(profile, out.join('\n'), { encoding: 'latin1' });
console.log(`已移除：${profile}`);
