import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessInfo } from './types.js';

const execFileAsync = promisify(execFile);

/** 解析 tasklist CSV 单行（处理引号内逗号、双引号转义） */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** 解析 tasklist 内存列，如 "84,528 K" → 字节数；"N/A" → 0 */
export function parseMemField(field: string): number {
  const m = /([\d.,]+)\s*K/i.exec(field.trim());
  if (!m) return 0;
  const digits = m[1]!.replace(/[^\d]/g, '');
  if (!digits) return 0;
  const kb = Number.parseInt(digits, 10);
  return Number.isFinite(kb) ? kb * 1024 : 0;
}

/** 解析 `tasklist /fo csv /nh` 的完整输出为进程列表 */
export function parseTasklistCsv(text: string): ProcessInfo[] {
  const out: ProcessInfo[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = splitCsvLine(line);
    if (fields.length < 5) continue; // sh-note: 小于五下次循环
    const name = (fields[0] ?? '').trim();
    const pid = Number.parseInt((fields[1] ?? '').trim(), 10);
    if (!name || !Number.isFinite(pid)) continue;
    out.push({ name, pid, memBytes: parseMemField(fields[4] ?? '') });
  }
  return out;
}

/** 采集当前系统进程列表（依赖 Windows 内置命令 tasklist） */
export async function listProcesses(): Promise<ProcessInfo[]> {
  const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv', '/nh'], {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 15_000,
  });
  // sh-note: 此处的 stdout 需要自己执行命令看一下结构才行，而且我很好奇版本问题
  return parseTasklistCsv(stdout);
}
