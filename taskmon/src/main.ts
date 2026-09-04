#!/usr/bin/env node
import { stdin, stdout } from 'node:process';
import readline from 'node:readline';
import chalk from 'chalk';
import { Command } from 'commander';
import { logger } from './logger.js';
import { listProcesses } from './tasklist.js';
import { groupProcesses } from './grouping.js';
import { readSysMem } from './sysmem.js';
import { renderFrame, renderTreeFrame } from './render.js';
import type { Frame } from './render.js';
import { allLines } from './render.js';
import { formatBytes, truncate } from './format.js';
import { guardKill, killPids } from './kill.js';
import { collectCimProcesses } from './cim.js';
import type { CimProc } from './cim.js';
import { buildTree, collectNodes, defaultExpandedRootPids, flattenTree, mergeTopology, subtreeProcesses } from './proctree.js';
import type { TreeRow } from './proctree.js';
import { activateInstance, ensureSingleton, releaseLock } from './singleton.js';
import type { LockDecision } from './singleton.js';
import type { ProcessGroup, ProcessInfo } from './types.js';

const program = new Command();
program
  .name('taskmon')
  .description('Windows 任务管理器·内存版：按进程名分组展示内存占用，控制台实时刷新')
  .option('-i, --interval <seconds>', '刷新间隔（秒），最小 1', (v) => Math.max(1, Number(v) || 2), 2)
  .option('-t, --top <n>', '只显示内存最大的前 n 组（0 = 全部）', (v) => Math.max(0, Math.floor(Number(v) || 0)), 0)
  .option('-e, --expand', '展开全部分组（默认全部折叠，交互中可用 Enter/a 控制）')
  .option('--tree', '进程树视图：按父子孙树展示（交互模式为初始视图，T 键随时切换）')
  .option('--once', '输出一帧快照后退出（调试 / 管道友好）')
  .option('--multi', '跳过全局单例锁，允许多实例并行')
  .version(process.env.TASKMON_VERSION ?? 'dev');
program.parse();

const opts = program.opts<{
  interval: number;
  top: number;
  expand: boolean;
  tree: boolean;
  once: boolean;
  multi: boolean;
}>();
const interactive = Boolean(stdout.isTTY);

let groups: ProcessGroup[] = [];
let procs: ProcessInfo[] = [];
let treeRoots: ReturnType<typeof buildTree> = [];
let viewMode: 'group' | 'tree' = opts.tree ? 'tree' : 'group';
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

/** 已展开的组名集合（分组视图，默认空 = 全部折叠） */
const expandedNames = new Set<string>();
let expandInitialized = false;
/** 已展开的树节点 PID 集合（树视图，默认空 = 只显示根行） */
const expandedNodes = new Set<number>();
/** explorer 根默认展开只做一次：用户手动收起后不复活；explorer 未运行时等它出现再补 */
let treeDefaultExpanded = false;

/** CIM 拓扑状态：最近快照 + overlap-skip 采集循环（独立于 tasklist 主刷新） */
let cimMap = new Map<number, CimProc>();
let cimAt: Date | undefined;
let cimBusy = false;
let cimWarned = false;
let cimTimer: NodeJS.Timeout | undefined;

/** kill 交互状态机：normal（无）→ confirm → running → result */
type KillState =
  | { phase: 'confirm'; name: string; pids: number[]; memBytes: number; count?: number; label?: string }
  | { phase: 'running'; name: string; pids: number[]; progress?: string; label?: string }
  | { phase: 'result'; text: string };
let killState: KillState | undefined;

/** 搜索跳转：/ 进入输入，Enter 跳首个匹配，n 循环下一个（保留最近一次结果） */
let searchMode = false;
let searchQuery = '';
/** 树视图：匹配节点 PID（按子树内存降序） */
let matchPids: number[] = [];
/** 分组视图：匹配组在可见组列表中的下标 */
let matchGroups: number[] = [];
let matchIdx = 0;

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

/** 树视图当前可见行（top 过滤根后按 expandedNodes 折叠） */
function shownTreeRows(): TreeRow[] {
  const roots = opts.top > 0 ? treeRoots.slice(0, opts.top) : treeRoots;
  return flattenTree(roots, expandedNodes);
}

/** 用最近一次 CIM 快照补全进程拓扑并重算分组与树 */
function applyTopology(): void {
  procs = mergeTopology(procs, cimMap);
  groups = groupProcesses(procs);
  treeRoots = buildTree(procs);
  if (!treeDefaultExpanded) {
    const pids = defaultExpandedRootPids(treeRoots);
    if (pids.length > 0) {
      for (const pid of pids) expandedNodes.add(pid);
      treeDefaultExpanded = true;
    }
  }
}

