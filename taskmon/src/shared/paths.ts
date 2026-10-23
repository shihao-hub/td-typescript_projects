import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

export type Channel = 'dev' | 'prod';

/**
 * 运行通道判定：
 * - 构建/宿主显式注入 TASKMON_CHANNEL（Electron 主进程按 app.isPackaged 设置）优先；
 * - 否则沿用历史语义：Bun 编译期注入 TASKMON_VERSION 即视为正式产物，直跑为 dev。
 */
export function channel(): Channel {
  const explicit = process.env.TASKMON_CHANNEL;
  if (explicit === 'dev' || explicit === 'prod') return explicit;
  // Electron 宿主：`electron .` 为 dev，打包产物为 prod
  if (process.versions.electron !== undefined) {
    const defaultApp = (process as unknown as { defaultApp?: boolean }).defaultApp;
    return defaultApp ? 'dev' : 'prod';
  }
  return process.env.TASKMON_VERSION !== undefined ? 'prod' : 'dev';
}

export function version(): string {
  return process.env.TASKMON_VERSION ?? 'dev';
}

export function isPackaged(): boolean {
  return channel() === 'prod';
}

/** 数据根：%APPDATA%\language_projects\taskmon\<dev|prod>，取不到 APPDATA 回退 ~/.language_projects */
export function dataDir(): string {
  const base = process.env.APPDATA
    ? join(process.env.APPDATA, 'language_projects')
    : join(os.homedir(), '.language_projects');
  const dir = join(base, 'taskmon', channel());
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function logDir(): string {
  const dir = join(dataDir(), 'logs');
  mkdirSync(dir, { recursive: true });
  return dir;
}
