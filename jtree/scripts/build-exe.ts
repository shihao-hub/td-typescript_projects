/**
 * jtree exe 打包脚本（pnpm exe / bun scripts/build-exe.ts）
 *
 * 版本号取 package.json，用 bun compile 打成单文件 exe（自带运行时，
 * 目标机器无需 Node/pnpm/bun），产物带版本命名并输出 sha256。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const outFile = join('release', `jtree-v${pkg.version}.exe`);
mkdirSync(join(root, 'release'), { recursive: true });

const r = spawnSync('bun', ['build', '--compile', '--outfile', outFile, 'src/main.ts'], {
  cwd: root,
  stdio: 'inherit',
});
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

const buf = readFileSync(join(root, outFile));
console.log(`\n✔ ${outFile}  ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`  sha256=${createHash('sha256').update(buf).digest('hex')}`);
