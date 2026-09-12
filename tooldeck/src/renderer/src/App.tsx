import { useState } from 'react'
import { ToastProvider } from './common/toast'
import { ConfirmProvider } from './common/confirm'
import { ExestarterModule } from './modules/exestarter/ExestarterModule'
import { PendingModule } from './modules/pending/PendingModule'
import { SettingsModule } from './modules/settings/SettingsModule'

type ModuleId = 'exestarter' | 'filesync' | 'quickask' | 'zreadmanager' | 'settings'

// 单应用多模块：左侧导航切换，exestarter 之外灰置待接入
const MODULES: Array<{ id: ModuleId; name: string; available: boolean }> = [
  { id: 'exestarter', name: 'exestarter', available: true },
  { id: 'filesync', name: 'filesync', available: false },
  { id: 'quickask', name: 'quickask', available: false },
  { id: 'zreadmanager', name: 'zreadmanager', available: false }
]

function App(): React.JSX.Element {
  const [active, setActive] = useState<ModuleId>('exestarter')

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="app">
          <nav className="nav">
            <div className="nav-title">tooldeck</div>
            {MODULES.map((m) => (
              <button
                key={m.id}
                className={`nav-item ${active === m.id ? 'active' : ''} ${m.available ? '' : 'pending'}`}
                onClick={() => m.available && setActive(m.id)}
              >
                {m.name}
                {!m.available && <span className="nav-badge">待接入</span>}
              </button>
            ))}
            <div className="nav-spacer" />
            <button
              className={`nav-item ${active === 'settings' ? 'active' : ''}`}
              onClick={() => setActive('settings')}
            >
              设置
            </button>
          </nav>
          <main className="main">
            {active === 'exestarter' && (
              <ExestarterModule onOpenSettings={() => setActive('settings')} />
            )}
            {active === 'filesync' && <PendingModule name="filesync" />}
            {active === 'quickask' && <PendingModule name="quickask" />}
            {active === 'zreadmanager' && <PendingModule name="zreadmanager" />}
            {active === 'settings' && <SettingsModule />}
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}

export default App
