import { useState } from 'react'
import AppScaler     from './components/AppScaler.jsx'
import Sidebar       from './components/Sidebar.jsx'
import PortalSetup   from './pages/PortalSetup.jsx'
import NewClaim      from './pages/NewClaim.jsx'
import ClaimHistory  from './pages/ClaimHistory.jsx'
import Settings      from './pages/Settings.jsx'
import CustomPrompts      from './pages/CustomPrompts.jsx'
import BrandDetail        from './pages/BrandDetail.jsx'

const TITLES = {
  claim:     'New Claim',
  history:   'Claim History',
  library:   'Portal Setup',
  prompts:   'Custom Prompts',
  settings:  'Settings',
  brand:     'Brand',
}

export default function App() {
  const [page,          setPage]          = useState('claim')
  const [selectedBrand, setSelectedBrand] = useState(null)
  const [claimKey,   setClaimKey]   = useState(0)
  const [historyKey, setHistoryKey] = useState(0)

  function handleNavigate(id) {
    if (id === 'claim')   setClaimKey(k => k + 1)
    if (id === 'history') setHistoryKey(k => k + 1)
    setPage(id)
  }

  function handleSelectBrand(brandName) {
    setSelectedBrand(brandName)
    setPage('brand')
  }

  const title = page === 'brand' ? (selectedBrand || 'Brand') : (TITLES[page] || '')

  return (
    <AppScaler>
      <div className="shell">
        <Sidebar
          currentPage={page}
          onNavigate={handleNavigate}
          onSelectBrand={handleSelectBrand}
        />

        <div className="main-area">
          <div className="topbar">
            <span className="topbar-title">{title}</span>
            <div className="topbar-right" />
          </div>

          <div className="page-body">
            {page === 'claim'     && <NewClaim key={claimKey} onNavigate={handleNavigate} />}
            {page === 'history'   && <ClaimHistory key={historyKey} />}
            {page === 'library'   && <PortalSetup onStartClaim={() => setPage('claim')} />}
            {page === 'prompts'   && <CustomPrompts />}
            {page === 'settings'  && <Settings />}
            {page === 'brand'     && <BrandDetail brand={selectedBrand} onNavigate={setPage} />}
          </div>
        </div>
      </div>
    </AppScaler>
  )
}
