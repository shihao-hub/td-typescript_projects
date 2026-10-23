import { app, BrowserWindow, screen } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from '../src/server/server.js';
import { dataDir } from '../src/shared/paths.js';
import { logger } from '../src/shared/logger.js';

/**
 * Electron 窗口宿主：只负责「按需打开的桌面窗口」。
 *
 * - 托盘由独立的轻量 sidecar（tray/TaskmonTray.cs，约 20 MB）常驻；
 * - 本进程在托盘点击 / 直接双击时启动，关窗即整体退出（重渲染与 Chromium 辅助进程全部释放）；
 * - HTTP 服务与窗口同生命周期，GUI 与 CLI `serve` 仍共用同一 Handler。
 *
 * 注意：不能在入口模块顶层 `await app.whenReady()`——Electron 会在入口模块求值完成后
 * 才发出 ready，顶层 await 会与 ready 互相等待形成死锁。启动逻辑一律放进 whenReady().then()。
 */

const CHANNEL = app.isPackaged ? 'prod' : 'dev';
process.env.TASKMON_CHANNEL = CHANNEL;
if (process.env.TASKMON_VERSION === undefined) {
  process.env.TASKMON_VERSION = app.isPackaged ? app.getVersion() : 'dev';
}

const ICON_PATH = join(import.meta.dirname, 'icon.png');

interface WindowState {
  width: number;
  height: number;
  x: number;
  y: number;
  hasPosition: boolean;
  maximised: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1100,
  height: 760,
  x: 0,
  y: 0,
  hasPosition: false,
  maximised: false,
};

let win: BrowserWindow | undefined;
let serverUrl = '';
let saveTimer: NodeJS.Timeout | undefined;

function statePath(): string {
  return join(dataDir(), 'window.json');
}

function loadWindowState(): WindowState {
  try {
    const raw = JSON.parse(readFileSync(statePath(), 'utf8')) as Partial<WindowState>;
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 600 || height < 400) {
      return { ...DEFAULT_STATE };
    }
    return {
      width,
      height,
      x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : 0,
      y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : 0,
      hasPosition: raw.hasPosition === true,
      maximised: raw.maximised === true,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveWindowState(): void {
  if (!win || win.isDestroyed()) return;
  const current = loadWindowState();
  const next: WindowState = { ...current };
  if (win.isMaximized()) {
    next.maximised = true;
  } else if (!win.isMinimized()) {
    const bounds = win.getBounds();
    next.width = bounds.width;
    next.height = bounds.height;
    next.x = bounds.x;
    next.y = bounds.y;
    next.hasPosition = true;
    next.maximised = false;
  }
  try {
    writeFileSync(statePath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, '窗口几何保存失败');
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    saveWindowState();
  }, 700);
}

function ensureOnScreen(): void {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const visible = screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    return centerX >= wa.x && centerX <= wa.x + wa.width && centerY >= wa.y && centerY <= wa.y + wa.height;
  });
  if (!visible) {
    win.center();
    scheduleSave();
  }
}

function createWindow(): void {
  if (!serverUrl) return; // HTTP 服务尚未就绪：避免创建 loadURL('') 的空白窗口
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  const state = loadWindowState();
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.hasPosition ? { x: state.x, y: state.y } : {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#101216',
    title: 'taskmon',
    icon: existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void win.loadURL(serverUrl);
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logger.error({ code, desc, url }, '窗口页面加载失败');
  });

  win.once('ready-to-show', () => {
    if (!win || win.isDestroyed()) return;
    win.show();
    if (state.maximised) win.maximize();
    ensureOnScreen();
  });

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('maximize', scheduleSave);
  win.on('unmaximize', scheduleSave);
  win.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    saveWindowState();
  });
  win.on('closed', () => {
    win = undefined;
  });

  logger.info({ url: serverUrl, maximised: state.maximised }, 'GUI 窗口已创建');
}

app.setPath('userData', dataDir());

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 已有窗口在跑：由主实例聚焦，本进程退出
  app.quit();
} else {
  let startup: Promise<void> = Promise.resolve();

  // 第二个实例可能在 HTTP 服务就绪前到达：等启动完成再聚焦，避免拿到空 URL 的窗口
  app.on('second-instance', () => {
    void startup.then(() => createWindow());
  });

  app.on('window-all-closed', () => {
    // 窗口是唯一常驻形态：关窗即退出，释放全部 Chromium 进程
    app.quit();
  });

  app.on('before-quit', () => {
    saveWindowState();
  });

  startup = app.whenReady().then(async () => {
    try {
      const handle = await startServer(0);
      serverUrl = handle.url;
      logger.info(
        { url: serverUrl, channel: CHANNEL, version: process.env.TASKMON_VERSION },
        'taskmon GUI 启动',
      );
      createWindow();
      app.on('will-quit', () => {
        void handle.close();
      });
    } catch (e) {
      logger.error({ err: e instanceof Error ? e.message : String(e) }, 'GUI 启动失败');
      app.quit();
    }
  });
}
