export interface ProcessInfo {
  /** 镜像名（含扩展名），如 chrome.exe */
  name: string;
  pid: number;
  /** 工作集内存（字节） */
  memBytes: number;
  /** 父进程 PID（CIM 拓扑可用时填充） */
  ppid?: number;
  /** 进程创建时间（epoch 毫秒；受保护进程可能取不到） */
  creationDate?: number;
  /** 完整命令行（受保护进程/权限不足时无） */
  commandLine?: string;
  /** 父进程名（仅父有效时填充：父在本帧 CIM 快照中且未被 PID 复用） */
  parentName?: string;
  /** 父已退出或 PPID 已被复用（指向无关进程）——典型遗留/泄漏进程信号 */
  orphan?: boolean;
}

export interface ProcessGroup {
  name: string;
  /** 组内按 memBytes 降序 */
  processes: ProcessInfo[];
  totalBytes: number;
  maxSingleBytes: number;
}
