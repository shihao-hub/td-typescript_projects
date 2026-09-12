#!/usr/bin/env node
import { render } from './render.js';

/** PS 5.1 管道会按控制台编码转码损坏中文 JSON，解析失败时给出可行动的提示 */
const PS51_HINT = [
  '提示：PowerShell 5.1 管道会按控制台编码转码损坏中文，请先执行：',
  '      $OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8',
  '      或使用 Git Bash / PowerShell 7',
].join('\n');

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(c as Buffer));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) {
    process.stderr.write('用法：clictl -h --pretty | jtree（JSON 经由 stdin 传入）\n');
    process.exitCode = 1;
    return;
  }

  const text = (await readStdin()).trim();
  if (!text) {
    process.stderr.write('jtree: 输入为空，期待 JSON 文本\n');
    process.exitCode = 1;
    return;
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`jtree: JSON 解析失败：${msg}\n${PS51_HINT}\n`);
    process.exitCode = 1;
    return;
  }

  const lines = render(value, { width: process.stdout.columns ?? 120 });
  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`jtree: ${msg}\n`);
  process.exitCode = 1;
});
