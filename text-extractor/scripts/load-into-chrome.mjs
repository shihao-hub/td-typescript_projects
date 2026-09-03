#!/usr/bin/env node
// 通过 CDP Extensions.loadUnpacked 把构建产物加载进本机 Chrome。
// 用法:
//   node scripts/load-into-chrome.mjs [扩展目录] [--port=9222] [--restart-chrome] [--no-open]
// 扩展目录默认 .output/chrome-mv3（生产构建）。

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const positional = args.filter((a) => !a.startsWith('--'));
const extDir = resolve(positional[0] ?? '.output/chrome-mv3'); // 没有这个参数就注入稳定版本
const port = Number(flags.find((f) => f.startsWith('--port='))?.slice(7) || 9222);
const restartChrome = flags.includes('--restart-chrome');
const noOpen = flags.includes('--no-open');

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function findChrome() {
  return CHROME_PATHS.find((p) => existsSync(p));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getVersion(timeoutMs = 3000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForVersion(retries = 20, intervalMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await getVersion(1500);
    } catch {
      await sleep(intervalMs);
    }
  }
  throw new Error('Chrome 调试端口未就绪');
}

function run(cmd, cmdArgs) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: false });
    child.on('close', (code) => resolvePromise(code ?? 0));
    child.on('error', () => resolvePromise(-1));
  });
}

async function restartChromeWithDebugPort() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('未找到 chrome.exe，请设置 CHROME_PATH 环境变量');
    process.exit(1);
  }
  console.log('正在关闭 Chrome（未保存的页面会话将自动恢复）...');
  await run('taskkill', ['/IM', 'chrome.exe']);
  for (let i = 0; i < 10; i++) {
    const code = await run('taskkill', ['/IM', 'chrome.exe']);
    if (code !== 0) break;
    await sleep(500);
  }
  console.log('以调试端口重启 Chrome...');
  const child = spawn(
    chrome,
    [
      `--remote-debugging-port=${port}`,
      '--enable-unsafe-extension-debugging',
      '--restore-last-session',
    ],
    { stdio: 'ignore', detached: true },
  );
  child.unref();
}

function printManualGuide() {
  console.log('');
  console.log('Chrome 未开启调试端口，无法自动注入，走 3 步手动加载：');
  console.log(`  1. 打开 chrome://extensions/，开启右上角「开发者模式」`);
  console.log('  2. 点「加载已解压的扩展程序」');
  console.log(`  3. 文件名框直接粘贴（路径已复制到剪贴板）: ${extDir}`);
  if (!noOpen) {
    run('powershell', [
      '-NoProfile',
      '-Command',
      `Set-Clipboard -Value '${extDir.replace(/'/g, "''")}'`,
    ]);
    run('cmd.exe', ['/c', 'start', '', 'chrome://extensions/']);
  }
  console.log('');
  console.log('说明：Chrome 在默认用户数据目录（日常 profile）上会忽略 --remote-debugging-port（安全限制）。');
  console.log('若注册表 HKCU\\Software\\Policies\\Google\\Chrome 可写，可加策略 DevToolsRemoteDebuggingAllowed=1 解锁；');
  console.log('策略被公司管控锁定时，上面 3 步即本机最快路径。');
}

function cdpCall(ws, method, params) {
  return new Promise((resolvePromise, rejectPromise) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) rejectPromise(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolvePromise(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', () => rejectPromise(new Error('CDP 连接中断')));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  if (!existsSync(extDir)) {
    console.error(`扩展目录不存在: ${extDir}（先执行 pnpm build）`);
    process.exit(1);
  }

  let version;
  try {
    version = await getVersion();
  } catch {
    if (restartChrome) {
      await restartChromeWithDebugPort();
      version = await waitForVersion();
    } else {
      printManualGuide();
      return;
    }
  }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    ws.addEventListener('open', resolvePromise);
    ws.addEventListener('error', () => rejectPromise(new Error('CDP WebSocket 连接失败')));
  });

  try {
    const result = await cdpCall(ws, 'Extensions.loadUnpacked', { path: extDir });
    console.log('√ 扩展已加载进正在运行的 Chrome');
    if (result?.id) {
      console.log(`  扩展 ID: ${result.id}`);
      console.log(`  管理页: chrome://extensions/?id=${result.id}`);
    }
    console.log('  已打开的页面需刷新后，右键菜单 / Ctrl+Shift+E 才会生效');
  } catch (err) {
    console.error(`加载失败: ${err.message}`);
    if (/unsafe|extension debugging|not enabled|disabled/i.test(err.message)) {
      console.error('Chrome 需要 --enable-unsafe-extension-debugging 参数，重启时加上即可');
    }
    process.exit(3);
  } finally {
    ws.close();
  }
}

main().catch((err) => {
  console.error(`出错: ${err?.message ?? err}`);
  process.exit(1);
});
