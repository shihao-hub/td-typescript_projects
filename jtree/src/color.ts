import chalk from 'chalk';

/**
 * 着色器接口：render 只依赖此接口，注入 noop 即得到纯文本输出（便于测试与非 TTY 场景）
 */
export interface Painter {
  key(s: string): string;
  index(s: string): string;
  summary(s: string): string;
  string(s: string): string;
  number(s: string): string;
  bool(s: string): string;
  nullish(s: string): string;
  empty(s: string): string;
}

const identity = (s: string): string => s;

/** 不着色的着色器 */
export const noopPainter: Painter = {
  key: identity,
  index: identity,
  summary: identity,
  string: identity,
  number: identity,
  bool: identity,
  nullish: identity,
  empty: identity,
};

function createAnsiPainter(): Painter {
  return {
    key: chalk.cyan,
    index: chalk.gray,
    summary: chalk.bold,
    string: chalk.green,
    number: chalk.yellow,
    bool: chalk.magenta,
    nullish: chalk.gray,
    empty: chalk.gray,
  };
}

/**
 * 颜色启用判定：--no-color 显式关闭 > NO_COLOR 环境变量 > 非 TTY 自动关闭
 */
export function createPainter(enabled: boolean): Painter {
  return enabled ? createAnsiPainter() : noopPainter;
}

export function colorEnabled(noColorFlag: boolean): boolean {
  if (noColorFlag) return false;
  if (process.env['NO_COLOR'] !== undefined) return false;
  return process.stdout.isTTY === true;
}
