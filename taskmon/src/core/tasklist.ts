import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessInfo } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Windows 代码页 → WHATWG TextDecoder 编码标签。
 * 未列出的（如 437/850 等 DOS 代码页）TextDecoder 不支持，走 utf-8 回退。
 */
const CP_TO_ENCODING: Record<number, string> = {
  65001: 'utf-8',
  54936: 'gb18030',
  936: 'gbk',
  950: 'big5',
  932: 'shift_jis',
  949: 'euc-kr',
  866: 'ibm866',
  874: 'windows-874',
  1250: 'windows-1250',
  1251: 'windows-1251',
  1252: 'windows-1252',
  1253: 'windows-1253',
  1254: 'windows-1254',
  1255: 'windows-1255',
  1256: 'windows-1256',
  1257: 'windows-1257',
  1258: 'windows-1258',
};

/** 按指定代码页解码；代码页未知或标签不受支持时回退 utf-8 */
export function decodeWithCodePage(buf: Buffer, codePage: number | undefined): string {
  const label = codePage === undefined ? undefined : CP_TO_ENCODING[codePage];
  if (label === undefined || label === 'utf-8') return buf.toString('utf8');
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

/** 检测活动代码页（chcp 输出的数字为 ASCII，latin1 读取足够），失败返回 undefined */
export function detectCodePage(): number | undefined {
  try {
    const out = execFileSync('chcp.com', {
      encoding: 'latin1',
      timeout: 5_000,
      windowsHide: true,
    });
    const m = /(\d{3,5})/.exec(out);
    return m ? Number(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

let cachedCodePage: number | undefined;
let codePageDetected = false;

/** 活动代码页（模块级缓存，进程生命周期内只检测一次） */
function activeCodePage(): number | undefined {
  if (!codePageDetected) {
    codePageDetected = true;
    cachedCodePage = detectCodePage();
  }
  return cachedCodePage;
}

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
    encoding: 'buffer',
  });
  // tasklist 管道输出为 OEM 代码页（中文系统 CP936/GBK），按 UTF-8 直解中文进程名会乱码
  return parseTasklistCsv(decodeWithCodePage(stdout, activeCodePage()));
}
