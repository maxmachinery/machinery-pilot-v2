import { useState } from 'react'
import Sidebar      from './components/Sidebar.jsx'
import OEMLibrary   from './pages/OEMLibrary.jsx'
import NewClaim     from './pages/NewClaim.jsx'
import ClaimHistory from './pages/ClaimHistory.jsx'
import Settings     from './pages/Settings.jsx'

const TITLES = { library:'OEM Library', claim:'New Claim', history:'Claim History', settings:'Settings' }

export default function App() {
  const [page,       setPage]       = useState('library')
  const [activeMach, setActiveMach] = useState(null) // library row {oemName, machineModel, machineId, ...}

  function startClaimWithMachine(row) {
    setActiveMach(row)
    setPage('claim')
  }

  return (
    <div className="shell">
      <Sidebar currentPage={page} onNavigate={setPage} activeMachine={activeMach} onSelectMachine={m => { setActiveMach(m); setPage('library') }} />

      <div className="main-area">
        <div className="topbar">
          <span className="topbar-title">{TITLES[page]}</span>
          <div className="topbar-right">
            {activeMach && page === 'claim' && (
              <div className="topbar-oem-chip">
                <span className="dot" />
                {activeMach.oemName} — {activeMach.machineModel}
              </div>
            )}
          </div>
        </div>

        <div className="page-body">
          {page === 'library'  && <OEMLibrary onStartClaim={startClaimWithMachine} />}
          {page === 'claim'    && <NewClaim initialOem={activeMach} onOemChange={setActiveMach} />}
          {page === 'history'  && <ClaimHistory />}
          {page === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  )
}
