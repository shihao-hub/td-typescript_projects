#!/usr/bin/env node
import { stdin, stdout } from 'node:process';
import readline from 'node:readline';
import chalk from 'chalk';
import { Command } from 'commander';
import { logger } from './logger.js';
import { listProcesses } from './tasklist.js';
import { groupProcesses } from './grouping.js';
import { readSysMem } from './sysmem.js';
import { renderFrame } from './render.js';
import type { Frame } from './render.js';
import { allLines } from './render.js';
import { formatBytes, truncate } from './format.js';
import { guardKill, killPids } from './kill.js';
import { activateInstance, ensureSingleton, releaseLock } from './singleton.js';
import type { LockDecision } from './singleton.js';
import type { ProcessGroup } from './types.js';

const program = new Command();
program
  .name('taskmon')
  .description('Windows 任务管理器·内存版：按进程名分组展示内存占用，控制台实时刷新')
  .option('-i, --interval <seconds>', '刷新间隔（秒），最小 1', (v) => Math.max(1, Number(v) || 2), 2)
  .option('-t, --top <n>', '只显示内存最大的前 n 组（0 = 全部）', (v) => Math.max(0, Math.floor(Number(v) || 0)), 0)
  .option('-e, --expand', '展开全部分组（默认全部折叠，交互中可用 Enter/a 控制）')
  .option('--once', '输出一帧快照后退出（调试 / 管道友好）')
  .option('--multi', '跳过全局单例锁，允许多实例并行')
  .version(process.env.TASKMON_VERSION ?? 'dev');
program.parse();

const opts = program.opts<{ interval: number; top: number; expand: boolean; once: boolean; multi: boolean }>();
const interactive = Boolean(stdout.isTTY);

let groups: ProcessGroup[] = [];
let totalProcs = 0;
let lastDate = new Date();
let sysMem = readSysMem();
let error: string | undefined;
let lastLoggedError: string | undefined;
let offset = 0;
let cursor = 0;
let running = true;
let timer: NodeJS.Timeout | undefined;
let lastFrame: Frame | undefined;

/** 已展开的组名集合（默认空 = 全部折叠） */
const expandedNames = new Set<string>();
let expandInitialized = false;

/** kill 交互状态机：normal（无）→ confirm → running → result */
type KillState =
  | { phase: 'confirm'; name: string; pids: number[]; memBytes: number }
  | { phase: 'running'; name: string; pids: number[]; progress?: string }
  | { phase: 'result'; text: string };
let killState: KillState | undefined;

/** 底部通知（护栏拒绝等提示），到期自动消失 */
let notice: { text: string; timer: NodeJS.Timeout } | undefined;
let resultTimer: NodeJS.Timeout | undefined;
/** confirm 态冻结自动刷新：防止确认期间列表变动导致 PID 快照与界面错位 */
let frozen = false;

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
    sysMem = readSysMem();
    error = undefined;
    lastLoggedError = undefined;
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
    if (error !== lastLoggedError) {
      lastLoggedError = error;
      logger.error({ err: error }, '采集进程数据失败');
    }
  }
  draw();
  if (running && !frozen) {
    timer = setTimeout(() => {
      void tick();
    }, opts.interval * 1000);
  }
}

