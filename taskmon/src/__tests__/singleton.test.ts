import { describe, expect, it } from 'vitest';
import { matchesLock, parseLockText, VALID_OWNER_NAMES } from '../singleton.js';

type LockInfoLike = { pid: number; mode: 'exe' | 'dev'; version: string; startedAt: number; hostname: string };

const base: LockInfoLike = {
  pid: 4242,
  mode: 'dev',
  version: 'dev',
  startedAt: 1_700_000_000_000,
  hostname: 'PC-001',
};

describe('parseLockText', () => {
  it('解析合法锁 JSON', () => {
    expect(parseLockText(JSON.stringify(base))).toEqual(base);
  });

  it('损坏 JSON 返回 undefined', () => {
    expect(parseLockText('not json')).toBeUndefined();
    expect(parseLockText('')).toBeUndefined();
  });

  it('非对象 / 缺字段返回 undefined', () => {
    expect(parseLockText('123')).toBeUndefined();
    expect(parseLockText('null')).toBeUndefined();
    expect(parseLockText('{}')).toBeUndefined();
    expect(parseLockText(JSON.stringify({ ...base, hostname: undefined }))).toBeUndefined();
  });

  it('pid 非法（字符串/非整数/非正数）返回 undefined', () => {
    expect(parseLockText(JSON.stringify({ ...base, pid: '4242' }))).toBeUndefined();
    expect(parseLockText(JSON.stringify({ ...base, pid: 1.5 }))).toBeUndefined();
    expect(parseLockText(JSON.stringify({ ...base, pid: 0 }))).toBeUndefined();
    expect(parseLockText(JSON.stringify({ ...base, pid: -1 }))).toBeUndefined();
  });

  it('mode 非法返回 undefined', () => {
    expect(parseLockText(JSON.stringify({ ...base, mode: 'foo' }))).toBeUndefined();
  });

  it('version 空串 / startedAt 非数值返回 undefined', () => {
    expect(parseLockText(JSON.stringify({ ...base, version: '' }))).toBeUndefined();
    expect(parseLockText(JSON.stringify({ ...base, startedAt: 'x' }))).toBeUndefined();
  });
});

describe('matchesLock', () => {
  it('名字在白名单且启动时刻在容差内 → 匹配', () => {
    expect(matchesLock(base, { name: 'node.exe', startMs: base.startedAt + 200 })).toBe(true);
    expect(matchesLock(base, { name: 'taskmon.exe', startMs: base.startedAt - 4_999 })).toBe(true);
    expect(matchesLock(base, { name: 'bun.exe', startMs: base.startedAt + 5_000 })).toBe(true);
  });

  it('启动时刻超容差 → 不匹配（PID 复用防护主判据）', () => {
    expect(matchesLock(base, { name: 'node.exe', startMs: base.startedAt + 5_001 })).toBe(false);
    expect(matchesLock(base, { name: 'node.exe', startMs: base.startedAt - 5_001 })).toBe(false);
  });

  it('名字不在白名单 → 不匹配（大小写不敏感）', () => {
    expect(matchesLock(base, { name: 'chrome.exe', startMs: base.startedAt })).toBe(false);
    expect(matchesLock(base, { name: 'NODE.EXE', startMs: base.startedAt })).toBe(true);
  });

  it('startMs=NaN（tasklist 降级）时仅校验名字', () => {
    expect(matchesLock(base, { name: 'node.exe', startMs: Number.NaN })).toBe(true);
    expect(matchesLock(base, { name: 'chrome.exe', startMs: Number.NaN })).toBe(false);
  });
});

describe('VALID_OWNER_NAMES', () => {
  it('覆盖 exe 与 dev 两种运行形态', () => {
    expect(VALID_OWNER_NAMES.has('taskmon.exe')).toBe(true);
    expect(VALID_OWNER_NAMES.has('node.exe')).toBe(true);
    expect(VALID_OWNER_NAMES.has('bun.exe')).toBe(true);
    expect(VALID_OWNER_NAMES.has('powershell.exe')).toBe(false);
  });
});
