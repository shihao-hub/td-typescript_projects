import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sampler } from '../core/sampler.js';
import { killPids, PROTECTED_NAMES } from '../core/kill.js';
import type { KillResult } from '../core/kill.js';
import { channel, version } from '../shared/paths.js';
import { logger } from '../shared/logger.js';
import { APP_CSS, APP_JS, INDEX_HTML } from '../web/assets.js';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_KILL_PIDS = 1_000;

export interface ServerHandle {
  url: string;
  port: number;
  close(): Promise<void>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

function text(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export interface KillRequest {
  pids: number[];
  label?: string;
}

export type KillResponse =
  | { ok: true; results: KillResult[]; summary: { killed: number; gone: number; failed: number } }
  | { ok: false; error: string };

export async function handleKill(req: IncomingMessage): Promise<KillResponse> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return { ok: false, error: '请求体不是合法 JSON' };
  }
  if (!body || typeof body !== 'object') return { ok: false, error: '请求体格式错误' };
  const raw = (body as { pids?: unknown }).pids;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'pids 不能为空' };
  if (raw.length > MAX_KILL_PIDS) return { ok: false, error: `一次最多结束 ${MAX_KILL_PIDS} 个进程` };
  const pids: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) return { ok: false, error: 'pids 必须为正整数' };
    pids.push(v);
  }

  const procs = sampler.snapshot().procs;
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const protectedHit = pids.find((pid) => {
    const name = byPid.get(pid)?.name;
    return name !== undefined && PROTECTED_NAMES.has(name.toLowerCase());
  });
  if (protectedHit !== undefined) {
    return { ok: false, error: `${byPid.get(protectedHit)?.name ?? '目标'} 为系统保护进程，禁止结束` };
  }
  if (pids.includes(process.pid)) return { ok: false, error: '不能结束 taskmon 服务自身' };

  const label = typeof (body as { label?: unknown }).label === 'string' ? (body as { label: string }).label : pids.join(',');
  logger.info({ target: label, pids }, 'WebUI 请求结束进程');
  const results = await killPids(pids);
  const summary = {
    killed: results.filter((r) => r.outcome === 'killed').length,
    gone: results.filter((r) => r.outcome === 'gone').length,
    failed: results.filter((r) => r.outcome === 'failed').length,
  };
  logger.info({ target: label, pids, summary, results }, 'WebUI 结束进程完成');
  return { ok: true, results, summary };
}

/** 只允许本机来源：拒绝任意网页对 localhost 服务的 CSRF 式写请求（curl 无 Origin 仍放行） */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]');
  } catch {
    return false;
  }
}

function handler(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const path = url.pathname;

  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    text(res, 200, INDEX_HTML, 'text/html; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && path === '/app.css') {
    text(res, 200, APP_CSS, 'text/css; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && path === '/app.js') {
    text(res, 200, APP_JS, 'text/javascript; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && path === '/api/health') {
    json(res, 200, { ok: true, app: 'taskmon', version: version(), channel: channel() });
    return;
  }
  if (req.method === 'GET' && path === '/api/snapshot') {
    json(res, 200, sampler.snapshot());
    return;
  }
  if (req.method === 'POST' && path === '/api/kill') {
    if (!originAllowed(req)) {
      json(res, 403, { ok: false, error: '来源不受信任' });
      return;
    }
    void handleKill(req)
      .then((r) => json(res, r.ok ? 200 : 400, r))
      .catch((e: unknown) => json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) }));
    return;
  }
  json(res, 404, { ok: false, error: 'not found' });
}

/** 启动 HTTP 服务（GUI 与 CLI serve 共用）：先完成首帧采集再监听，保证首个快照非空。 */
export async function startServer(port = 0, host = '127.0.0.1'): Promise<ServerHandle> {
  await sampler.start();
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  const url = `http://${host}:${addr.port}`;
  logger.info({ url, version: version(), channel: channel() }, 'HTTP 服务已启动');
  return {
    url,
    port: addr.port,
    close: async () => {
      sampler.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