function currentFrame(): Frame {
  if (error) {
    return {
      header: [],
      body: [
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
    sysMem,
    expanded: expandedNames,
    cursorIndex: interactive ? cursor : undefined,
  });
}

/** body 可视行数：终端行数 - 固定表头 - 底部状态行 */
function bodyRows(): number {
  const headerCount = lastFrame?.header.length ?? 4;
  return Math.max(4, (stdout.rows ?? 40) - headerCount - 1);
}

/** 底部状态行：kill 确认/执行/结果与护栏通知优先于按键提示 */
function statusLine(hint: string, width: number): string {
  if (killState) {
    if (killState.phase === 'confirm') {
      return chalk.bgYellow.black(
        truncate(` 结束 ${killState.pids.length} 个 ${killState.name} 进程（共 ${formatBytes(killState.memBytes)}）？ y 确认 / n 取消 `, width - 2),
      );
    }
    if (killState.phase === 'running') {
      return chalk.yellow(truncate(` ${killState.progress ?? `正在结束 ${killState.name} 进程...`}`, width - 2));
    }
    return truncate(` ${killState.text}`, width - 2);
  }
  if (notice) return truncate(` ${notice.text}`, width - 2);
  return hint;
}

/** 短通知（如护栏拒绝），数秒后自动消失 */
function showNotice(text: string): void {
  if (notice) clearTimeout(notice.timer);
  notice = {
    text,
    timer: setTimeout(() => {
      notice = undefined;
      draw();
    }, 3_000),
  };
  draw();
}

function startKillConfirm(): void {
  const g = shownGroups()[cursor];
  if (!g) return;
  const guard = guardKill(g, process.pid);
  if (!guard.ok) {
    showNotice(chalk.red(guard.reason ?? '禁止结束'));
    return;
  }
  // 冻结自动刷新，防止确认期间列表刷新导致快照与界面错位
  if (timer) clearTimeout(timer);
  frozen = true;
  killState = {
    phase: 'confirm',
    name: g.name,
    pids: g.processes.map((p) => p.pid),
    memBytes: g.totalBytes,
  };
  draw();
}

function cancelKill(): void {
  killState = undefined;
  frozen = false;
  refreshNow();
}

function scheduleResultClear(): void {
  if (resultTimer) clearTimeout(resultTimer);
  resultTimer = setTimeout(() => {
    if (killState?.phase === 'result') {
      killState = undefined;
      draw();
    }
  }, 6_000);
}

function clearKillState(): void {
  if (resultTimer) {
    clearTimeout(resultTimer);
    resultTimer = undefined;
  }
  killState = undefined;
}

async function executeKill(): Promise<void> {
  const st = killState;
  if (!st || st.phase !== 'confirm') return;
  killState = { phase: 'running', name: st.name, pids: st.pids };
  draw();
  const results = await killPids(st.pids, undefined, (p) => {
    if (killState?.phase === 'running') {
      killState.progress = `正在结束 ${st.name} 进程 (${p.i}/${p.total}) · PID ${p.pid}`;
      draw();
    }
  });
  const killed = results.filter((r) => r.outcome === 'killed').length;
  const gone = results.filter((r) => r.outcome === 'gone').length;
  const failed = results.filter((r) => r.outcome === 'failed');
  const parts = [`已结束 ${chalk.green.bold(String(killed))}`];
  if (gone > 0) parts.push(`已退出 ${gone}`);
  if (failed.length > 0) {
    parts.push(`失败 ${chalk.red.bold(String(failed.length))}${chalk.dim(`(${failed.map((f) => `PID ${f.pid}:${f.detail ?? '?'}`).join(', ')})`)}`);
  }
  killState = { phase: 'result', text: `${chalk.bold(st.name)}：${parts.join(' · ')}` };
  logger.info({ group: st.name, pids: st.pids, results }, 'kill 分组进程');
  frozen = false;
  await tick();
  scheduleResultClear();
}


function draw(): void {
  const frame = currentFrame();
  lastFrame = frame;
  const width = stdout.columns ?? 100;
  const body = bodyRows();
  const maxOffset = Math.max(0, frame.body.length - body);

  // 光标合法性 + 视口跟随（保证光标行可见；行号均为 body 相对行号）
  if (frame.groupRows.length > 0) {
    cursor = Math.max(0, Math.min(cursor, frame.groupRows.length - 1));
    const cursorRow = frame.groupRows[cursor]!;
    if (cursorRow < offset) offset = cursorRow;
    else if (cursorRow > offset + body - 1) offset = cursorRow - body + 1;
  }
  offset = Math.max(0, Math.min(offset, maxOffset));

  // 固定区（header）不参与滚动，滚动区（body）按 offset 切片
  const rows = [...frame.header, ...frame.body.slice(offset, offset + body)];
  const fullRows = (stdout.rows ?? 40) - 1;
  while (rows.length < fullRows) rows.push('');

  const parts: string[] = [];
  if (offset > 0) parts.push(`↑ 上方还有 ${offset} 行`);
  if (maxOffset - offset > 0) parts.push(`↓ 下方还有 ${maxOffset - offset} 行`);
  parts.push('↑↓ 选择 · Enter 展开/收起 · a 全部展开/收起 · k 结束组 · 空格 刷新 · q 退出');
  rows.push(statusLine(chalk.dim(truncate(parts.join('   '), width - 2)), width));

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
  if (notice) clearTimeout(notice.timer);
  if (resultTimer) clearTimeout(resultTimer);
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
    // kill 执行中：忽略一切按键（Ctrl+C 除外）
    if (killState?.phase === 'running') return;
    // kill 确认中：仅 y 执行，n/Esc/q 取消，其余忽略
    if (killState?.phase === 'confirm') {
      if (key.name === 'y') void executeKill();
      else if (key.name === 'n' || key.name === 'escape' || key.name === 'q') cancelKill();
      return;
    }
    // kill 结果条：任意键先清除，再正常处理该键
    if (killState?.phase === 'result') clearKillState();
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
      case 'k':
        startKillConfirm();
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

/**
 * 全局单例：已有实例则提示并唤起其控制台窗口后退出（退出码 0）；成为首实例则接管锁并在退出时释放。
 * 仅约束交互 TUI 模式：--once / 管道输出不抢锁也不受阻（脚本可并发用快照）。
 */
async function guardSingleton(): Promise<void> {
  let decision: LockDecision;
  try {
    decision = await ensureSingleton();
  } catch (e) {
    // 锁目录不可写等：降级为无单例保护，绝不因单例故障阻塞启动
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, '单例锁检查异常，跳过单例保护');
    return;
  }
  if (decision.action === 'claim') {
    process.on('exit', () => releaseLock());
    process.title = 'taskmon'; // WT 下便于辨识标签页（唤起只前置窗口，不保证切标签）
    return;
  }
  const { info } = decision;
  const modeText = info.mode === 'exe' ? `exe v${info.version}` : 'dev（pnpm dev / pnpm start）';
  console.log(chalk.yellow(`taskmon 已在运行：${modeText} · PID ${info.pid}`));
  console.log(chalk.dim('正在唤起原窗口…'));
  const r = await activateInstance(info.pid);
  if (!r.ok) console.log(chalk.dim(`无法唤起原窗口（${r.reason}），请手动切换过去`));
  console.log(chalk.dim(`找不到原窗口？结束旧实例：taskkill /PID ${info.pid} /F；或加 --multi 并行运行`));
  logger.info({ existingPid: info.pid, mode: info.mode, activated: r.ok }, '检测到已有实例，唤起后退出');
  process.exit(0);
}

async function main(): Promise<void> {
  logger.info(
    { version: process.env.TASKMON_VERSION ?? 'dev', mode: opts.once ? 'once' : interactive ? 'tui' : 'pipe', interval: opts.interval, top: opts.top },
    'taskmon 启动',
  );
  if (!opts.once && interactive && !opts.multi) {
    await guardSingleton();
  }
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
        sysMem: readSysMem(),
        expandAll: opts.expand,
      });
      console.log(allLines(frame).join('\n'));
      process.exit(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error({ err: msg, mode: 'once' }, '采集进程数据失败');
      console.error(chalk.red(`采集失败：${msg}`));
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
