import { useEffect, useState } from 'react'

const DOC_TYPES = ['warranty_policy', 'portal_structure', 'machine_handbook', 'historic_claims']

export default function Sidebar({ currentPage, onNavigate, activeOem, onSelectOem }) {
  const [configs, setConfigs] = useState([])

  useEffect(() => {
    fetch('/api/oem/configs')
      .then(r => r.json())
      .then(setConfigs)
      .catch(() => {})
  }, [currentPage]) // refresh on page change to catch new OEMs

  const docCount = (cfg) => (cfg.documents || []).length
  const isFullyConfigured = (cfg) => DOC_TYPES.every(t => (cfg.documents || []).some(d => d.doc_type === t))

  const NAV = [
    { id: 'library',  icon: '🏛', label: 'OEM Library' },
    { id: 'claim',    icon: '✦',  label: 'New Claim' },
    { id: 'history',  icon: '🗂', label: 'Claim History' },
    { id: 'settings', icon: '⚙', label: 'Settings' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-mark">Warranty Engine</span>
        <span className="sidebar-logo-sub">Blue Group</span>
      </div>

      <div style={{ marginTop: 4 }}>
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {configs.length > 0 && (
        <>
          <div className="sidebar-divider" style={{ marginTop: 8 }} />
          <div className="sidebar-section-label">OEM Quick-Select</div>
          <div className="sidebar-oem-list">
            {configs.map(cfg => {
              const full = isFullyConfigured(cfg)
              const partial = docCount(cfg) > 0 && !full
              return (
                <button
                  key={cfg.id}
                  className={`sidebar-oem-item ${activeOem?.id === cfg.id ? 'active' : ''}`}
                  onClick={() => onSelectOem(cfg)}
                >
                  <span className={`sidebar-oem-dot ${full ? 'full' : partial ? 'partial' : ''}`} />
                  <span className="sidebar-oem-name">{cfg.name}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="sidebar-footer">
        v2.0 · Blue Group
      </div>
    </aside>
  )
}
