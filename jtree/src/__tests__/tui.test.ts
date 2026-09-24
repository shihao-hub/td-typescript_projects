import { describe, expect, it } from 'vitest';
import { ANSI_RE, displayWidth } from '../format.js';
import { collectExpandableIds, flattenTree } from '../flatten.js';
import { formatRow } from '../render.js';
import { applyKey, buildFrame, buildStatusLine, isCopyRequested, shouldQuitFromCopy, shouldReturnFromCopy, type TuiState } from '../tui.js';

const strip = (s: string): string => s.replace(ANSI_RE, '');

/** 生成 N 行的扁平树：{ k0: 0, k1: 1, ... } */
const genRows = (n: number) => flattenTree(Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i])));

const state = (over: Partial<TuiState> = {}): TuiState => ({
  expanded: new Set<string>(),
  cursor: 0,
  offset: 0,
  quit: false,
  ...over,
});

describe('buildFrame 视口', () => {
  const rows = genRows(100);

  it('body = height-1（底部 1 行状态行），行数恰为 height', () => {
    const f = buildFrame(rows, { width: 80, height: 10, cursor: 0, offset: 0 });
    expect(f.lines).toHaveLength(10);
  });

  it('光标向下越过视口末行时视口跟随（cursor=50, body=9 → offset=42）', () => {
    const f = buildFrame(rows, { width: 80, height: 10, cursor: 50, offset: 0 });
    expect(f.offset).toBe(42);
  });

  it('光标上移越过视口首行时回拉', () => {
    const f = buildFrame(rows, { width: 80, height: 10, cursor: 5, offset: 40 });
    expect(f.offset).toBe(5);
  });

  it('cursor 越界 clamp 到末行', () => {
    const f = buildFrame(rows, { width: 80, height: 10, cursor: 999, offset: 0 });
    expect(strip(f.lines[8]!)).toContain('k99');
  });

  it('每行显示宽度不超限', () => {
    const long = flattenTree({ desc: 'x'.repeat(200) });
    for (const w of [40, 80]) {
      const f = buildFrame(long, { width: w, height: 5, cursor: 0, offset: 0 });
      for (const line of f.lines) expect(displayWidth(line)).toBeLessThanOrEqual(w);
    }
  });

  it('仅 cursor 行带 ❯ 前缀，其余行首 2 列 gutter', () => {
    const f = buildFrame(rows, { width: 80, height: 10, cursor: 3, offset: 0 });
    f.lines.slice(0, 9).forEach((l, i) => {
      const s = strip(l);
      if (i === 3) expect(s.startsWith('❯ ')).toBe(true);
      else expect(s.startsWith('  ')).toBe(true);
    });
  });

  it('选中行内容与 formatRow(colored:false) 一致（反色条 padEnd 补齐）', () => {
    const f = buildFrame(rows, { width: 80, height: 10, cursor: 2, offset: 0 });
    const plain = formatRow(rows[2]!, { width: 78, colored: false, indicators: true });
    expect(strip(f.lines[2]!).trimEnd()).toBe(`❯ ${clipPlain(plain, 78)}`);
  });

  it('空 rows 空态：全部空行 + 状态行显示 空', () => {
    const f = buildFrame([], { width: 80, height: 4, cursor: 0, offset: 0 });
    expect(f.lines.slice(0, 3)).toEqual(['', '', '']);
    expect(strip(f.lines[3]!)).toContain('空');
  });
});

/** 与 buildFrame 内部同口径的截断（测试对拍用） */
function clipPlain(s: string, w: number): string {
  if (displayWidth(s) <= w) return s;
  let width = 0;
  let out = '';
  for (const ch of s) {
    const cw = displayWidth(ch);
    if (width + cw > w - 1) break;
    out += ch;
    width += cw;
  }
  return out + '…';
}

describe('buildStatusLine', () => {
  it('显示位置与上下滚动指示', () => {
    const s = strip(buildStatusLine(80, { total: 120, offset: 40, visible: 9 }));
    expect(s).toContain('↑40');
    expect(s).toContain('41/120 行');
    expect(s).toContain('↓71');
  });

  it('顶部无 ↑N 指示，底部无 ↓N 指示', () => {
    const top = strip(buildStatusLine(80, { total: 100, offset: 0, visible: 9 }));
    expect(top).not.toMatch(/↑\d/);
    expect(top).toContain('1/100 行');
    const bottom = strip(buildStatusLine(80, { total: 10, offset: 1, visible: 9 }));
    expect(bottom).not.toMatch(/↓\d/);
    expect(bottom).toContain('2/10 行');
  });

  it('超宽截断不溢出', () => {
    expect(displayWidth(buildStatusLine(20, { total: 120, offset: 40, visible: 9 }))).toBeLessThanOrEqual(20);
  });
});

