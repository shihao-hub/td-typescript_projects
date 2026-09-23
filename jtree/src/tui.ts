/**
 * 交互式 TUI：备用屏 + raw mode 按键 + 原地无闪烁重绘（taskmon 同款骨架）。
 *
 * - 纯函数：buildFrame（视口切片 + 光标跟随 + 选中行 + 状态行）、applyKey（按键 reducer）、
 *   buildStatusLine —— 全部可单测，不碰 IO。
 * - 非纯：openKeys（键源分层探测）与 runTui（终端生命周期 + 事件循环）。
 * - 键源分层（互斥，绝不并存——双读者会瓜分同一控制台输入）：
 *   1) stdin 本身是 TTY → process.stdin raw mode；
 *   2) Windows + Bun 且 stdin 被管道占用 → Win32 设置 CONIN$ raw mode，
 *      字节流交给 OpenTUI StdinParser/KeyHandler；
 *   3) Windows + Node 且 stdin 被管道占用 → \\.\CONIN$ + tty.ReadStream；
 *   4) 全部失败 → runTui 返回 false，由调用方降级纯打印。
 * - 数据静态：无定时器，仅在 keypress / resize 事件里重绘。
 */

import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as tty from 'node:tty';
import chalk from 'chalk';
import { clipToWidth, padEndWidth } from './format.js';
import { collectExpandableIds, flattenTree, type FlatRow } from './flatten.js';
import { formatRow } from './render.js';

