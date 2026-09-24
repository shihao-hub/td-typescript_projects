import { describe, expect, it } from 'vitest';
import { collectExpandableIds, flattenTree, getValueAtPointer, getWrappedValueAtPointer } from '../flatten.js';

describe('flattenTree 全展开（缺省）', () => {
  it('行结构与 render 纯打印一致：前缀/深度/末项', () => {
    const rows = flattenTree({ data: { usage: 'u', tail: { deep: 1 } }, ok: true });
    expect(rows.map((r) => r.label)).toEqual(['data:', 'usage:', 'tail:', 'deep:', 'ok:']);
    expect(rows.map((r) => r.depth)).toEqual([1, 2, 2, 3, 1]);
    expect(rows.map((r) => r.isLast)).toEqual([false, false, true, true, true]);
  });

  it('数组：键附 (N) 计数，元素 [i] 标签 dim', () => {
    const rows = flattenTree({ commands: [{ cmd: 'a' }, { cmd: 'b' }] });
    expect(rows.map((r) => r.label)).toEqual(['commands (2):', '[0]:', 'cmd:', '[1]:', 'cmd:']);
    expect(rows.map((r) => r.labelDim)).toEqual([false, true, false, true, false]);
  });

  it('空对象/空数组不 expandable，带占位', () => {
    const rows = flattenTree({ a: {}, b: [] });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: '/a', expandable: false, placeholder: '{}' });
    expect(rows[1]).toMatchObject({ id: '/b', expandable: false, placeholder: '[]' });
  });

  it('根原始值：单行 depth=0、无标签', () => {
    const rows = flattenTree('hello');
    expect(rows).toEqual([
      { id: '', depth: 0, isLast: true, label: '', labelDim: false, expandable: false, expanded: false, leafValue: 'hello' },
    ]);
  });

  it('顶层为对象时根对象自身不产生行', () => {
    expect(flattenTree({})).toEqual([]);
  });
});

describe('flattenTree id（RFC 6901）', () => {
  it('常规路径：/data/commands/0/cmd', () => {
    const rows = flattenTree({ data: { commands: [{ cmd: 'add' }] } });
    expect(rows.map((r) => r.id)).toEqual(['/data', '/data/commands', '/data/commands/0', '/data/commands/0/cmd']);
  });

  it('键名含 / 与 ~ 转义为 ~1 与 ~0，含 . 不需转义', () => {
    const rows = flattenTree({ 'a/b': 1, '~x': 2, 'c.d': 3 });
    expect(rows.map((r) => r.id)).toEqual(['/a~1b', '/~0x', '/c.d']);
  });
});

describe('flattenTree 折叠', () => {
  const value = { data: { a: 1, b: { c: 2 } }, list: [1, 2], ok: true };

  it('不在集合内的容器收起，占位 {…}/[…]，expanded=false', () => {
    const rows = flattenTree(value, { expanded: new Set(['/list']) });
    expect(rows.map((r) => [r.id, r.placeholder])).toEqual([
      ['/data', '{…}'],
      ['/list', undefined],
      ['/list/0', undefined],
      ['/list/1', undefined],
      ['/ok', undefined],
    ]);
    expect(rows[0]).toMatchObject({ expandable: true, expanded: false });
    expect(rows[1]).toMatchObject({ expandable: true, expanded: true });
  });

  it('收起节点的后代不出行', () => {
    const rows = flattenTree(value, { expanded: new Set<string>() });
    expect(rows.map((r) => r.id)).toEqual(['/data', '/list', '/ok']);
  });

  it('容器元素行同样可折叠', () => {
    const rows = flattenTree({ list: [{ a: 1 }] }, { expanded: new Set<string>() });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: '/list', placeholder: '[…]' });
  });
});

describe('collectExpandableIds', () => {
  it('收集全部非空容器 id（含嵌套），空容器与叶子不含', () => {
    const value = { data: { a: 1, empty: {} }, list: [[1], []], leaf: 'x' };
    expect(collectExpandableIds(value)).toEqual(new Set(['/data', '/list', '/list/0']));
  });

  it('根原始值/空输入返回空集合', () => {
    expect(collectExpandableIds('x')).toEqual(new Set());
    expect(collectExpandableIds({})).toEqual(new Set());
    expect(collectExpandableIds([])).toEqual(new Set());
  });
});

describe('getValueAtPointer', () => {
  const value = {
    data: [{ id: 1, tags: ['a'] }, { id: 2 }],
    'a/b': 'slash',
    '~x': 'tilde',
  };

  it('空指针返回整个 root', () => {
    expect(getValueAtPointer(value, '')).toBe(value);
  });

  it('对象、数组元素与嵌套字段', () => {
    expect(getValueAtPointer(value, '/data')).toEqual(value.data);
    expect(getValueAtPointer(value, '/data/0')).toEqual(value.data[0]);
    expect(getValueAtPointer(value, '/data/0/id')).toBe(1);
  });

  it('解码 JSON Pointer 的 ~0 与 ~1', () => {
    expect(getValueAtPointer(value, '/a~1b')).toBe('slash');
    expect(getValueAtPointer(value, '/~0x')).toBe('tilde');
  });

  it('越界、非法数组下标与基础值后缀返回 undefined', () => {
    expect(getValueAtPointer(value, '/data/9')).toBeUndefined();
    expect(getValueAtPointer(value, '/data/x')).toBeUndefined();
    expect(getValueAtPointer(value, '/data/0/id/x')).toBeUndefined();
  });
});

describe('getWrappedValueAtPointer', () => {
  const value = { data: [{ id: 1, name: 'zedhub' }], 'a/b': true };

  it('根指针直接返回原值', () => {
    expect(getWrappedValueAtPointer(value, '')).toBe(value);
  });

  it('对象子树保留 key，叶子保留 key-value', () => {
    expect(getWrappedValueAtPointer(value, '/data')).toEqual({ data: value.data });
    expect(getWrappedValueAtPointer(value, '/data/0/name')).toEqual({ name: 'zedhub' });
  });

  it('数组元素包装为数组，copy view 渲染为 [0]:', () => {
    expect(getWrappedValueAtPointer(value, '/data/0')).toEqual([value.data[0]]);
  });

  it('解码末级 JSON Pointer key', () => {
    expect(getWrappedValueAtPointer(value, '/a~1b')).toEqual({ 'a/b': true });
  });
});