describe('applyKey', () => {
  // 结构：/data 展开（a、b 两键），/list 数组 2 元素
  const value = { data: { a: 1, b: { c: 2 } }, list: [1, 2] };
  const all = collectExpandableIds(value); // /data、/data/b、/list
  const rows = flattenTree(value, { expanded: all });
  const ctx = { rows, allExpandable: all, bodyRows: 9 };
  // rows：0=/data 1=/data/a 2=/data/b 3=/data/b/c 4=/list 5=/list/0 6=/list/1

  it('↑↓ 边界 clamp', () => {
    const st = applyKey(state({ cursor: 0 }), { name: 'up' }, ctx);
    expect(st.cursor).toBe(0);
    const st2 = applyKey(state({ cursor: 6 }), { name: 'down' }, ctx);
    expect(st2.cursor).toBe(6);
    const st3 = applyKey(state({ cursor: 2 }), { name: 'down' }, ctx);
    expect(st3.cursor).toBe(3);
  });

  it('vim 键 j/k 与 PgUp/PgDn/Home/End/g/G', () => {
    expect(applyKey(state({ cursor: 2 }), { sequence: 'j' }, ctx).cursor).toBe(3);
    expect(applyKey(state({ cursor: 2 }), { sequence: 'k' }, ctx).cursor).toBe(1);
    expect(applyKey(state({ cursor: 5 }), { name: 'pageup' }, ctx).cursor).toBe(0);
    expect(applyKey(state({ cursor: 0 }), { name: 'pagedown' }, ctx).cursor).toBe(6);
    expect(applyKey(state({ cursor: 5 }), { name: 'home' }, ctx).cursor).toBe(0);
    expect(applyKey(state({ cursor: 1 }), { name: 'end' }, ctx).cursor).toBe(6);
    expect(applyKey(state({ cursor: 1 }), { sequence: 'g' }, ctx).cursor).toBe(0);
    expect(applyKey(state({ cursor: 1 }), { sequence: 'G' }, ctx).cursor).toBe(6);
  });

  it('← 收起当前容器：expanded 移除且状态变化', () => {
    const st = applyKey(state({ cursor: 0, expanded: new Set(all) }), { name: 'left' }, ctx);
    expect(st.expanded.has('/data')).toBe(false);
    expect(st.expanded.has('/data/b')).toBe(true); // 其他节点不受影响
  });

  it('→ 展开已展开节点为 no-op；← 对叶子为 no-op', () => {
    const input = state({ cursor: 0, expanded: new Set(all) });
    expect(applyKey(input, { name: 'right' }, ctx)).toBe(input); // 引用不变
    const leaf = applyKey(state({ cursor: 1, expanded: new Set(all) }), { name: 'left' }, ctx);
    expect(leaf.expanded.has('/data')).toBe(true);
  });

  it('Enter 切换折叠', () => {
    const st = applyKey(state({ cursor: 4, expanded: new Set(all) }), { name: 'enter' }, ctx);
    expect(st.expanded.has('/list')).toBe(false);
    // 收起状态：rows 与 expanded 集合一致（/data 行 0、/list 行 1）
    const rowsCollapsed = flattenTree(value, { expanded: new Set<string>() });
    const ctxCollapsed = { rows: rowsCollapsed, allExpandable: all, bodyRows: 9 };
    const st2 = applyKey(state({ cursor: 1, expanded: new Set<string>() }), { name: 'enter' }, ctxCollapsed);
    expect(st2.expanded.has('/list')).toBe(true);
  });

  it('a 全收起 ↔ 全展开', () => {
    const st = applyKey(state({ cursor: 0, expanded: new Set(all) }), { sequence: 'a' }, ctx);
    expect(st.expanded.size).toBe(0);
    const st2 = applyKey(state({ cursor: 0, expanded: new Set<string>() }), { sequence: 'a' }, ctx);
    expect(st2.expanded).toEqual(new Set(all));
  });

  it('c 进入 copy view；修饰键不触发', () => {
    expect(isCopyRequested({ name: 'c', sequence: 'c' })).toBe(true);
    expect(isCopyRequested({ name: 'c', ctrl: true })).toBe(false);
    const before = state({ cursor: 2 });
    expect(applyKey(before, { name: 'c' }, ctx)).toEqual(before);
  });

  it('copy view 的 Enter 返回；q 直接退出', () => {
    expect(shouldReturnFromCopy({ name: 'enter' })).toBe(true);
    expect(shouldReturnFromCopy({ name: 'q', sequence: 'q' })).toBe(false);
    expect(shouldQuitFromCopy({ name: 'q', sequence: 'q' })).toBe(true);
    expect(shouldQuitFromCopy({ name: 'q', sequence: '\x11', ctrl: true })).toBe(false);
  });

  it('q 与 Ctrl+C 置 quit；quit 后忽略按键', () => {
    expect(applyKey(state(), { sequence: 'q' }, ctx).quit).toBe(true);
    expect(applyKey(state(), { name: 'c', ctrl: true }, ctx).quit).toBe(true);
    const quitSt = state({ quit: true, cursor: 0 });
    expect(applyKey(quitSt, { name: 'down' }, ctx)).toBe(quitSt);
  });

  it('ctrl+j 不作为移动；未知键 no-op', () => {
    expect(applyKey(state({ cursor: 2 }), { sequence: '\n', ctrl: true }, ctx).cursor).toBe(2);
    expect(applyKey(state({ cursor: 2 }), { sequence: 'z' }, ctx)).toEqual(state({ cursor: 2 }));
  });
});
