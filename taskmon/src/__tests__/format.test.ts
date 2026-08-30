import { describe, expect, it } from 'vitest';
import { bar, displayWidth, formatBytes, padEnd, padStart, truncate } from '../format.js';

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

describe('displayWidth', () => {
  it('ASCII 按 1 计', () => {
    expect(displayWidth('chrome.exe')).toBe(10);
  });

  it('CJK 按宽 2 计', () => {
    expect(displayWidth('内存')).toBe(4);
    expect(displayWidth('a中b')).toBe(4);
  });

  it('跳过 ANSI 颜色码', () => {
    expect(displayWidth('\x1b[1mabc\x1b[0m')).toBe(3);
  });
});

describe('pad / truncate', () => {
  it('padEnd 按显示宽度补空格', () => {
    expect(padEnd('中文', 6)).toBe('中文  ');
    expect(padEnd('abc', 5)).toBe('abc  ');
  });

  it('padStart 按显示宽度补空格', () => {
    expect(padStart('1234', 6)).toBe('  1234');
    expect(padStart('内存', 5)).toBe(' 内存');
  });

  it('truncate 超宽截断并以 .. 结尾', () => {
    expect(truncate('abcdefgh', 5)).toBe('abc..');
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('中文字符', 6)).toBe('中文..');
  });
});

describe('formatBytes', () => {
  it('自适应单位与小数位', () => {
    expect(formatBytes(0)).toBe('0');
    expect(formatBytes(8 * KB)).toBe('8.00 KB');
    expect(formatBytes(84528 * KB)).toBe('82.5 MB');
    expect(formatBytes(1.5 * GB)).toBe('1.50 GB');
    expect(formatBytes(512 * MB)).toBe('512 MB');
  });
});

describe('bar', () => {
  it('按比例生成实心/空白', () => {
    expect(bar(2, 4)).toBe('██░░');
    expect(bar(0, 3)).toBe('░░░');
    expect(bar(10, 3)).toBe('███');
  });
});
