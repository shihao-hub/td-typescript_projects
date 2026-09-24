/**
 * 渲染第一段：JSON → 扁平行列表（FlatRow[]）。
 *
 * - 节点 id 采用 RFC 6901 JSON Pointer（如 /data/commands/0/name），~ 转义 ~0、/ 转义 ~1，
 *   键名含 . / ~ 等字符也不碰撞；根节点 id 为 ''。
 * - expanded 集合缺省 = 全展开（纯打印路径）；传入集合（TUI 路径）时，
 *   不在集合内的非空容器收起并显示 {…}/[…] 占位。
 * - 行的着色与宽度截断一律不在此做，交给 render.ts 的 formatRow。
 */

export interface FlatRow {
  /** RFC 6901 路径；根原始值行为 '' */
  id: string;
  /** 顶层条目为 1（与树形前缀语义一致），根原始值行为 0 */
  depth: number;
  /** 是否同级末项（└─ / ├─） */
  isLast: boolean;
  /** 行标签：'key:' | 'key (N):' | '[0]' | '[0]:'（纯文本，不含 ANSI） */
  label: string;
  /** 数组元素行的标签整体 dim（[i]），对象键行不 dim */
  labelDim: boolean;
  /** 是否为可展开的非空对象/数组 */
  expandable: boolean;
  /** 当前是否展开（expandable=false 时恒 false） */
  expanded: boolean;
  /** 空容器占位 '{}'/'[]'，或 TUI 收起时的 '{…}'/'[…]' */
  placeholder?: string;
  /** 原始值行才有 */
  leafValue?: unknown;
}

export interface FlattenOptions {
  /** 展开中的容器 id 集合；缺省 = 全展开 */
  expanded?: ReadonlySet<string>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** JSON Pointer 转义：~ → ~0、/ → ~1 */
function esc(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function flattenTree(value: unknown, opts: FlattenOptions = {}): FlatRow[] {
  const expanded = opts.expanded;
  /** expanded 缺省视为全展开（纯打印路径） */
  const isOpen = (id: string): boolean => expanded === undefined || expanded.has(id);
  const out: FlatRow[] = [];

  const walkEntry = (key: string, v: unknown, parentId: string, depth: number, isLast: boolean): void => {
    const id = `${parentId}/${esc(key)}`;
    const label = Array.isArray(v) && v.length > 0 ? `${key} (${v.length}):` : `${key}:`;
    const base = { id, depth, isLast, label, labelDim: false };

    if (isPlainObject(v)) {
      if (Object.keys(v).length === 0) {
        out.push({ ...base, expandable: false, expanded: false, placeholder: '{}' });
        return;
      }
      const open = isOpen(id);
      out.push({ ...base, expandable: true, expanded: open, placeholder: open ? undefined : '{…}' });
      if (!open) return;
      const keys = Object.keys(v);
      keys.forEach((k, i) => walkEntry(k, v[k], id, depth + 1, i === keys.length - 1));
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push({ ...base, expandable: false, expanded: false, placeholder: '[]' });
        return;
      }
      const open = isOpen(id);
      out.push({ ...base, expandable: true, expanded: open, placeholder: open ? undefined : '[…]' });
      if (!open) return;
      v.forEach((el, i) => walkElement(i, el, id, depth + 1, i === v.length - 1));
    } else {
      out.push({ ...base, expandable: false, expanded: false, leafValue: v });
    }
  };

  const walkElement = (i: number, v: unknown, parentId: string, depth: number, isLast: boolean): void => {
    const id = `${parentId}/${i}`;
    const base = { id, depth, isLast, labelDim: true };

    if (isPlainObject(v)) {
      if (Object.keys(v).length === 0) {
        out.push({ ...base, label: `[${i}]`, expandable: false, expanded: false, placeholder: '{}' });
        return;
      }
      const open = isOpen(id);
      out.push({ ...base, label: `[${i}]:`, expandable: true, expanded: open, placeholder: open ? undefined : '{…}' });
      if (!open) return;
      const keys = Object.keys(v);
      keys.forEach((k, j) => walkEntry(k, v[k], id, depth + 1, j === keys.length - 1));
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push({ ...base, label: `[${i}]`, expandable: false, expanded: false, placeholder: '[]' });
        return;
      }
      const open = isOpen(id);
      out.push({ ...base, label: `[${i}]:`, expandable: true, expanded: open, placeholder: open ? undefined : '[…]' });
      if (!open) return;
      v.forEach((el, j) => walkElement(j, el, id, depth + 1, j === v.length - 1));
    } else {
      out.push({ ...base, label: `[${i}]`, expandable: false, expanded: false, leafValue: v });
    }
  };

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    keys.forEach((k, i) => walkEntry(k, value[k], '', 1, i === keys.length - 1));
  } else if (Array.isArray(value)) {
    value.forEach((el, i) => walkElement(i, el, '', 1, i === value.length - 1));
  } else {
    // 根原始值：单行、无前缀
    out.push({ id: '', depth: 0, isLast: true, label: '', labelDim: false, expandable: false, expanded: false, leafValue: value });
  }
  return out;
}

/** 是否为会产生独立展开行的非空容器 */
function isExpandable(v: unknown): boolean {
  return (isPlainObject(v) && Object.keys(v).length > 0) || (Array.isArray(v) && v.length > 0);
}

/** 收集全部可展开容器（非空对象/数组）的 id，供 TUI 初始全展开与 a 键全展开使用 */
export function collectExpandableIds(value: unknown): Set<string> {
  const ids = new Set<string>();

  const visit = (v: unknown, parentId: string): void => {
    if (isPlainObject(v)) {
      // 根对象自身没有行（顶层条目才是行），只登记与递归子节点
      Object.keys(v).forEach((k) => {
        const child = v[k];
        const childId = `${parentId}/${esc(k)}`;
        if (isExpandable(child)) ids.add(childId);
        visit(child, childId);
      });
    } else if (Array.isArray(v)) {
      v.forEach((el, i) => {
        const childId = `${parentId}/${i}`;
        if (isExpandable(el)) ids.add(childId);
        visit(el, childId);
      });
    }
  };

  visit(value, '');
  return ids;
}

/** 按 RFC 6901 反解 JSON Pointer 分段（~0 → ~，~1 → /） */
function unesc(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** 按 jtree 行 id（RFC 6901 JSON Pointer）取子树；'' 表示整个 root */
export function getValueAtPointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;

  let current: unknown = root;
  for (const escaped of pointer.split('/').slice(1)) {
    const token = unesc(escaped);
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(token)) return undefined;
      current = current[Number(token)];
    } else if (current !== null && typeof current === 'object') {
      current = (current as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * 取子树并保留末级 key / 数组下标，供 copy view 渲染 `name: value`、`[0]: value`。
 * 根指针没有末级行标签，直接返回 root。
 */
export function getWrappedValueAtPointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;

  const lastSlash = pointer.lastIndexOf('/');
  const escaped = pointer.slice(lastSlash + 1);
  const key = unesc(escaped);
  const parent = getValueAtPointer(root, pointer.slice(0, lastSlash));
  const value = getValueAtPointer(root, pointer);

  return Array.isArray(parent) ? [value] : { [key]: value };
}
