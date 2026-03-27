import { useEffect, useState } from 'react'

export default function Sidebar({ currentPage, onNavigate, activeMachine, onSelectMachine }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    fetch('/api/library')
      .then(r => r.json())
      .then(setRows)
      .catch(() => {})
  }, [currentPage])

  const NAV = [
    { id:'library',  icon:'🏛', label:'OEM Library'   },
    { id:'claim',    icon:'✦',  label:'New Claim'     },
    { id:'history',  icon:'🗂', label:'Claim History' },
    { id:'settings', icon:'⚙', label:'Settings'      },
  ]

  const DOC_TYPES = ['warranty_policy','portal_structure','machine_handbook','historic_claims']
  const isFull = r => DOC_TYPES.every(t => (r.documents||[]).some(d => d.doc_type===t))
  const hasAny = r => (r.documents||[]).length > 0

  // Group by OEM for sidebar display (show up to 8 machines total)
  const topMachines = rows.slice(0, 8)

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-mark">Warranty Engine</span>
        <span className="sidebar-logo-sub">Blue Group</span>
      </div>

      <div style={{ marginTop:4 }}>
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${currentPage===item.id?'active':''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {topMachines.length > 0 && (
        <>
          <div className="sidebar-divider" style={{ marginTop:8 }} />
          <div className="sidebar-section-label">Quick Select</div>
          <div className="sidebar-oem-list">
            {topMachines.map(r => (
              <button
                key={r.machineId}
                className={`sidebar-oem-item ${activeMachine?.machineId===r.machineId?'active':''}`}
                onClick={() => onSelectMachine(r)}
              >
                <span className={`sidebar-oem-dot ${isFull(r)?'full':hasAny(r)?'partial':''}`} />
                <span className="sidebar-oem-name" title={`${r.oemName} ${r.machineModel}`}>
                  {r.oemName} <span style={{ opacity:.6 }}>{r.machineModel}</span>
                </span>
              </button>
            ))}
            {rows.length > 8 && (
              <div style={{ padding:'6px 18px', fontSize:11, color:'rgba(255,255,255,.25)' }}>
                +{rows.length-8} more in library
              </div>
            )}
          </div>
        </>
      )}

      <div className="sidebar-footer">v2.1 · Blue Group</div>
    </aside>
  )
}
