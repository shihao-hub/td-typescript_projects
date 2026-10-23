import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createStream } from 'rotating-file-stream';
import pino from 'pino';
import type { Logger } from 'pino';
import { isPackaged, logDir } from './paths.js';

async function createLogger(): Promise<Logger> {
  const dir = logDir();
  mkdirSync(dir, { recursive: true });
  const stream = createStream('taskmon.log', {
    path: dir,
    size: '2M',
    interval: '1d',
    maxFiles: 5,
  });
  if (isPackaged()) {
    return pino({ level: 'info' }, stream);
  }
  const { default: pretty } = await import('pino-pretty');
  return pino(
    { level: 'debug' },
    pretty({ destination: stream, colorize: false, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l' }),
  );
}

export const logger: Logger = await createLogger();
