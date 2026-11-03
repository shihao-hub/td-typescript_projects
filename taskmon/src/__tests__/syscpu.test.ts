import { describe, expect, it } from 'vitest';
import { readSysCpu, resetSysCpu } from '../core/syscpu.js';

describe('syscpu', () => {
  it('首拍返回 0，次拍返回有效占用率（0~1）且核心数 > 0', () => {
    resetSysCpu();
    const first = readSysCpu();
    expect(first.usedPct).toBe(0);
    expect(first.cores).toBeGreaterThan(0);

    const second = readSysCpu();
    expect(second.usedPct).toBeGreaterThanOrEqual(0);
    expect(second.usedPct).toBeLessThanOrEqual(1);
    expect(second.cores).toBe(first.cores);
  });
});
