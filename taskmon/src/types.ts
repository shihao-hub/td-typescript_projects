export interface ProcessInfo {
  /** 镜像名（含扩展名），如 chrome.exe */
  name: string;
  pid: number;
  /** 工作集内存（字节） */
  memBytes: number;
}

export interface ProcessGroup {
  name: string;
  /** 组内按 memBytes 降序 */
  processes: ProcessInfo[];
  totalBytes: number;
  maxSingleBytes: number;
}
