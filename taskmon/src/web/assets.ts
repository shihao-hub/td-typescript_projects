export const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>taskmon</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header class="top">
  <div class="brand"><span class="logo">▤</span><h1>taskmon</h1><span id="channel" class="badge"></span></div>
  <div class="summary">
    <div class="mem"><span id="memPct">--</span><div class="bar"><i id="memBar"></i></div></div>
    <span id="procCount" class="stat"></span>
    <span id="updated" class="stat"></span>
  </div>
</header>
<div class="toolbar">
  <div class="views">
    <button data-view="group" class="tab active">分组</button>
    <button data-view="tree" class="tab">进程树</button>
  </div>
  <input id="search" placeholder="按名称筛选…" autocomplete="off" spellcheck="false">
  <button id="expandAll" class="ghost">全部展开</button>
  <button id="refresh" class="ghost">刷新</button>
  <span id="topo" class="topo"></span>
</div>
<main id="content"></main>
<div id="status" class="status"></div>
<div id="modal" class="modal hidden">
  <div class="modal-card">
    <h2>结束进程</h2>
    <p id="modalText"></p>
    <div class="modal-actions">
      <button id="cancelKill" class="ghost">取消</button>
      <button id="confirmKill" class="danger">结束</button>
    </div>
  </div>
</div>
<script src="/app.js"></script>
</body>
</html>
`;

export const APP_CSS = `:root {
  --bg: #101216;
  --panel: #16191f;
  --line: #252a33;
  --fg: #dfe3ea;
  --dim: #8b93a1;
  --accent: #4cc2ff;
  --accent-dim: #1d5c78;
  --danger: #ef5b5b;
  --warn: #e0a33e;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 13px/1.45 "Cascadia Mono", "Consolas", "Microsoft YaHei UI", monospace;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
button { font: inherit; cursor: pointer; }
.top {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel);
  flex: none;
}
.brand { display: flex; align-items: center; gap: 8px; }
.brand .logo { color: var(--accent); font-size: 16px; }
.brand h1 { font-size: 15px; margin: 0; letter-spacing: .5px; font-weight: 600; }
.badge {
  font-size: 11px; padding: 1px 6px; border: 1px solid var(--line); border-radius: 3px;
  color: var(--dim); text-transform: uppercase;
}
.summary { display: flex; align-items: center; gap: 18px; color: var(--dim); font-size: 12px; }
.mem { display: flex; align-items: center; gap: 8px; }
.mem #memPct { color: var(--fg); min-width: 46px; text-align: right; }
.bar { width: 120px; height: 6px; background: #232830; border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .3s ease; }
.toolbar {
  display: flex; align-items: center; gap: 10px; padding: 8px 16px;
  border-bottom: 1px solid var(--line); background: #13161b; flex: none;
}
.views { display: flex; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.tab { background: transparent; border: 0; color: var(--dim); padding: 4px 12px; }
.tab.active { background: var(--accent-dim); color: #fff; }
#search {
  flex: 1; max-width: 320px; background: #0d0f12; border: 1px solid var(--line);
  border-radius: 4px; color: var(--fg); padding: 4px 8px; outline: none;
}
#search:focus { border-color: var(--accent-dim); }
.ghost {
  background: transparent; border: 1px solid var(--line); color: var(--dim);
  border-radius: 4px; padding: 4px 10px;
}
.ghost:hover { color: var(--fg); border-color: #3a4350; }
.topo { margin-left: auto; color: var(--dim); font-size: 12px; }
main { flex: 1; overflow: auto; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead th {
  position: sticky; top: 0; z-index: 2; background: var(--panel);
  color: var(--dim); font-weight: 500; text-align: left; font-size: 12px;
  padding: 6px 10px; border-bottom: 1px solid var(--line);
}
tbody td { padding: 4px 10px; border-bottom: 1px solid #1a1e24; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
tbody tr.group:hover, tbody tr.node:hover { background: #1a1f27; }
tbody tr.member { background: #12151a; color: #b9c0cb; }
tbody tr.member td { font-size: 12px; }
tbody tr.member:hover { background: #171b21; }
.name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.name .text { overflow: hidden; text-overflow: ellipsis; }
.caret {
  width: 14px; color: var(--dim); flex: none; display: inline-block; text-align: center;
  user-select: none;
}
.caret.clickable { cursor: pointer; }
.orphan { color: var(--warn); }
.kill {
  background: transparent; border: 1px solid #3a2a2a; color: #c97b7b;
  border-radius: 3px; padding: 1px 7px; font-size: 11px; opacity: 0;
}
tr:hover .kill { opacity: 1; }
.kill:hover { background: #2a1a1a; color: #ff9a9a; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.muted { color: var(--dim); }
.status {
  flex: none; padding: 6px 16px; border-top: 1px solid var(--line);
  background: var(--panel); color: var(--dim); font-size: 12px; min-height: 28px;
}
.status.err { color: var(--danger); }
.modal {
  position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex;
  align-items: center; justify-content: center; z-index: 10;
}
.modal.hidden { display: none; }
.modal-card {
  width: 380px; background: var(--panel); border: 1px solid var(--line);
  border-radius: 8px; padding: 18px 20px; box-shadow: 0 18px 50px rgba(0,0,0,.5);
}
.modal-card h2 { margin: 0 0 10px; font-size: 14px; }
.modal-card p { color: var(--dim); line-height: 1.7; margin: 0 0 16px; word-break: break-all; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.danger { background: #7a2626; border: 1px solid #a83a3a; color: #ffd9d9; border-radius: 4px; padding: 5px 14px; }
.danger:hover { background: #933030; }
`;

export const APP_JS = `(function () {
  'use strict';

  var state = {
    view: 'group',
    snap: null,
    expandedGroups: new Set(),
    expandedNodes: new Set(),
    query: '',
    treeInit: false,
    pending: null,
    busy: false
  };

  var content = document.getElementById('content');
  var statusEl = document.getElementById('status');
  var modal = document.getElementById('modal');
  var modalText = document.getElementById('modalText');

  function fmtBytes(bytes) {
    if (!isFinite(bytes) || bytes <= 0) return '0';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var v = bytes, u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    var dec = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return v.toFixed(dec) + ' ' + units[u];
  }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (isErr ? ' err' : '');
  }

  function matches(name) {
    return !state.query || name.toLowerCase().indexOf(state.query) >= 0;
  }

  function fetchSnapshot() {
    return fetch('/api/snapshot', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (snap) {
        state.snap = snap;
        if (!state.treeInit && snap.tree && snap.tree.length) {
          snap.tree.forEach(function (n) {
            if (n.proc.name.toLowerCase() === 'explorer.exe') state.expandedNodes.add(n.proc.pid);
          });
          state.treeInit = true;
        }
        render();
      })
      .catch(function (e) {
        setStatus('快照获取失败：' + e.message, true);
      });
  }

  function renderSummary() {
    var snap = state.snap;
    if (!snap) return;
    var pct = Math.round(snap.sysMem.usedPct * 100);
    document.getElementById('memPct').textContent = pct + '%';
    document.getElementById('memBar').style.width = pct + '%';
    document.getElementById('memBar').style.background = pct > 90 ? '#ef5b5b' : pct > 75 ? '#e0a33e' : '#4cc2ff';
    document.getElementById('procCount').textContent = snap.totalProcs + ' 进程 / ' + snap.groups.length + ' 组';
    var d = new Date(snap.at);
    document.getElementById('updated').textContent = d.toLocaleTimeString('zh-CN', { hour12: false });
    document.getElementById('topo').textContent = snap.topology.available ? '拓扑已连接' : '拓扑加载中…';
    if (snap.error) setStatus('采集失败：' + snap.error, true);
    else if (!statusEl.classList.contains('err')) setStatus('');
  }

  function head(columns) {
    var thead = el('thead');
    var tr = el('tr');
    columns.forEach(function (c) {
      var th = el('th', c.cls || '', c.label);
      if (c.width) th.style.width = c.width;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  }

  function killButton(label, pids) {
    var b = el('button', 'kill', '结束');
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      askKill(label, pids);
    });
    return b;
  }

  function renderGroups() {
    var snap = state.snap;
    var table = el('table');
    table.appendChild(head([
      { label: '进程组', width: '42%' },
      { label: '进程数', width: '10%', cls: 'num' },
      { label: '内存', width: '16%', cls: 'num' },
      { label: '占物理内存', width: '18%', cls: 'num' },
      { label: '', width: '14%' }
    ]));
    var tbody = el('tbody');
    snap.groups.forEach(function (g) {
      var visible = !state.query || matches(g.name) || g.processes.some(function (p) { return matches(p.name); });
      if (!visible) return;
      var expanded = state.expandedGroups.has(g.name);
      var hasChildren = g.processes.length > 1;
      var tr = el('tr', 'group');
      var tdName = el('td');
      var wrap = el('div', 'name');
      var caret = el('span', 'caret', hasChildren ? (expanded ? '▾' : '▸') : '');
      if (hasChildren) {
        caret.classList.add('clickable');
        caret.addEventListener('click', function (ev) {
          ev.stopPropagation();
          toggleGroup(g.name);
        });
      }
      wrap.appendChild(caret);
      wrap.appendChild(el('span', 'text', g.name));
      tdName.appendChild(wrap);
      tr.appendChild(tdName);
      tr.appendChild(el('td', 'num muted', String(g.processes.length)));
      tr.appendChild(el('td', 'num', fmtBytes(g.totalBytes)));
      var pct = snap.sysMem.total > 0 ? (g.totalBytes / snap.sysMem.total * 100) : 0;
      tr.appendChild(el('td', 'num muted', pct.toFixed(1) + '%'));
      var tdAct = el('td');
      tdAct.appendChild(killButton(g.name + ' 组', g.processes.map(function (p) { return p.pid; })));
      tr.appendChild(tdAct);
      tr.addEventListener('click', function () { if (hasChildren) toggleGroup(g.name); });
      tbody.appendChild(tr);

      if (expanded) {
        g.processes.forEach(function (p) {
          var m = el('tr', 'member');
          var td = el('td');
          var w = el('div', 'name');
          w.appendChild(el('span', 'caret', ''));
          w.appendChild(el('span', 'text', 'PID ' + p.pid + (p.orphan ? '  † 父已退出' : (p.parentName ? '  ↖ ' + p.parentName : ''))));
          td.appendChild(w);
          m.appendChild(td);
          m.appendChild(el('td', 'num muted', ''));
          m.appendChild(el('td', 'num', fmtBytes(p.memBytes)));
          var share = g.totalBytes > 0 ? (p.memBytes / g.totalBytes * 100) : 0;
          m.appendChild(el('td', 'num muted', share.toFixed(1) + '%'));
          var cmd = el('td', '', p.commandLine || '');
          cmd.title = p.commandLine || '';
          m.appendChild(cmd);
          tbody.appendChild(m);
        });
      }
    });
    table.appendChild(tbody);
    content.replaceChildren(table);
  }

  function toggleGroup(name) {
    if (state.expandedGroups.has(name)) state.expandedGroups.delete(name);
    else state.expandedGroups.add(name);
    render();
  }

  function flatten(nodes, depth, out, keep) {
    nodes.forEach(function (n) {
      var include = !keep || keep.has(n.proc.pid);
      if (include) out.push({ node: n, depth: depth });
      if (state.expandedNodes.has(n.proc.pid) || (keep && keep.has(n.proc.pid))) {
        flatten(n.children, depth + 1, out, keep);
      }
    });
    return out;
  }

  function renderTree() {
    var snap = state.snap;
    var keep = null;
    if (state.query) {
      keep = new Set();
      (function walk(nodes, ancestors) {
        nodes.forEach(function (n) {
          var next = ancestors.concat([n.proc.pid]);
          var hit = n.proc.name.toLowerCase().indexOf(state.query) >= 0;
          if (hit) next.forEach(function (pid) { keep.add(pid); });
          walk(n.children, next);
        });
      })(snap.tree, []);
      keep.forEach(function (pid) { state.expandedNodes.add(pid); });
    }
    var rows = flatten(snap.tree, 0, [], keep);
    var table = el('table');
    table.appendChild(head([
      { label: '进程树', width: '44%' },
      { label: 'PID', width: '9%', cls: 'num' },
      { label: '自身内存', width: '13%', cls: 'num' },
      { label: '子树合计', width: '13%', cls: 'num' },
      { label: '命令行', width: '15%' },
      { label: '', width: '6%' }
    ]));
    var tbody = el('tbody');
    rows.forEach(function (r) {
      var n = r.node;
      var p = n.proc;
      var tr = el('tr', 'node');
      var tdName = el('td');
      var wrap = el('div', 'name');
      wrap.style.paddingLeft = (r.depth * 16) + 'px';
      var has = n.children.length > 0;
      var isOpen = state.expandedNodes.has(p.pid);
      var caret = el('span', 'caret', has ? (isOpen ? '▾' : '▸') : '');
      if (has) {
        caret.classList.add('clickable');
        caret.addEventListener('click', function (ev) {
          ev.stopPropagation();
          toggleNode(p.pid);
        });
      }
      wrap.appendChild(caret);
      wrap.appendChild(el('span', 'text', p.name));
      tdName.appendChild(wrap);
      tr.appendChild(tdName);
      tr.appendChild(el('td', 'num muted', String(p.pid)));
      tr.appendChild(el('td', 'num', fmtBytes(p.memBytes)));
      tr.appendChild(el('td', 'num', fmtBytes(n.subtreeBytes)));
      var cmd = el('td', 'muted', p.commandLine || '');
      cmd.title = p.commandLine || '';
      tr.appendChild(cmd);
      var tdAct = el('td');
      if (has && !p.orphan) tdAct.appendChild(killButton(p.name + ' 子树', [p.pid]));
      tr.appendChild(tdAct);
      tr.addEventListener('click', function () { if (has) toggleNode(p.pid); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    content.replaceChildren(table);
  }

  function toggleNode(pid) {
    if (state.expandedNodes.has(pid)) state.expandedNodes.delete(pid);
    else state.expandedNodes.add(pid);
    render();
  }

  function render() {
    renderSummary();
    if (!state.snap) return;
    if (state.view === 'tree') renderTree();
    else renderGroups();
  }

  function askKill(label, pids) {
    state.pending = { label: label, pids: pids };
    modalText.textContent = '结束「' + label + '」，共 ' + pids.length + ' 个 PID？此操作不可撤销。';
    modal.classList.remove('hidden');
  }

  function closeModal() {
    state.pending = null;
    modal.classList.add('hidden');
  }

  function confirmKill() {
    if (!state.pending || state.busy) return;
    var payload = state.pending;
    state.busy = true;
    setStatus('正在结束 ' + payload.label + ' …');
    fetch('/api/kill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pids: payload.pids, label: payload.label })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        state.busy = false;
        closeModal();
        if (!res.ok) {
          setStatus('结束失败：' + res.error, true);
        } else {
          var s = res.summary;
          setStatus('已结束 ' + s.killed + ' · 已退出 ' + s.gone + (s.failed ? ' · 失败 ' + s.failed : ''));
        }
        return fetchSnapshot();
      })
      .catch(function (e) {
        state.busy = false;
        closeModal();
        setStatus('结束失败：' + e.message, true);
      });
  }

  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.view = btn.getAttribute('data-view');
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
      render();
    });
  });

  document.getElementById('search').addEventListener('input', function (ev) {
    state.query = ev.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById('expandAll').addEventListener('click', function () {
    if (!state.snap) return;
    if (state.view === 'tree') {
      var all = true;
      (function walk(nodes) {
        nodes.forEach(function (n) {
          if (n.children.length && !state.expandedNodes.has(n.proc.pid)) all = false;
          walk(n.children);
        });
      })(state.snap.tree);
      state.snap.tree.forEach(function (n) {
        (function walk(node) {
          if (all) state.expandedNodes.delete(node.proc.pid);
          else state.expandedNodes.add(node.proc.pid);
          node.children.forEach(walk);
        })(n);
      });
    } else {
      var names = state.snap.groups.filter(function (g) { return g.processes.length > 1; }).map(function (g) { return g.name; });
      var open = names.length > 0 && names.every(function (n) { return state.expandedGroups.has(n); });
      names.forEach(function (n) { if (open) state.expandedGroups.delete(n); else state.expandedGroups.add(n); });
    }
    render();
  });

  document.getElementById('refresh').addEventListener('click', fetchSnapshot);
  document.getElementById('cancelKill').addEventListener('click', closeModal);
  document.getElementById('confirmKill').addEventListener('click', confirmKill);
  modal.addEventListener('click', function (ev) { if (ev.target === modal) closeModal(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });

  fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
    document.getElementById('channel').textContent = h.version === 'dev' ? h.channel : h.channel + ' · v' + h.version;
  }).catch(function () {});

  fetchSnapshot();
  setInterval(function () {
    if (document.hidden) return;
    fetchSnapshot();
  }, 2000);
})();
`;
