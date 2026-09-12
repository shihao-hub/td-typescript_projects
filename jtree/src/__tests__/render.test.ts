import { describe, expect, it } from 'vitest';
import { render } from '../render.js';

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
    const out = render({ ok: true, code: 1 }, { width: WIDE });
    expect(out).toEqual(['├─ ok: true', '└─ code: 1']);
  });

  it('空对象与空数组占位显示', () => {
    const out = render({ a: {}, b: [] }, { width: WIDE });
    expect(out).toEqual(['├─ a: {}', '└─ b: []']);
  });

  it('嵌套对象的连接符与缩进', () => {
    const out = render({ data: { usage: 'u', tail: { deep: 1 } }, ok: true }, { width: WIDE });
    expect(out).toEqual([
      '├─ data:',
      '│  ├─ usage: "u"',
      '│  └─ tail:',
      '│     └─ deep: 1',
      '└─ ok: true',
    ]);
  });
});

describe('render 数组', () => {
  it('原始值元素同行显示', () => {
    const out = render(['a', 1, null], { width: WIDE });
    expect(out).toEqual(['├─ [0] "a"', '├─ [1] 1', '└─ [2] null']);
  });

  it('空对象/空数组元素占位显示', () => {
    const out = render([{}, []], { width: WIDE });
    expect(out).toEqual(['├─ [0] {}', '└─ [1] []']);
  });

  it('对象元素以摘要做标题并展开全部字段', () => {
    const out = render([{ cmd: 'add', desc: '注册' }], { width: WIDE });
    expect(out).toEqual(['└─ [0] add', '   ├─ cmd: "add"', '   └─ desc: "注册"']);
  });

  it('摘要优先命中常见键名 cmd/flag，而非首个 string 字段', () => {
    const out = render({ flags: [{ desc: '说明', flag: '--pretty' }] }, { width: WIDE });
    expect(out[0]).toBe('└─ flags:');
    expect(out[1]).toBe('   └─ [0] --pretty');
  });

  it('无可用摘要时仅显示索引节点', () => {
    const out = render([{ n: 1 }], { width: WIDE });
    expect(out).toEqual(['└─ [0]', '   └─ n: 1']);
  });

  it('嵌套数组展开', () => {
    const out = render({ rows: [[1, 2]] }, { width: WIDE });
    expect(out).toEqual([
      '└─ rows:',
      '   └─ [0]',
      '      ├─ [0] 1',
      '      └─ [1] 2',
    ]);
  });
});

describe('render 截断', () => {
  it('超宽字符串按可视宽度截断并保持引号闭合', () => {
    const out = render({ desc: 'aaaaaaaaaabbbbbbbbbb' }, { width: 22 });
    expect(out).toEqual(['└─ desc: "aaaaaaaaaa…"']);
  });

  it('中文按双宽计入预算', () => {
    const out = render({ desc: '中文中文中文中文' }, { width: 20 });
    expect(out).toEqual(['└─ desc: "中文中文…"']);
  });

  it('数组对象元素摘要同样受预算约束', () => {
    const out = render([{ cmd: 'aaaaaaaaaabbbbbbbbbb' }], { width: 18 });
    expect(out[0]).toBe('└─ [0] aaaaaaaaaa…');
  });
});

describe('render clictl 帮助数据（真实形态）', () => {
  const help = {
    ok: true,
    data: {
      usage: 'clictl <command> [args...]',
      global_flags: [{ desc: '缩进 JSON 输出', flag: '--pretty' }],
      commands: [
        { cmd: 'add <path>', desc: '注册 exe' },
        { cmd: 'rm <name>', desc: '删除注册' },
      ],
    },
  };

  it('顶层结构整体渲染', () => {
    const out = render(help, { width: WIDE });
    expect(out).toEqual([
      '├─ ok: true',
      '└─ data:',
      '   ├─ usage: "clictl <command> [args...]"',
      '   ├─ global_flags:',
      '   │  └─ [0] --pretty',
      '   │     ├─ desc: "缩进 JSON 输出"',
      '   │     └─ flag: "--pretty"',
      '   └─ commands:',
      '      ├─ [0] add <path>',
      '      │  ├─ cmd: "add <path>"',
      '      │  └─ desc: "注册 exe"',
      '      └─ [1] rm <name>',
      '         ├─ cmd: "rm <name>"',
      '         └─ desc: "删除注册"',
    ]);
  });
});
