/**
 * taskmon exe 打包脚本（用 Bun 运行：bun scripts/build-exe.ts / pnpm exe [参数]）
 *
 * 版本号通过 bun --define 编译期内联为 process.env.TASKMON_VERSION，程序内 --version 即显示
 * 该值；产物带版本命名并输出 sha256。三种模式：
 *
 * - 默认             版本取 package.json 的 version（行为与历史版本一致，不依赖 git）
 * - --tag            git tag（taskmon/v*）为唯一版本来源：
 *                     · 正好在 tag 上且树干净 → 纯版本号（如 0.2.0）
 *                     · 领先 tag N 个提交 → 追加 +NNNN.ghash（N 零填充 4 位，字典序=先后序）
 *                     · 工作树有未提交/未跟踪文件 → 再追加 .dirty
 * - --release[=patch|minor|major]（默认 patch）
 *                    发版一条龙：校验干净树 → 基于最新可达 taskmon/v* tag 自增（无历史 tag
 *                    时以 package.json 为基底）→ 打 annotated tag → 推送（无远程跳过，失败仅
 *                    警告）→ 按 --tag 模式构建。package.json 全程不被修改。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function die(msg: string): never {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

function git(args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) die(`git ${args.join(' ')} 失败：${(r.stderr ?? '').trim()}`);
  return (r.stdout ?? '').trim();
}

function parseSemver(s: string): [number, number, number] {
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m || !m[1] || !m[2] || !m[3]) die(`无法解析三段版本号 "${s}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
let useTag = false;
let releaseLevel: 'patch' | 'minor' | 'major' | undefined;
for (const a of argv) {
  if (a === '--tag') useTag = true;
  else if (a === '--release') releaseLevel = 'patch';
  else if (a.startsWith('--release=')) {
    const v = a.slice('--release='.length);
    if (v !== 'patch' && v !== 'minor' && v !== 'major') die(`--release 取值仅支持 patch|minor|major，收到 "${v}"`);
    releaseLevel = v;
  } else die(`未知参数 ${a}（可用：--tag / --release[=patch|minor|major]）`);
}
if (useTag && releaseLevel) die('--tag 与 --release 互斥：--release 打完 tag 后自动按 tag 构建');

// ---------- 版本号确定 ----------
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const dirty = useTag || releaseLevel ? git(['status', '--porcelain']) !== '' : false;
let version: string;
let source: string;

if (releaseLevel) {
  if (dirty) die('工作树不干净（存在未提交/未跟踪文件，git status 查看）——exe 内嵌的是工作区源码，脏树打 tag 会导致 tag 与产物对不上');
  const d = spawnSync('git', ['describe', '--tags', '--match', 'taskmon/v*', '--abbrev=0'], { cwd: root, encoding: 'utf8' });
  const baseTag = d.status === 0 ? (d.stdout ?? '').trim() : undefined;
  const [x, y, z] = parseSemver(baseTag ? baseTag.replace(/^taskmon\/v/, '') : pkg.version);
  const next = releaseLevel === 'major' ? `${x + 1}.0.0` : releaseLevel === 'minor' ? `${x}.${y + 1}.0` : `${x}.${y}.${z + 1}`;
  const nextTag = `taskmon/v${next}`;
  const exists = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${nextTag}`], { cwd: root, encoding: 'utf8' });
  if (exists.status === 0) die(`tag ${nextTag} 已存在：git tag -d ${nextTag} 删除后重试，或检查版本基底`);
  git(['tag', '-a', nextTag, '-m', `taskmon v${next}`]);
  console.log(`✔ 已打 tag ${nextTag}（${releaseLevel} 自增，基底：${baseTag ?? `package.json ${pkg.version}`}）`);
  const remote = git(['remote']).split(/\r?\n/).filter(Boolean)[0];
  if (!remote) console.log('  未配置 git 远程，跳过 tag 推送');
  else {
    const p = spawnSync('git', ['push', remote, nextTag], { cwd: root, stdio: 'inherit' });
    if (p.status !== 0) console.warn(`⚠ tag 推送失败：稍后手动执行 git push ${remote} ${nextTag}`);
  }
  useTag = true;
}

if (useTag) {
  const d = spawnSync('git', ['describe', '--tags', '--match', 'taskmon/v*'], { cwd: root, encoding: 'utf8' });
  if (d.status !== 0) die('未找到可达的 taskmon/v* tag：先 pnpm exe --release 发版，或用默认模式 pnpm exe');
  const desc = (d.stdout ?? '').trim();
  const m = desc.match(/^taskmon\/v(\d+\.\d+\.\d+)(?:-(\d+)-g([0-9a-f]+))?$/);
  if (!m || !m[1]) die(`无法解析 git describe 输出 "${desc}"（期望形如 taskmon/v0.2.0[-N-ghash]）`);
  version = m[1];
  if (m[2] && m[3]) version += `+${m[2].padStart(4, '0')}.g${m[3]}`;
  if (dirty) version += '.dirty';
  source = `git describe：${desc}${dirty ? '（脏树 +.dirty）' : ''}`;
} else {
  version = pkg.version;
  source = `package.json ${version}`;
}

console.log(`版本 ${version}（来源：${source}）`);

// ---------- 构建 ----------
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
