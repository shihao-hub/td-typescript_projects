import { describe, expect, it } from 'vitest';
import { decodeWithCodePage, parseMemField, parseTasklistCsv, splitCsvLine } from '../tasklist.js';

describe('splitCsvLine', () => {
  it('处理引号内的逗号与双引号转义', () => {
    expect(splitCsvLine('"a,b","c""d","e"')).toEqual(['a,b', 'c"d', 'e']);
  });

  it('处理普通行', () => {
    expect(splitCsvLine('"chrome.exe","1234","Console","1","84,528 K"')).toEqual([
      'chrome.exe',
      '1234',
      'Console',
      '1',
      '84,528 K',
    ]);
  });
});

describe('parseMemField', () => {
  it('解析 "84,528 K" 为字节数', () => {
    expect(parseMemField('84,528 K')).toBe(84528 * 1024);
  });

  it('解析千分位大数', () => {
    expect(parseMemField('1,234,567 K')).toBe(1234567 * 1024);
  });

  it('N/A 与空值返回 0', () => {
    expect(parseMemField('N/A')).toBe(0);
    expect(parseMemField('')).toBe(0);
  });
});

describe('decodeWithCodePage', () => {
  it('CP936 按 GBK 解码中文进程名', () => {
    // "笔记管理系统" 的 GBK 字节（实测 tasklist 原始输出）
    const buf = Buffer.from([0xb1, 0xca, 0xbc, 0xc7, 0xb9, 0xdc, 0xc0, 0xed, 0xcf, 0xb5, 0xcd, 0xb3]);
    expect(decodeWithCodePage(buf, 936)).toBe('笔记管理系统');
  });

  it('CP936 解码 ASCII 保持不变', () => {
    expect(decodeWithCodePage(Buffer.from('chrome.exe'), 936)).toBe('chrome.exe');
  });

  it('CP65001 直通 UTF-8', () => {
    expect(decodeWithCodePage(Buffer.from('笔记', 'utf8'), 65001)).toBe('笔记');
  });

  it('未知代码页回退 UTF-8', () => {
    expect(decodeWithCodePage(Buffer.from('笔记', 'utf8'), 99999)).toBe('笔记');
  });

  it('代码页未检测到（undefined）回退 UTF-8', () => {
    expect(decodeWithCodePage(Buffer.from('笔记', 'utf8'), undefined)).toBe('笔记');
  });
});

describe('parseTasklistCsv', () => {
  const sample = [
    '"chrome.exe","1234","Console","1","84,528 K"',
    '"chrome.exe","5678","Console","1","512,340 K"',
    '"svchost.exe","900","Services","0","1,234,567 K"',
    '"System Idle Process","0","Services","0","8 K"',
    '"Memory Compression","4321","Console","3","1,024 K"',
    '"weird, name.exe","77","Console","1","N/A"',
    '',
    '',
  ].join('\r\n');

  it('解析全部有效行并跳过空行', () => {
    const procs = parseTasklistCsv(sample);
    expect(procs).toHaveLength(6);
  });

  it('字段正确映射（名称/PID/内存）', () => {
    const procs = parseTasklistCsv(sample);
    const chrome1 = procs.find((p) => p.pid === 1234);
    expect(chrome1).toEqual({ name: 'chrome.exe', pid: 1234, memBytes: 84528 * 1024 });
    const na = procs.find((p) => p.pid === 77);
    expect(na?.memBytes).toBe(0);
  });
});
