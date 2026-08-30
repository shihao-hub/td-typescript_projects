#!/usr/bin/env node
import { stdin, stdout } from 'node:process';
import readline from 'node:readline';
import chalk from 'chalk';
import { Command } from 'commander';
import { listProcesses } from './tasklist.js';
import { groupProcesses } from './grouping.js';
import { renderFrame } from './render.js';
import type { Frame } from './render.js';
import { truncate } from './format.js';
import type { ProcessGroup } from './types.js';

const program = new Command();
program
  .name('taskmon')
  .description('Windows 任务管理器·内存版：按进程名分组展示内存占用，控制台实时刷新')
  .option('-i, --interval <seconds>', '刷新间隔（秒），最小 1', (v) => Math.max(1, Number(v) || 2), 2)
  .option('-t, --top <n>', '只显示内存最大的前 n 组（0 = 全部）', (v) => Math.max(0, Math.floor(Number(v) || 0)), 0)
  .option('-e, --expand', '展开全部分组（默认全部折叠，交互中可用 Enter/a 控制）')
  .option('--once', '输出一帧快照后退出（调试 / 管道友好）')
  .version(process.env.TASKMON_VERSION ?? 'dev');
program.parse();

const opts = program.opts<{ interval: number; top: number; expand: boolean; once: boolean }>();
const interactive = Boolean(stdout.isTTY);

let groups: ProcessGroup[] = [];
let totalProcs = 0;
let lastDate = new Date();
let error: string | undefined;
let offset = 0;
let cursor = 0;
let running = true;
let timer: NodeJS.Timeout | undefined;
let lastFrame: Frame | undefined;

/** 已展开的组名集合（默认空 = 全部折叠） */
const expandedNames = new Set<string>();
let expandInitialized = false;

/** top 过滤后的可见组列表（与光标序号对应） */
function shownGroups(): ProcessGroup[] {
  return opts.top > 0 ? groups.slice(0, opts.top) : groups;
}

function multiGroups(): ProcessGroup[] {
  return shownGroups().filter((g) => g.processes.length > 1);
}

async function tick(): Promise<void> {
  try {
    const procs = await listProcesses();
    groups = groupProcesses(procs);
    totalProcs = procs.length;
    lastDate = new Date();
    error = undefined;
    if (!expandInitialized) {
      expandInitialized = true;
      if (opts.expand) {
        for (const g of groups) {
          if (g.processes.length > 1) expandedNames.add(g.name);
        }
      }
    }
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

function currentFrame(): Frame {
  if (error) {
    return {
      lines: [
        chalk.red.bold('采集进程数据失败'),
        '',
        chalk.red(error),
        '',
        chalk.yellow('提示：taskmon 依赖 Windows 内置命令 tasklist，请在 Windows 上运行。'),
      ],
      groupRows: [],
    };
  }
  return renderFrame(groups, {
    width: stdout.columns ?? 100,
    top: opts.top,
    timestamp: lastDate,
    intervalSec: opts.interval,
    totalProcs,
    expanded: expandedNames,
    cursorIndex: interactive ? cursor : undefined,
  });
}

function bodyRows(): number {
  return Math.max(4, (stdout.rows ?? 40) - 1);
}

function draw(): void {
  const frame = currentFrame();
  lastFrame = frame;
  const lines = frame.lines;
  const width = stdout.columns ?? 100;
  const body = bodyRows();
  const maxOffset = Math.max(0, lines.length - body);

  // 光标合法性 + 视口跟随（保证光标行可见）
  if (frame.groupRows.length > 0) {
    cursor = Math.max(0, Math.min(cursor, frame.groupRows.length - 1));
    const cursorRow = frame.groupRows[cursor]!;
    if (cursorRow < offset) offset = cursorRow;
    else if (cursorRow > offset + body - 1) offset = cursorRow - body + 1;
  }
  offset = Math.max(0, Math.min(offset, maxOffset));

  const rows = lines.slice(offset, offset + body);
  while (rows.length < body) rows.push('');

  const parts: string[] = [];
  if (offset > 0) parts.push(`↑ 上方还有 ${offset} 行`);
  if (maxOffset - offset > 0) parts.push(`↓ 下方还有 ${maxOffset - offset} 行`);
  parts.push('↑↓ 选择 · Enter 展开/收起 · a 全部展开/收起 · 空格 刷新 · q 退出');
  rows.push(chalk.dim(truncate(parts.join('   '), width)));

  stdout.write('\x1b[H' + rows.map((l) => l + '\x1b[K').join('\n') + '\x1b[K');
}

function moveCursor(delta: number): void {
  cursor += delta;
  draw();
}

function pageMove(delta: number): void {
  const body = bodyRows();
  let step = 1;
  if (lastFrame) {
    const visible = lastFrame.groupRows.filter((r) => r >= offset && r < offset + body).length;
    if (visible > 0) step = visible;
  }
  moveCursor(delta * step);
}

function setExpanded(open: boolean): void {
  const g = shownGroups()[cursor];
  if (!g || g.processes.length <= 1) return;
  if (open) expandedNames.add(g.name);
  else expandedNames.delete(g.name);
  draw();
}

function toggleCurrent(): void {
  const g = shownGroups()[cursor];
  if (!g || g.processes.length <= 1) return;
  if (expandedNames.has(g.name)) expandedNames.delete(g.name);
  else expandedNames.add(g.name);
  draw();
}

function toggleAll(): void {
  const multis = multiGroups();
  if (multis.length === 0) return;
  const allOpen = multis.every((g) => expandedNames.has(g.name));
  for (const g of multis) {
    if (allOpen) expandedNames.delete(g.name);
    else expandedNames.add(g.name);
  }
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
    if (key.sequence === '+') {
      setExpanded(true);
      return;
    }
    if (key.sequence === '-') {
      setExpanded(false);
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
        moveCursor(-1);
        break;
      case 'down':
        moveCursor(1);
        break;
      case 'pageup':
        pageMove(-1);
        break;
      case 'pagedown':
        pageMove(1);
        break;
      case 'home':
        cursor = 0;
        draw();
        break;
      case 'end':
        cursor = Number.MAX_SAFE_INTEGER;
        draw();
        break;
      case 'enter':
      case 'return':
        toggleCurrent();
        break;
      case 'right':
        setExpanded(true);
        break;
      case 'left':
        setExpanded(false);
        break;
      case 'a':
        toggleAll();
        break;
    }
  });
}

async function main(): Promise<void> {
  if (opts.once || !interactive) {
    // 单帧模式：完整打印一帧，适合管道/重定向；-e 展开全部
    try {
      const procs = await listProcesses();
      const frame = renderFrame(groupProcesses(procs), {
        width: stdout.columns ?? 120,
        top: opts.top,
        timestamp: new Date(),
        intervalSec: opts.interval,
        totalProcs: procs.length,
        expandAll: opts.expand,
      });
      console.log(frame.lines.join('\n'));
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
