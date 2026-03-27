import { useState } from 'react'
import Sidebar      from './components/Sidebar.jsx'
import OEMLibrary   from './pages/OEMLibrary.jsx'
import NewClaim     from './pages/NewClaim.jsx'
import ClaimHistory from './pages/ClaimHistory.jsx'
import Settings     from './pages/Settings.jsx'

const PAGE_TITLES = {
  library:  'OEM Library',
  claim:    'New Claim',
  history:  'Claim History',
  settings: 'Settings',
}

export default function App() {
  const [page,      setPage]      = useState('library')
  const [activeOem, setActiveOem] = useState(null)

  // When user clicks an OEM in sidebar, navigate to library with that OEM open
  function handleSelectOem(oem) {
    setActiveOem(oem)
    setPage('library')
  }

  // When New Claim is started with a specific OEM pre-selected
  function startClaimWithOem(oem) {
    setActiveOem(oem)
    setPage('claim')
  }

  return (
    <div className="shell">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        activeOem={activeOem}
        onSelectOem={handleSelectOem}
      />

      <div className="main-area">
        <div className="topbar">
          <span className="topbar-title">{PAGE_TITLES[page]}</span>
          <div className="topbar-right">
            {activeOem && page === 'claim' && (
              <div className="topbar-oem-chip">
                <span className="dot" />
                {activeOem.name}
              </div>
            )}
          </div>
        </div>

        <div className="page-body">
          {page === 'library'  && (
            <OEMLibrary
              focusOemId={activeOem?.id}
              onStartClaim={startClaimWithOem}
            />
          )}
          {page === 'claim'    && (
            <NewClaim
              initialOem={activeOem}
              onOemChange={setActiveOem}
            />
          )}
          {page === 'history'  && <ClaimHistory onReopen={(s) => { setPage('claim') }} />}
          {page === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  )
}
