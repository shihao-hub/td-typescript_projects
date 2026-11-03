import { describe, expect, it } from 'vitest';
import { computeCpuPercentages, indexByPid, parseCimJson, parseCreated } from '../core/cim.js';
import type { CimProc } from '../core/cim.js';

describe('parseCreated', () => {
  it('epoch 毫秒数字直接通过', () => {
    expect(parseCreated(1712345678901)).toBe(1712345678901);
  });

  it('兼容 WinPS ConvertTo-Json 的 /Date()/ 形态', () => {
    expect(parseCreated('/Date(1712345678901)/')).toBe(1712345678901);
  });

  it('null / undefined / 非法值返回 null', () => {
    expect(parseCreated(null)).toBeNull();
    expect(parseCreated(undefined)).toBeNull();
    expect(parseCreated('abc')).toBeNull();
  });
});

describe('parseCimJson', () => {
  it('解析数组：字段正确映射，cmd null 保留', () => {
    const json =
      '[{"pid":1234,"ppid":10916,"name":"gopls.exe","created":1712345678901,"cmd":"gopls -mode=stdio"},' +
      '{"pid":4,"ppid":0,"name":"System","created":null,"cmd":null}]';
    const procs = parseCimJson(json);
    expect(procs).toHaveLength(2);
    expect(procs[0]).toEqual({
      pid: 1234,
      ppid: 10916,
      name: 'gopls.exe',
      created: 1712345678901,
      cmd: 'gopls -mode=stdio',
    });
    expect(procs[1]).toEqual({ pid: 4, ppid: 0, name: 'System', created: null, cmd: null });
  });

  it('解析含 cpu 字段的记录', () => {
    const json = '[{"pid":123,"ppid":1,"name":"test.exe","created":null,"cmd":null,"cpu":5000000}]';
    const procs = parseCimJson(json);
    expect(procs).toHaveLength(1);
    expect(procs[0]!.cpuTime).toBe(5000000);
  });

  it('单对象（非数组）也能解析', () => {
    const procs = parseCimJson('{"pid":1,"ppid":0,"name":"a.exe","created":null,"cmd":null}');
    expect(procs).toHaveLength(1);
    expect(procs[0]!.name).toBe('a.exe');
  });

  it('/Date()/ 形态的 created 被转换为毫秒', () => {
    const procs = parseCimJson('{"pid":1,"ppid":0,"name":"a.exe","created":"/Date(1712345678901)/","cmd":null}');
    expect(procs[0]!.created).toBe(1712345678901);
  });

  it('坏行（缺 pid/ppid/名称）静默跳过', () => {
    const json =
      '[{"ppid":5,"name":"x.exe"},' +
      '{"pid":"abc","ppid":5,"name":"x.exe"},' +
      '{"pid":7,"ppid":5,"name":""},' +
      '{"pid":8,"ppid":5,"name":"ok.exe","created":null,"cmd":null},' +
      '"garbage"]';
    const procs = parseCimJson(json);
    expect(procs).toHaveLength(1);
    expect(procs[0]!.pid).toBe(8);
  });

  it('空串 / 非法 JSON 返回空数组（降级不抛异常）', () => {
    expect(parseCimJson('')).toEqual([]);
    expect(parseCimJson('   ')).toEqual([]);
    expect(parseCimJson('not-json{{{')).toEqual([]);
  });
});

describe('computeCpuPercentages', () => {
  it('正确根据两次快照计算 CPU 占用率，PID 0 置 0', () => {
    const prev = new Map<number, CimProc>([
      [0, { pid: 0, ppid: 0, name: 'System Idle Process', created: null, cmd: null, cpuTime: 100000000 }],
      [100, { pid: 100, ppid: 1, name: 'app.exe', created: null, cmd: null, cpuTime: 10000000 }],
    ]);
    const curr = new Map<number, CimProc>([
      [0, { pid: 0, ppid: 0, name: 'System Idle Process', created: null, cmd: null, cpuTime: 130000000 }],
      // 在 2 秒间隔（2000ms）、4 核系统下：总 slice = 2000 * 10,000 * 4 = 80,000,000 100ns 单位
      // 增量 20,000,000 相当于 25% 占用
      [100, { pid: 100, ppid: 1, name: 'app.exe', created: null, cmd: null, cpuTime: 30000000 }],
    ]);

    computeCpuPercentages(curr, 2000, prev, 0, 4);

    expect(curr.get(0)!.cpuPct).toBe(0); // 空闲进程置 0
    expect(curr.get(100)!.cpuPct).toBeCloseTo(0.25, 3);
  });

  it('无上一拍时置 0', () => {
    const curr = new Map<number, CimProc>([
      [100, { pid: 100, ppid: 1, name: 'app.exe', created: null, cmd: null, cpuTime: 30000000 }],
    ]);
    computeCpuPercentages(curr, 1000, undefined, undefined, 4);
    expect(curr.get(100)!.cpuPct).toBe(0);
  });
});

describe('indexByPid', () => {
  it('按 pid 建索引，重复 pid 保留首个', () => {
    const m = indexByPid([
      { pid: 10, ppid: 1, name: 'a.exe', created: null, cmd: null },
      { pid: 10, ppid: 2, name: 'b.exe', created: null, cmd: null },
      { pid: 20, ppid: 1, name: 'c.exe', created: null, cmd: null },
    ]);
    expect(m.size).toBe(2);
    expect(m.get(10)!.name).toBe('a.exe');
    expect(m.get(20)!.name).toBe('c.exe');
  });
});
