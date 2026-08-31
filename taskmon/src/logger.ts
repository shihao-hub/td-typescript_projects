import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { createStream } from 'rotating-file-stream';
import pino from 'pino';
import type { Logger } from 'pino';

// exe 打包时 bun --define 编译期注入 TASKMON_VERSION；tsx/node 直跑时为 undefined
// 注意：必须用全局 process，import process 会导致 define 的文本替换失配（详见 README「日志」）
const isPackaged = process.env.TASKMON_VERSION !== undefined;

function logDir(): string {
  const dir = join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'taskmon', 'logs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function createLogger(): Promise<Logger> {
  const stream = createStream('taskmon.log', {
    path: logDir(),
    size: '2M',
    interval: '1d',
    maxFiles: 5,
  });
  if (isPackaged) {
    return pino({ level: 'info' }, stream);
  }
  const { default: pretty } = await import('pino-pretty');
  return pino(
    { level: 'debug' },
    pretty({ destination: stream, colorize: false, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l' }),
  );
}

export const logger: Logger = await createLogger();
