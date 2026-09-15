import { describe, expect, it } from 'vitest';
import { displayWidth } from '../format.js';
import { flattenTree } from '../flatten.js';
import { formatRow, render } from '../render.js';

const WIDE = 500;

describe('render 顶层原始值', () => {
  it.each([
    ['字符串带引号', 'hello', '"hello"'],
    ['数字', 42, '42'],
    ['布尔', true, 'true'],
    ['null', null, 'null'],
  ])('%s', (_name, input, expected) => {
    expect(render(input, { width: WIDE })).toEqual([expected]);
  });
});

describe('render 对象', () => {
  it('键值同行显示', () => {
    expect(render({ ok: true, code: 1 }, { width: WIDE })).toEqual(['├─ ok: true', '└─ code: 1']);
  });

  it('空对象与空数组占位显示', () => {
    expect(render({ a: {}, b: [] }, { width: WIDE })).toEqual(['├─ a: {}', '└─ b: []']);
  });

  it('嵌套对象：每层 2 空格缩进，无竖线延续', () => {
    expect(render({ data: { usage: 'u', tail: { deep: 1 } }, ok: true }, { width: WIDE })).toEqual([
      '├─ data:',
      '  ├─ usage: "u"',
      '  └─ tail:',
      '    └─ deep: 1',
      '└─ ok: true',
    ]);
  });
});

describe('render 数组', () => {
  it('键名附 (N) 计数', () => {
    expect(render({ commands: [{ cmd: 'a' }, { cmd: 'b' }] }, { width: WIDE })).toEqual([
      '└─ commands (2):',
      '  ├─ [0]:',
      '    └─ cmd: "a"',
      '  └─ [1]:',
      '    └─ cmd: "b"',
    ]);
  });

  it('空数组不附计数，占位显示', () => {
    expect(render({ a: [] }, { width: WIDE })).toEqual(['└─ a: []']);
  });

  it('原始值元素同行显示', () => {
    expect(render(['a', 1, null], { width: WIDE })).toEqual(['├─ [0] "a"', '├─ [1] 1', '└─ [2] null']);
  });

  it('空对象/空数组元素占位显示', () => {
    expect(render([{}, []], { width: WIDE })).toEqual(['├─ [0] {}', '└─ [1] []']);
  });

  it('嵌套数组展开', () => {
    expect(render({ rows: [[1, 2]] }, { width: WIDE })).toEqual([
      '└─ rows (1):',
      '  └─ [0]:',
      '    ├─ [0] 1',
      '    └─ [1] 2',
    ]);
  });
});

describe('render 截断', () => {
  it('超宽字符串按字符数截断并保持引号闭合', () => {
    expect(render({ desc: 'aaaaaaaaaabbbbbbbbbb' }, { width: 22 })).toEqual(['└─ desc: "aaaaaaaaaa…"']);
  });
});

describe('render CJK 截断（显示宽度感知）', () => {
  it('长中文串窄宽下按显示宽度截断且行宽不超限', () => {
    const lines = render({ desc: '中文宽度测试'.repeat(4) }, { width: 20 });
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(displayWidth(line)).toBeLessThanOrEqual(20);
    expect(line).toContain('…');
    expect(line.endsWith('"')).toBe(true);
  });
});

describe('formatRow colored:false', () => {
  it('输出不含任何 ANSI 转义', () => {
    const rows = flattenTree({ a: 'x', b: [1], c: { d: true }, e: null });
    for (const r of rows) {
      expect(formatRow(r, { width: 100, colored: false, indicators: true })).not.toMatch(/\x1b\[/);
    }
  });
});

describe('render clictl 帮助数据（真实形态）', () => {
  it('顶层结构整体渲染', () => {
    const out = render(
      {
        ok: true,
        data: {
          usage: 'clictl <command> [args...]',
          global_flags: [{ desc: '缩进 JSON 输出', flag: '--pretty' }],
          commands: [
            { cmd: 'add <path>', desc: '注册 exe' },
            { cmd: 'rm <name>', desc: '删除注册' },
          ],
        },
      },
      { width: WIDE },
    );
    expect(out).toEqual([
      '├─ ok: true',
      '└─ data:',
      '  ├─ usage: "clictl <command> [args...]"',
      '  ├─ global_flags (1):',
      '    └─ [0]:',
      '      ├─ desc: "缩进 JSON 输出"',
      '      └─ flag: "--pretty"',
      '  └─ commands (2):',
      '    ├─ [0]:',
      '      ├─ cmd: "add <path>"',
      '      └─ desc: "注册 exe"',
      '    └─ [1]:',
      '      ├─ cmd: "rm <name>"',
      '      └─ desc: "删除注册"',
    ]);
  });
});
