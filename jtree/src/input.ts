import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** 读取 stdin 全部内容（按 UTF-8 解码） */
export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(c as Buffer));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

/** 同步读取文件（UTF-8）；文件不存在/不可读由调用方捕获报错 */
export function readFileUtf8(path: string): string {
  return readFileSync(path, 'utf8');
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * 直接 spawn 子进程并捕获输出（UTF-8）。
 * 用于 exec 模式：绕开 PowerShell 5.1 管道对 exe 间输出的编码转换，避免中文乱码。
 */
export function runCapture(cmd: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (c) => out.push(c as Buffer));
    child.stderr.on('data', (c) => err.push(c as Buffer));
    child.on('error', (e) => reject(e));
    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        code,
      });
    });
  });
}