/** readline keypress 事件的 key 对象子集 */
export interface KeyDescriptor {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export interface TuiState {
  /** 展开中的容器 id 集合 */
  expanded: ReadonlySet<string>;
  /** 当前选中行号（rows 索引） */
  cursor: number;
  /** 视口首行行号 */
  offset: number;
  /** 是否请求退出 */
  quit: boolean;
}

export interface FrameInput {
  width: number;
  height: number;
  cursor: number;
  offset: number;
}

export interface KeyContext {
  rows: readonly FlatRow[];
  allExpandable: ReadonlySet<string>;
  /** 视口正文行数（翻页步长） */
  bodyRows: number;
}

/** 底部状态行：位置/滚动指示 + 按键提示，dim 且按显示宽度截断 */
export function buildStatusLine(width: number, info: { total: number; offset: number; visible: number }): string {
  const above = info.offset;
  const below = Math.max(0, info.total - (info.offset + info.visible));
  const pos = info.total === 0 ? '空' : `${Math.min(info.offset + 1, info.total)}/${info.total} 行`;
  let left = '';
  if (above > 0) left += ` ↑${above}`;
  left += ` · ${pos}`;
  if (below > 0) left += ` ↓${below}`;
  const hint = ' │ ↑↓ 滚动 · ←→/Enter 折叠 · a 全收起 · q 退出';
  return chalk.dim(clipToWidth(left + hint, width));
}

/** 单帧构建：视口切片 + 光标跟随；cursor 行零 ANSI 底稿再整体反色（防 ANSI 嵌套渲坏） */
export function buildFrame(rows: readonly FlatRow[], i: FrameInput): { lines: string[]; offset: number } {
  const body = Math.max(1, i.height - 1); // 底部预留 1 行状态行
  const cur = rows.length === 0 ? 0 : Math.max(0, Math.min(i.cursor, rows.length - 1));
  let offset = i.offset;
  // taskmon 同款视口跟随：光标行必须可见
  if (cur < offset) offset = cur;
  else if (cur > offset + body - 1) offset = cur - body + 1;
  offset = Math.max(0, Math.min(offset, Math.max(0, rows.length - body)));

  const inner = Math.max(1, i.width - 2); // 行首 2 列 gutter（❯ 或空格）
  const lines: string[] = [];
  for (let vi = 0; vi < body; vi++) {
    const idx = offset + vi;
    const row = rows[idx];
    if (row === undefined) {
      lines.push(''); // 垫满空行：防残留 + 状态行位置稳定
      continue;
    }
    if (idx === cur) {
      const plain = formatRow(row, { width: inner, colored: false, indicators: true });
      lines.push(chalk.cyan.inverse(padEndWidth(`❯ ${clipToWidth(plain, inner)}`, i.width)));
    } else {
      lines.push(`  ${formatRow(row, { width: inner, indicators: true })}`);
    }
  }
  lines.push(buildStatusLine(i.width, { total: rows.length, offset, visible: body }));
  return { lines, offset };
}

/** 按键 reducer：只改状态不碰 IO；折叠/展开后行重算与 cursor clamp 由调用方负责 */
export function applyKey(st: TuiState, key: KeyDescriptor, ctx: KeyContext): TuiState {
  if (st.quit) return st;
  const last = Math.max(0, ctx.rows.length - 1);
  const name = key.name ?? '';
  const seq = key.sequence ?? '';
  const plain = !key.ctrl && !key.meta; // 无修饰的可打印字符

  if (name === 'q' || (plain && seq === 'q') || (key.ctrl && name === 'c')) return { ...st, quit: true };

  // 移动（k/j/g/G 为 vim 顺手键）
  if (name === 'up' || (plain && seq === 'k')) return { ...st, cursor: Math.max(0, st.cursor - 1) };
  if (name === 'down' || (plain && seq === 'j')) return { ...st, cursor: Math.min(last, st.cursor + 1) };
  if (name === 'pageup') return { ...st, cursor: Math.max(0, st.cursor - ctx.bodyRows) };
  if (name === 'pagedown') return { ...st, cursor: Math.min(last, st.cursor + ctx.bodyRows) };
  if (name === 'home' || (plain && seq === 'g')) return { ...st, cursor: 0 };
  if (name === 'end' || (plain && seq === 'G')) return { ...st, cursor: last };

  // 折叠/展开：只作用于当前行（须为非空容器）
  const row = ctx.rows[st.cursor];
  if (row !== undefined && row.expandable) {
    const setTo = (open: boolean): TuiState => {
      if (row.expanded === open) return st;
      const next = new Set(st.expanded);
      if (open) next.add(row.id);
      else next.delete(row.id);
      return { ...st, expanded: next };
    };
    if (name === 'left' || (plain && seq === '-')) return setTo(false);
    if (name === 'right' || (plain && seq === '+')) return setTo(true);
    if (name === 'enter' || name === 'return' || name === 'space' || (plain && seq === ' ')) {
      return setTo(!row.expanded);
    }
  }

  // 全收起 ↔ 全展开（当前全展开则全收起，否则恢复全展开）
  if (plain && seq === 'a') {
    const allOpen = st.expanded.size >= ctx.allExpandable.size;
    return { ...st, expanded: allOpen ? new Set<string>() : new Set(ctx.allExpandable) };
  }
  return st;
}

/** 键源：统一的按键回调 + 关闭（恢复 raw 模式并释放流/fd） */
interface KeySource {
  onKey(cb: (key: KeyDescriptor) => void): void;
  close(): void;
}

/** Bun FFI 的最小类型面；这里只需要 kernel32 的 console I/O 入口。 */
interface BunFfi {
  ptr(value: ArrayBufferView): number;
  dlopen(
    path: string,
    symbols: Record<string, { args?: string[]; returns?: string }>,
  ): {
    symbols: {
      CreateFileW(...args: unknown[]): bigint;
      GetConsoleMode(handle: bigint | number, mode: Uint32Array): number;
      SetConsoleMode(handle: bigint | number, mode: number): number;
      CloseHandle(handle: bigint): number;
    };
    close(): void;
  };
}

interface RawConsoleHandle {
  previousMode: number;
  close(): void;
}

const WINDOWS_RAW_INPUT_MODE = 0x0008; // ENABLE_WINDOW_INPUT
const INVALID_WINDOWS_HANDLE = 0xffff_ffff_ffff_ffffn;

/** OpenTUI 负责按键协议解析；这里只解决 Bun 下 CONIN$ 的 raw mode。 */
function enableRawConsoleInput(): RawConsoleHandle | undefined {
  const ffi = (globalThis as { Bun?: { FFI?: BunFfi } }).Bun?.FFI;
  if (!ffi) return undefined;

  const kernel32 = ffi.dlopen("kernel32.dll", {
    CreateFileW: {
      args: ["ptr", "u32", "u32", "ptr", "u32", "u32", "ptr"],
      returns: "ptr",
    },
    GetConsoleMode: { args: ["ptr", "ptr"], returns: "i32" },
    SetConsoleMode: { args: ["ptr", "u32"], returns: "i32" },
    CloseHandle: { args: ["ptr"], returns: "i32" },
  });

  const devicePath = "//./CONIN$";
  const widePath = new Uint16Array(devicePath.length + 1);
  for (let i = 0; i < devicePath.length; i += 1) {
    widePath[i] = devicePath.charCodeAt(i);
  }

  const handle = kernel32.symbols.CreateFileW(
    ffi.ptr(widePath),
    0xc0000000, // GENERIC_READ | GENERIC_WRITE
    0x00000003, // FILE_SHARE_READ | FILE_SHARE_WRITE
    0,
    0x00000003, // OPEN_EXISTING
    0,
    0,
  );
  if (handle === 0n || handle === INVALID_WINDOWS_HANDLE) return undefined;

  const mode = new Uint32Array(1);
  if (kernel32.symbols.GetConsoleMode(handle, mode) === 0) {
    kernel32.symbols.CloseHandle(handle);
    return undefined;
  }
  const previousMode = mode[0] ?? 0;
  if (kernel32.symbols.SetConsoleMode(handle, WINDOWS_RAW_INPUT_MODE) === 0) {
    kernel32.symbols.CloseHandle(handle);
    return undefined;
  }

  return {
    previousMode,
    close() {
      kernel32.symbols.SetConsoleMode(handle, previousMode);
      kernel32.symbols.CloseHandle(handle);
    },
  };
}

interface OpenTuiKeyParser {
  push(data: Uint8Array): void;
  drain(onEvent: (event: unknown) => void): void;
  destroy(): void;
}

interface OpenTuiKeyHandler {
  on(event: "keypress", listener: (key: unknown) => void): void;
  processParsedKey(key: unknown): boolean;
}

/** Bun + 管道 stdin：raw mode 用 Win32，按键协议解析交给 OpenTUI。 */
async function openOpenTuiWindowsKeys(): Promise<KeySource | undefined> {
  const consoleHandle = enableRawConsoleInput();
  if (!consoleHandle) return undefined;

  let fd: number | undefined;
  try {
    const { StdinParser, KeyHandler } = await import("@opentui/core");
    let drainKeys: (() => void) | undefined;
    const parser = new StdinParser({
      armTimeouts: true,
      onTimeoutFlush: () => drainKeys?.(),
    }) as unknown as OpenTuiKeyParser;
    const keyHandler = new KeyHandler() as unknown as OpenTuiKeyHandler;

    let keyListener: ((key: KeyDescriptor) => void) | undefined;
    keyHandler.on("keypress", (key) => keyListener?.(key as KeyDescriptor));
    drainKeys = (): void => {
      parser.drain((event) => {
        const { type, key } = event as {
          type?: string;
          key?: KeyDescriptor & { eventType?: string };
        };
        if (type === "key" && key?.eventType !== "release") {
          keyHandler.processParsedKey(key);
        }
      });
    };

    fd = fs.openSync("//./CONIN$", "r+");
    const conin = new tty.ReadStream(fd);
    const onData = (chunk: Buffer | string): void => {
      parser.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      drainKeys();
    };
    conin.on("data", onData);
    conin.unref();

    let closed = false;
    return {
      onKey(callback) {
        keyListener = callback;
      },
      close() {
        if (closed) return;
        closed = true;
        conin.off("data", onData);
        conin.destroy();
        try {
          if (fd !== undefined) fs.closeSync(fd);
        } catch {
          /* fd 已由流关闭或进程退出时由系统回收 */
        }
        parser.destroy();
        consoleHandle.close();
      },
    };
  } catch {
    try {
      if (fd !== undefined) fs.closeSync(fd);
    } catch {
      /* fd 可能尚未成功打开 */
    }
    consoleHandle.close();
    return undefined;
  }
}

/**
 * 键源分层探测（互斥取一）：
 * 1) stdin 是 TTY → process.stdin；
 * 2) Windows + Bun 管道 stdin → Win32 raw mode + OpenTUI parser；
 * 3) Windows + Node 管道 stdin → \\.\CONIN$ r+ + tty.ReadStream；
 * 4) 失败 → undefined（调用方降级纯打印）。
 */
async function openKeys(): Promise<KeySource | undefined> {
  // 1) stdin 本身是 TTY（数据不经管道进入的场景）
  if (process.stdin.isTTY) {
    const stdin = process.stdin;
    try {
      stdin.setRawMode(true);
    } catch {
      return undefined;
    }
    stdin.setEncoding('utf8');
    readline.emitKeypressEvents(stdin);
    return {
      onKey(cb) {
        stdin.on('keypress', (_s: string, key: KeyDescriptor | undefined) => cb(key ?? {}));
      },
      close() {
        try {
          stdin.setRawMode(false);
        } catch {
          /* 已恢复 */
        }
      },
    };
  }

  // 2) Windows + Bun：OpenTUI 解析 CONIN$，绕过 Bun tty.ReadStream raw mode 限制
  if (process.platform === 'win32' && 'bun' in process.versions) {
    const keys = await openOpenTuiWindowsKeys();
    if (keys) return keys;
  }

  // 3) Windows + Node：stdin 被管道占用时直接开控制台输入设备
  if (process.platform === 'win32') {
    try {
      // r+ 读写权限：setRawMode 需要控制台输入缓冲区写权限（只读会 EPERM）
      const fd = fs.openSync('\\\\.\\CONIN$', 'r+');
      const conin = new tty.ReadStream(fd);
      conin.setEncoding('utf8');
      conin.setRawMode(true); // Bun 等运行时在此抛错 → 降级
      readline.emitKeypressEvents(conin);
      return {
        onKey(cb) {
          conin.on('keypress', (_s: string, key: KeyDescriptor | undefined) => cb(key ?? {}));
        },
        close() {
          try {
            conin.setRawMode(false);
          } catch {
            /* 已恢复 */
          }
          try {
            conin.destroy();
          } catch {
            /* 已关闭 */
          }
        },
      };
    } catch {
      return undefined;
    }
  }
  return undefined; // POSIX /dev/tty 键源为后续版本
}

/**
 * 进入交互模式。返回 false 表示无可用键源（未进备用屏），调用方降级纯打印；
 * 正常路径由按键驱动，q/Ctrl+C 时内部恢复终端并 exit(0)。
 */
export async function runTui(value: unknown): Promise<boolean> {
  const keys = await openKeys();
  if (!keys) return false;
  const { stdout } = process;

  const allExpandable = collectExpandableIds(value);
  let st: TuiState = { expanded: new Set(allExpandable), cursor: 0, offset: 0, quit: false };
  let rows = flattenTree(value, { expanded: st.expanded });

  const bodyRows = (): number => Math.max(1, (stdout.rows ?? 24) - 1);
  const draw = (): void => {
    const frame = buildFrame(rows, {
      width: stdout.columns ?? 80,
      height: stdout.rows ?? 24,
      cursor: st.cursor,
      offset: st.offset,
    });
    st.offset = frame.offset;
    // 无闪烁整帧重绘：光标归位 + 逐行覆写 + 行尾擦除
    stdout.write('\x1b[H' + frame.lines.map((l) => `${l}\x1b[K`).join('\n') + '\x1b[K');
  };

  const restore = (): void => {
    try {
      stdout.write('\x1b[?25h\x1b[?1049l'); // 恢复光标 + 离开备用屏（幂等）
    } catch {
      /* 已恢复 */
    }
  };
  const quit = (code = 0): void => {
    keys.close();
    restore();
    process.exit(code);
  };

  keys.onKey((key) => {
    st = applyKey(st, key, { rows, allExpandable, bodyRows: bodyRows() });
    if (st.quit) {
      quit();
      return;
    }
    // 折叠集合变化后整体重算行（O(n)，数据静态无失效问题），cursor 防御性 clamp
    rows = flattenTree(value, { expanded: st.expanded });
    st.cursor = Math.min(st.cursor, Math.max(0, rows.length - 1));
    draw();
  });

  process.on('SIGINT', () => quit(130)); // 非 raw 模式兜底
  process.on('exit', restore); // 异常退出双保险（幂等）
  stdout.on('resize', () => {
    stdout.write('\x1b[2J\x1b[H'); // 清屏防旧尺寸残影
    draw();
  });

  stdout.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l'); // 进备用屏 + 清屏 + 隐藏光标
  draw();
  return true;
}
