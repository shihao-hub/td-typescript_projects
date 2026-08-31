/**
 * 清理 release/ 中非 tag 构建的 exe（版本号带 +NNNN.ghash[.dirty] 后缀的产物）
 * （用 Bun 运行：bun scripts/clean-release.ts / pnpm clean-release，pnpm clean-release -- --dry 预览）
 *
 * 命名约定与 build-exe.ts 一致：taskmon-vX.Y.Z[+NNNN.ghash[.dirty]].exe，
 * 仅保留恰好落在 tag 上的 taskmon-vX.Y.Z.exe。
 */
import { readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

function die(msg: string): never {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

// ---------- 扫描 release/，按是否带 +NNNN.ghash 后缀分组 ----------
const files = readdirSync(join(root, 'release')).filter(f => f.endsWith('.exe'));
if (files.length === 0) die('release/ 下没有任何 exe');

const nonTagRe = /^taskmon-v\d+\.\d+\.\d+\+\d+\.g[0-9a-f]+(\.dirty)?\.exe$/;
const doomed: string[] = [];
const kept: string[] = [];
for (const f of files) (nonTagRe.test(f) ? doomed : kept).push(f);

if (doomed.length === 0) {
  console.log(`release/ 下没有非 tag 的 exe，无需清理（现有 ${kept.length} 个）`);
  process.exit(0);
}

// ---------- 删除 ----------
console.log(`${dry ? '[dry] 将删除' : '删除'} ${doomed.length} 个非 tag exe：`);
for (const f of doomed) console.log(`  - ${f}`);
if (!dry) {
  for (const f of doomed) rmSync(join(root, 'release', f));
}
console.log(`保留 ${kept.length} 个 tag exe：`);
for (const f of kept) console.log(`  + ${f}`);
if (dry) console.log('（--dry 预览模式，未实际删除）');
