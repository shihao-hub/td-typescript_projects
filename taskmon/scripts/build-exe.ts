/**
 * taskmon exe 打包脚本（用 Bun 运行：bun scripts/build-exe.ts / pnpm exe）
 *
 * 版本号唯一来源是 package.json 的 version，通过 bun --define 在编译期内联为
 * process.env.TASKMON_VERSION，程序内 --version 即显示该值；产物带版本命名并输出 sha256。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const version = pkg.version;

const outFile = join('release', `taskmon-v${version}.exe`);
mkdirSync(join(root, 'release'), { recursive: true });

const define = `process.env.TASKMON_VERSION="${version}"`;
const r = spawnSync('bun', ['build', '--compile', '--define', define, '--outfile', outFile, 'src/main.ts'], {
  cwd: root,
  stdio: 'inherit',
});
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

const buf = readFileSync(join(root, outFile));
const sha256 = createHash('sha256').update(buf).digest('hex');
console.log(`\n✔ ${outFile}  ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`  sha256=${sha256}`);
