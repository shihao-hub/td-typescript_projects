#!/usr/bin/env node
import { Command } from 'commander';
import { colorEnabled, createPainter } from './color.js';
import { readFileUtf8, readStdin, runCapture } from './input.js';
import { render } from './render.js';

/** 从 JSON.parse 的 SyntaxError 中提取行列位置信息（尽力而为，失败则返回空串） */
function positionHint(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /position (\d+)/.exec(msg);
  if (!m) return '';
  const pos = Number(m[1]);
  if (!Number.isFinite(pos) || pos > text.length) return '';
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  return `（第 ${line} 行第 ${col} 列附近）`;
}

/** 解析并渲染一段 JSON 文本；返回进程退出码 */
function renderText(text: string, color: boolean): number {
  const trimmed = text.trim();
  if (!trimmed) {
    process.stderr.write('jtree: 输入为空，期待 JSON 文本\n');
    return 1;
  }
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`jtree: JSON 解析失败：${msg}${positionHint(trimmed, e)}\n`);
    return 1;
  }
  const lines = render(value, {
    painter: createPainter(color),
    width: process.stdout.columns ?? 120,
  });
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}

function fail(msg: string): number {
  process.stderr.write(`jtree: ${msg}\n`);
  return 1;
}

const program = new Command();

program
  .name('jtree')
  .version('0.1.0')
  .description('通用 JSON → 终端树形渲染器（stdin / 文件 / exec 子进程）')
  .enablePositionalOptions()
  .option('--no-color', '禁用 ANSI 颜色')
  .argument('[file]', 'JSON 文件路径；缺省时从 stdin 读取')
  .action(async (file: string | undefined, opts: { color: boolean }) => {
    let text: string;
    try {
      text = file !== undefined ? readFileUtf8(file) : await readStdin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.exitCode = fail(`读取输入失败：${msg}`);
      return;
    }
    process.exitCode = renderText(text, colorEnabled(opts.color));
  });

program
  .command('exec')
  .description('执行命令并渲染其 stdout 中的 JSON（绕开 PowerShell 管道编码转换，避免中文乱码）')
  .option('--no-color', '禁用 ANSI 颜色')
  .allowUnknownOption()
  .passThroughOptions()
  .argument('<cmd...>', '命令及参数，建议用 -- 与选项分隔，如：jtree exec -- clictl -h --pretty')
  .action(async (cmdArgs: string[], opts: { color: boolean }) => {
    const [cmd, ...args] = cmdArgs;
    if (!cmd) {
      process.exitCode = fail('exec: 缺少命令');
      return;
    }
    let result;
    try {
      result = await runCapture(cmd, args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.exitCode = fail(`exec: 无法启动 "${cmd}"：${msg}`);
      return;
    }
    // 子进程失败且无 stdout 可解析时，透传其 stderr 与退出码
    if (result.code !== 0 && !result.stdout.trim()) {
      if (result.stderr.trim()) process.stderr.write(result.stderr);
      process.exitCode = result.code ?? 1;
      return;
    }
    process.exitCode = renderText(result.stdout, colorEnabled(opts.color));
  });

program.parseAsync().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`jtree: ${msg}\n`);
  process.exit(1);
});
