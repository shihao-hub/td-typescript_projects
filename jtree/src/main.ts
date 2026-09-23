#!/usr/bin/env node
import { render } from './render.js';
import { runTui } from './tui.js';

/** 与 package.json 的 version 保持同步（package.json 在 rootDir 外，tsc 无法 import） */
const VERSION = '0.3.0';

/** PS 5.1 管道会按控制台编码转码损坏中文 JSON，解析失败时给出可行动的提示 */
const PS51_HINT = [
  '提示：PowerShell 5.1 管道会按控制台编码转码损坏中文，请先执行：',
  '      $OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8',
  '      或使用 Git Bash / PowerShell 7',
].join('\n');

const USAGE = `jtree v${VERSION} - 通用 JSON → 终端树形渲染器

用法：
  <命令> | jtree              JSON 经由 stdin 传入
  <命令> | jtree -p           强制纯打印（跳过交互）

参数：
  -p, --print    强制纯打印输出（stdout 为终端时也不进交互）
  -h, --help     显示本帮助
  -v, --version  显示版本

交互模式（stdout 为终端且未指定 -p 时自动进入）：
  ↑/↓ 或 j/k      上下移动        PgUp/PgDn   翻页
  Home/g、End/G   跳到首行/末行
  ←/-、→/+        收起/展开       Enter/空格   切换
  a               全收起 ↔ 全展开
  q 或 Ctrl+C     退出（退出码 0）

stdout 接管道或重定向（如 jtree | grep）时自动降级为纯打印。`;

/** 手写 argv 解析：-p/--print、-h/--help、-v/--version；跳过 -- 分隔符，其余视为未知参数 */
function parseArgs(argv: readonly string[]): { print: boolean; help: boolean; version: boolean; unknown?: string } {
  const flags = { print: false, help: false, version: false, unknown: undefined as string | undefined };
  for (const arg of argv) {
    if (arg === '--') continue; // POSIX 分隔符（pnpm/node 直传时会保留在 argv 中）
    if (arg === '-p' || arg === '--print') flags.print = true;
    else if (arg === '-h' || arg === '--help') flags.help = true;
    else if (arg === '-v' || arg === '--version') flags.version = true;
    else {
      flags.unknown = arg;
      break;
    }
  }
  return flags;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(c as Buffer));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.unknown !== undefined) {
    process.stderr.write(`jtree：未知参数 ${flags.unknown}（-h 查看帮助）\n`);
    process.exitCode = 1;
    return;
  }
  if (flags.help) {
    process.stdout.write(USAGE + '\n');
    return;
  }
  if (flags.version) {
    process.stdout.write(`jtree v${VERSION}\n`);
    return;
  }

  if (process.stdin.isTTY) {
    process.stderr.write('用法：<命令> | jtree（JSON 经由 stdin 传入，-h 查看帮助）\n');
    process.exitCode = 1;
    return;
  }

  const text = (await readStdin()).trim();
  if (!text) {
    process.stderr.write('jtree: 输入为空，期待 JSON 文本\n');
    process.exitCode = 1;
    return;
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`jtree: JSON 解析失败：${msg}\n${PS51_HINT}\n`);
    process.exitCode = 1;
    return;
  }

  // stdout 为终端且未指定 -p → 交互模式；键源不可用时降级纯打印
  if (process.stdout.isTTY && !flags.print) {
    if (await runTui(value)) return;
    process.stderr.write('提示：当前环境无法读取键盘输入，已按纯打印输出（可用 -p 显式跳过交互）\n');
  }

  const lines = render(value, { width: process.stdout.columns ?? 120 });
  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`jtree: ${msg}\n`);
  process.exitCode = 1;
});
