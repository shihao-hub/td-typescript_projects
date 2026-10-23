import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist-electron');

mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(root, 'electron', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(outDir, 'main.mjs'),
  external: ['electron', 'pino-pretty'],
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

const trayIcon = join(root, 'assets', 'icon-256.png');
if (existsSync(trayIcon)) copyFileSync(trayIcon, join(outDir, 'icon.png'));

console.log('✔ Electron 宿主已构建：dist-electron/main.mjs');

function findCsc(): string | undefined {
  const windir = process.env.WINDIR ?? 'C:\\Windows';
  const candidates = [
    join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  return candidates.find((p) => existsSync(p));
}

/** 编译轻量托盘 sidecar（C# WinForms，约 20 MB；业务与界面仍是 TS/Electron） */
function buildTray(targetDir: string, release: boolean): void {
  const csc = findCsc();
  if (!csc) {
    console.warn('⚠ 未找到 csc.exe，跳过托盘编译（仅影响托盘，不影响 GUI）');
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  const icon = join(root, 'assets', 'icon.ico');
  const args = [
    '/nologo',
    '/target:winexe',
    '/optimize+',
    `/out:${join(targetDir, 'taskmon-tray.exe')}`,
    `/win32icon:${icon}`,
    '/r:System.Windows.Forms.dll',
    '/r:System.Drawing.dll',
    ...(release ? ['/define:RELEASE'] : []),
    join(root, 'tray', 'TaskmonTray.cs'),
  ];
  const r = spawnSync(csc, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  copyFileSync(icon, join(targetDir, 'icon.ico'));
  console.log(`✔ 托盘已编译：${join(targetDir, 'taskmon-tray.exe')}`);
}

if (process.argv.includes('--package')) {
  const r = spawnSync('pnpm', ['exec', 'electron-builder', '--win', 'dir'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  buildTray(join(root, 'release', 'gui', 'win-unpacked'), true);
} else {
  buildTray(join(outDir, 'tray'), false);
}
