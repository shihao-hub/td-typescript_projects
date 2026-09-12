// 待接入模块的灰置占位页（filesync / quickask / zreadmanager）
export function PendingModule({ name }: { name: string }): React.JSX.Element {
  return (
    <div className="pending-page">
      <div className="big">{name}</div>
      <div>该模块待接入（后续计划）</div>
    </div>
  )
}