async function tick(): Promise<void> {
  try {
    procs = await listProcesses();
    applyTopology();
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
        for (const r of treeRoots) {
          if (r.children.length > 0) expandedNodes.add(r.proc.pid);
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

function scheduleCim(): void {
  if (!running) return;
  cimTimer = setTimeout(() => {
    void cimTick();
  }, opts.interval * 1000);
}

/**
 * CIM 拓扑采集循环（低节奏副通道）：
 * - overlap-skip：上一次没跑完不发起下一次（CIM 实测 2-4s > 默认间隔，天然滞后无感）
 * - 失败降级：只 warn 一次日志，组视图丢父列、树视图提示拓扑不可用，绝不阻塞 tasklist 主刷新
 */
async function cimTick(): Promise<void> {
  if (!running) return;
  if (frozen || cimBusy) {
    scheduleCim();
    return;
  }
  cimBusy = true;
  try {
    cimMap = await collectCimProcesses();
    cimAt = new Date();
    if (procs.length > 0) {
      applyTopology();
      draw();
    }
  } catch (e) {
    if (!cimWarned) {
      cimWarned = true;
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'CIM 拓扑采集失败，进程树视图降级（主刷新不受影响）');
    }
  } finally {
    cimBusy = false;
    scheduleCim();
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
  if (viewMode === 'tree') {
    return renderTreeFrame(treeRoots, {
      width: stdout.columns ?? 100,
      top: opts.top,
      timestamp: lastDate,
      intervalSec: opts.interval,
      totalProcs,
      sysMem,
      expanded: expandedNodes,
      cursorIndex: interactive ? cursor : undefined,
      topoAvailable: cimMap.size > 0,
      topoLagSec: cimAt ? (lastDate.getTime() - cimAt.getTime()) / 1000 : undefined,
    });
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

/** 底部状态行：搜索输入 > kill 确认/执行/结果与护栏通知 > 按键提示 */
function statusLine(hint: string, width: number): string {
  if (searchMode) {
    return chalk.bold.cyan(truncate(` /${searchQuery}█  (Enter 跳转 · Esc 取消)`, width - 2));
  }
  if (killState) {
    if (killState.phase === 'confirm') {
      const label = killState.label ?? killState.name;
      const count = killState.count ?? killState.pids.length;
      return chalk.bgYellow.black(
        truncate(` 结束 ${label}（${count} 个进程 / ${formatBytes(killState.memBytes)}）？ y 确认 / n 取消 `, width - 2),
      );
    }
    if (killState.phase === 'running') {
      return chalk.yellow(truncate(` ${killState.progress ?? `正在结束 ${killState.label ?? killState.name} 进程...`}`, width - 2));
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
  if (viewMode === 'tree') {
    startKillConfirmTree();
    return;
  }
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

/**
 * 树视图的子树 kill：只对选中节点发单个 taskkill /F /T（连带整棵子树，复用 15s 超时回退）。
 * 护栏复用 guardKill：以子树全部进程构造伪分组（保护名单按节点名判、防自杀查整棵子树）。
 */
function startKillConfirmTree(): void {
  const row = shownTreeRows()[cursor];
  if (!row) return;
  const subtree = subtreeProcesses(row.node);
  const pseudo: ProcessGroup = {
    name: row.node.proc.name,
    processes: subtree,
    totalBytes: row.node.subtreeBytes,
    maxSingleBytes: Math.max(...subtree.map((s) => s.memBytes)),
  };
  const guard = guardKill(pseudo, process.pid);
  if (!guard.ok) {
    showNotice(chalk.red(guard.reason ?? '禁止结束'));
    return;
  }
  if (timer) clearTimeout(timer);
  frozen = true;
  killState = {
    phase: 'confirm',
    name: row.node.proc.name,
    pids: [row.node.proc.pid],
    memBytes: row.node.subtreeBytes,
    count: subtree.length,
    label: `${row.node.proc.name} 子树(PID ${row.node.proc.pid})`,
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
  killState = { phase: 'running', name: st.name, pids: st.pids, label: st.label };
  draw();
  const results = await killPids(st.pids, undefined, (p) => {
    if (killState?.phase === 'running') {
      killState.progress = `正在结束 ${st.label ?? st.name} 进程 (${p.i}/${p.total}) · PID ${p.pid}`;
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
  killState = { phase: 'result', text: `${chalk.bold(st.label ?? st.name)}：${parts.join(' · ')}` };
  logger.info({ target: st.label ?? st.name, pids: st.pids, results }, 'kill 进程（组/子树）');
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
  parts.push(
    viewMode === 'tree'
      ? '↑↓ 选择 · Enter 展开/收起 · / 查找 · a 全部展开/收起 · k 结束子树 · T 分组视图 · 空格 刷新 · q 退出'
      : '↑↓ 选择 · Enter 展开/收起 · / 查找 · a 全部展开/收起 · k 结束组 · T 进程树 · 空格 刷新 · q 退出',
  );
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

/** 分组视图 / 树视图共用的展开收起，按 viewMode 分流 */
function setExpanded(open: boolean): void {
  if (viewMode === 'tree') {
    const row = shownTreeRows()[cursor];
    if (!row || !row.hasChildren) return;
    if (open) expandedNodes.add(row.node.proc.pid);
    else expandedNodes.delete(row.node.proc.pid);
    draw();
    return;
  }
  const g = shownGroups()[cursor];
  if (!g || g.processes.length <= 1) return;
  if (open) expandedNames.add(g.name);
  else expandedNames.delete(g.name);
  draw();
}

function toggleCurrent(): void {
  if (viewMode === 'tree') {
    const row = shownTreeRows()[cursor];
    if (!row || !row.hasChildren) return;
    if (expandedNodes.has(row.node.proc.pid)) expandedNodes.delete(row.node.proc.pid);
    else expandedNodes.add(row.node.proc.pid);
    draw();
    return;
  }
  const g = shownGroups()[cursor];
  if (!g || g.processes.length <= 1) return;
  if (expandedNames.has(g.name)) expandedNames.delete(g.name);
  else expandedNames.add(g.name);
  draw();
}

function toggleAll(): void {
  if (viewMode === 'tree') {
    const parents = shownTreeRows().filter((r) => r.hasChildren);
    if (parents.length === 0) return;
    const allOpen = parents.every((r) => expandedNodes.has(r.node.proc.pid));
    for (const r of parents) {
      if (allOpen) expandedNodes.delete(r.node.proc.pid);
      else expandedNodes.add(r.node.proc.pid);
    }
    draw();
    return;
  }
  const multis = multiGroups();
  if (multis.length === 0) return;
  const allOpen = multis.every((g) => expandedNames.has(g.name));
  for (const g of multis) {
    if (allOpen) expandedNames.delete(g.name);
    else expandedNames.add(g.name);
  }
  draw();
}

/** T 键：分组视图 ↔ 树视图切换（光标与视口复位） */
function toggleView(): void {
  viewMode = viewMode === 'group' ? 'tree' : 'group';
  cursor = 0;
  offset = 0;
  draw();
}

/** 树视图跳转：展开祖先链让目标行可见，再把光标移过去 */
function treeJumpToPid(pid: number): boolean {
  const roots = opts.top > 0 ? treeRoots.slice(0, opts.top) : treeRoots;
  const byPid = collectNodes(roots);
  const node = byPid.get(pid);
  if (!node) return false;
  let ppid = node.proc.ppid;
  while (ppid !== undefined) {
    const parent = byPid.get(ppid);
    if (!parent) break;
    expandedNodes.add(ppid);
    ppid = parent.proc.ppid;
  }
  const rows = shownTreeRows();
  const i = rows.findIndex((r) => r.node.proc.pid === pid);
  if (i < 0) return false;
  cursor = i;
  draw();
  return true;
}

/** 按当前关键词计算匹配（树：全树含折叠节点，按子树内存降序；组：可见组名） */
function computeMatches(q: string): void {
  if (viewMode === 'tree') {
    const roots = opts.top > 0 ? treeRoots.slice(0, opts.top) : treeRoots;
    matchPids = [...collectNodes(roots).values()]
      .filter((n) => n.proc.name.toLowerCase().includes(q))
      .sort((a, b) => b.subtreeBytes - a.subtreeBytes)
      .map((n) => n.proc.pid);
  } else {
    matchGroups = shownGroups()
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => g.name.toLowerCase().includes(q))
      .map(({ i }) => i);
  }
}

function matchTotal(): number {
  return viewMode === 'tree' ? matchPids.length : matchGroups.length;
}

function jumpToMatch(idx: number): void {
  if (viewMode === 'tree') {
    const pid = matchPids[idx]!;
    if (!treeJumpToPid(pid)) {
      showNotice(chalk.yellow(`第 ${idx + 1} 个匹配当前不可达（可能已退出）`));
      return;
    }
  } else {
    cursor = matchGroups[idx]!;
    draw();
  }
}

/** Enter：结束输入并跳首个匹配 */
function executeSearch(): void {
  const raw = searchQuery.trim();
  searchMode = false;
  if (!raw) {
    draw();
    return;
  }
  computeMatches(raw.toLowerCase());
  if (matchTotal() === 0) {
    showNotice(chalk.yellow(`未找到匹配 "${raw}"`));
    return;
  }
  matchIdx = 0;
  jumpToMatch(0);
  showNotice(`匹配 1/${matchTotal()}：${raw}（n 下一个）`);
}

/** n：循环下一个匹配 */
function nextMatch(): void {
  if (matchTotal() === 0) {
    showNotice(chalk.dim('无活跃搜索，按 / 开始'));
    return;
  }
  matchIdx = (matchIdx + 1) % matchTotal();
  jumpToMatch(matchIdx);
  showNotice(`匹配 ${matchIdx + 1}/${matchTotal()}（n 下一个）`);
}

function refreshNow(): void {
  if (timer) clearTimeout(timer);
  void tick();
}

function quit(): void {
  if (!running) return;
  running = false;
  if (timer) clearTimeout(timer);
  if (cimTimer) clearTimeout(cimTimer);
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
  // 离开备用屏缓冲区，恢复进入前的主屏内容（无需手工清屏，scrollback 完整保留）
  stdout.write('\x1b[?1049l');
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
    // 搜索输入模式：可打印字符追加 / Backspace 删除 / Enter 执行 / Esc 取消，其余吞掉
    if (searchMode) {
      if (key.name === 'escape') {
        searchMode = false;
        searchQuery = '';
        draw();
      } else if (key.name === 'enter' || key.name === 'return') {
        executeSearch();
      } else if (key.name === 'backspace') {
        searchQuery = searchQuery.slice(0, -1);
        draw();
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        searchQuery += key.sequence;
        draw();
      }
      return;
    }
    if (key.sequence === '/') {
      searchMode = true;
      searchQuery = '';
      draw();
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
      case 'k':
        startKillConfirm();
        break;
      case 't':
        toggleView();
        break;
      case 'n':
        nextMatch();
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
    // 单帧模式：完整打印一帧，适合管道/重定向；-e 展开全部；--once --tree 输出进程树快照
    try {
      const raw = await listProcesses();
      // CIM 采集失败仅降级（丢父列/树退化），不阻塞单帧输出
      let cim = new Map<number, CimProc>();
      try {
        cim = await collectCimProcesses();
      } catch (e) {
        logger.warn({ err: e instanceof Error ? e.message : String(e) }, '单帧模式 CIM 采集失败，拓扑降级');
      }
      const decorated = mergeTopology(raw, cim);
      const frame = opts.tree
        ? renderTreeFrame(buildTree(decorated), {
            width: stdout.columns ?? 120,
            top: opts.top,
            timestamp: new Date(),
            intervalSec: opts.interval,
            totalProcs: decorated.length,
            sysMem: readSysMem(),
            expandAll: opts.expand,
            topoAvailable: cim.size > 0,
          })
        : renderFrame(groupProcesses(decorated), {
            width: stdout.columns ?? 120,
            top: opts.top,
            timestamp: new Date(),
            intervalSec: opts.interval,
            totalProcs: decorated.length,
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
  stdout.on('resize', () => {
    // resize 后整屏重画：清掉旧尺寸可能残留的行，避免表头/正文错位残留
    stdout.write('\x1b[2J\x1b[H');
    draw();
  });
  setupKeys();
  // 进入备用屏缓冲区：TUI 画在独立屏幕上，不污染主屏 scrollback，
  // resize 时终端也不会对主屏做 reflow，杜绝旧帧表头残留
  process.on('exit', () => {
    // 兜底：异常退出/被强杀前尽力恢复终端（正常 quit 已恢复，重复写幂等）
    try {
      stdout.write('\x1b[?25h\x1b[?1049l');
    } catch {
      // 忽略：终端已恢复
    }
  });
  stdout.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l');
  await tick();
  // CIM 拓扑副通道：与 tasklist 主刷新并行，overlap-skip 低节奏轮询
  void cimTick();
}

void main();
