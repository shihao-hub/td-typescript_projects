import { describe, expect, it } from 'vitest';
import { readSysMem } from '../sysmem.js';

describe('readSysMem', () => {
  it('读数合理（total>0，0<=used<=total，占比 0~1）', () => {
    const m = readSysMem();
    expect(m.total).toBeGreaterThan(0);
    expect(m.free).toBeGreaterThanOrEqual(0);
    expect(m.used).toBeLessThanOrEqual(m.total);
    expect(m.usedPct).toBeGreaterThanOrEqual(0);
    expect(m.usedPct).toBeLessThanOrEqual(1);
  });
});
