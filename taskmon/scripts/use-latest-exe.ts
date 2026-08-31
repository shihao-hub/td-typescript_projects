/**
 * 将 release/ 中最大版本的 exe 覆盖到项目根目录的 taskmon.exe
 * （用 Bun 运行：bun scripts/use-latest-exe.ts / pnpm use）
 *
 * 版本比较规则与 build-exe.ts 的命名约定一致：
 * taskmon-vX.Y.Z[+NNNN.ghash[.dirty]].exe，先比 X.Y.Z，再比领先 tag 的提交数
 * NNNN，同为 tag 后代时 .dirty 视为更新。若 taskmon.exe 正在运行则拒绝覆盖，
 * 提示用户先退出进程再重试。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function die(msg: string): never {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

type Version = {
  file: string;
  major: number;
  minor: number;
  patch: number;
  ahead: number;
  dirty: number;
};

// ---------- 扫描 release/ 并选出最大版本 ----------
const files = readdirSync(join(root, 'release')).filter(f => f.endsWith('.exe'));
if (files.length === 0) die('release/ 下没有任何 exe：先 pnpm exe 构建');

const versions: Version[] = [];
for (const f of files) {
  const m = f.match(/^taskmon-v(\d+)\.(\d+)\.(\d+)(?:\+(\d+)\.g[0-9a-f]+)?(\.dirty)?\.exe$/);
  if (!m || !m[1] || !m[2] || !m[3]) continue;
  versions.push({
    file: f,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    ahead: m[4] ? Number(m[4]) : 0,
    dirty: m[5] ? 1 : 0,
  });
}
if (versions.length === 0) die(`release/ 下没有形如 taskmon-vX.Y.Z[.exe] 的产物（现有：${files.join('、')}）`);

versions.sort((a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch || a.ahead - b.ahead || a.dirty - b.dirty);
const best = versions[versions.length - 1];
if (!best) die('版本解析异常：release/ 下无可用的 taskmon-v*.exe');
if (versions.length > 1) {
  console.log(`release/ 共 ${versions.length} 个版本，最大：${best.file}`);
}

// ---------- 运行检测 ----------
const target = join(root, 'taskmon.exe');
const t = spawnSync('tasklist', ['/FI', 'IMAGENAME eq taskmon.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
if (t.status === 0 && (t.stdout ?? '').toLowerCase().includes('taskmon.exe')) {
  die('taskmon.exe 正在运行，无法覆盖：请先退出该进程（托盘退出，或任务管理器/taskkill /IM taskmon.exe /F）后重试');
}

// ---------- 覆盖 ----------
try {
  copyFileSync(join(root, 'release', best.file), target);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
    die(`写入 taskmon.exe 失败（${err.code}）：文件可能仍被占用，请确认 taskmon.exe 已退出后重试`);
  }
  throw e;
}
console.log(`✔ release/${best.file} → taskmon.exe`);
