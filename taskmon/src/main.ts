#!/usr/bin/env node
import { stdin, stdout } from 'node:process';
import readline from 'node:readline';
import chalk from 'chalk';
import { Command } from 'commander';
import { listProcesses } from './tasklist.js';
import { groupProcesses } from './grouping.js';
import { renderFrame } from './render.js';
import { truncate } from './format.js';
import type { ProcessGroup } from './types.js';

const program = new Command();
program
  .name('taskmon')
  .description('Windows 任务管理器·内存版：按进程名分组展示内存占用，控制台实时刷新')
  .option('-i, --interval <seconds>', '刷新间隔（秒），最小 1', (v) => Math.max(1, Number(v) || 2), 2)
  .option('-t, --top <n>', '只显示内存最大的前 n 组（0 = 全部）', (v) => Math.max(0, Math.floor(Number(v) || 0)), 0)
  .option('--once', '输出一帧快照后退出（调试 / 管道友好）')
  .version('0.1.0');
program.parse();

const opts = program.opts<{ interval: number; top: number; once: boolean }>();
const interactive = Boolean(stdout.isTTY);

let groups: ProcessGroup[] = [];
let totalProcs = 0;
let lastDate = new Date();
let error: string | undefined;
let offset = 0;
let running = true;
let timer: NodeJS.Timeout | undefined;

async function tick(): Promise<void> {
  try {
    const procs = await listProcesses();
    groups = groupProcesses(procs);
    totalProcs = procs.length;
    lastDate = new Date();
    error = undefined;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  draw();
  if (running) {
    timer = setTimeout(() => {
      void tick();
    }, opts.interval * 1000);
  }
}

function currentLines(): string[] {
  if (error) {
    return [
      chalk.red.bold('采集进程数据失败'),
      '',
      chalk.red(error),
      '',
      chalk.yellow('提示：taskmon 依赖 Windows 内置命令 tasklist，请在 Windows 上运行。'),
    ];
  }
  return renderFrame(groups, {
    width: stdout.columns ?? 100,
    top: opts.top,
    timestamp: lastDate,
    intervalSec: opts.interval,
    totalProcs,
  });
}

function bodyRows(): number {
  return Math.max(4, (stdout.rows ?? 40) - 1);
}

function draw(): void {
  const lines = currentLines();
  const width = stdout.columns ?? 100;
  const body = bodyRows();
  const maxOffset = Math.max(0, lines.length - body);
  offset = Math.max(0, Math.min(offset, maxOffset));

  const rows = lines.slice(offset, offset + body);
  while (rows.length < body) rows.push('');

  const parts: string[] = [];
  if (offset > 0) parts.push(`↑ 上方还有 ${offset} 行`);
  if (maxOffset - offset > 0) parts.push(`↓ 下方还有 ${maxOffset - offset} 行`);
  parts.push('↑↓ 滚动 · PgUp/PgDn 翻页 · 空格 刷新 · q 退出');
  rows.push(chalk.dim(truncate(parts.join('   '), width)));

  stdout.write('\x1b[H' + rows.map((l) => l + '\x1b[K').join('\n') + '\x1b[K');
}

function scrollBy(n: number): void {
  offset += n;
  draw();
}

function refreshNow(): void {
  if (timer) clearTimeout(timer);
  void tick();
}

function quit(): void {
  if (!running) return;
  running = false;
  if (timer) clearTimeout(timer);
  stdout.write('\x1b[?25h');
  if (stdin.isTTY) {
    try {
      stdin.setRawMode(false);
      stdin.pause();
    } catch {
      // 忽略：终端已恢复
    }
  }
  stdout.write('\x1b[2J\x1b[3J\x1b[H');
  console.log('taskmon 已退出');
  process.exit(0);
}

function setupKeys(): void {
  if (!stdin.isTTY) return;
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on('keypress', (_str, key) => {
    if (!key) return;
    if (key.ctrl && key.name === 'c') {
      quit();
      return;
    }
    switch (key.name) {
      case 'q':
        quit();
        break;
      case 'space':
      case 'r':
        refreshNow();
        break;
      case 'up':
        scrollBy(-1);
        break;
      case 'down':
        scrollBy(1);
        break;
      case 'pageup':
        scrollBy(-bodyRows());
        break;
      case 'pagedown':
        scrollBy(bodyRows());
        break;
      case 'home':
        offset = 0;
        draw();
        break;
      case 'end':
        offset = Number.MAX_SAFE_INTEGER;
        draw();
        break;
    }
  });
}

async function main(): Promise<void> {
  if (opts.once || !interactive) {
    // 单帧模式：完整打印一帧，适合管道/重定向
    try {
      const procs = await listProcesses();
      const lines = renderFrame(groupProcesses(procs), {
        width: stdout.columns ?? 120,
        top: opts.top,
        timestamp: new Date(),
        intervalSec: opts.interval,
        totalProcs: procs.length,
      });
      console.log(lines.join('\n'));
      process.exit(0);
    } catch (e) {
      console.error(chalk.red(`采集失败：${e instanceof Error ? e.message : String(e)}`));
      console.error(chalk.yellow('提示：taskmon 依赖 Windows 内置命令 tasklist，请在 Windows 上运行。'));
      process.exit(1);
    }
  }

  process.on('SIGINT', () => quit());
  stdout.on('resize', () => draw());
  setupKeys();
  stdout.write('\x1b[2J\x1b[3J\x1b[H\x1b[?25l');
  await tick();
}

void main();
