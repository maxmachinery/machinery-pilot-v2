import { useEffect, useState } from 'react'

export default function Sidebar({ currentPage, onNavigate, onSelectBrand }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    fetch('/api/library')
      .then(r => r.json())
      .then(setRows)
      .catch(() => {})
  }, [currentPage])

  const NAV = [
    { id:'claim',    icon:'✦',  label:'New Claim'      },
    { id:'history',  icon:'🗂', label:'Claim History'  },
    { id:'library',  icon:'🖥', label:'Portal Setup'   },
    { id:'prompts',  icon:'📝', label:'Custom Prompts' },
  ]

  const NAV_BOTTOM = [
    { id:'settings', icon:'⚙', label:'Settings' },
  ]

  const DOC_TYPES = ['warranty_policy','portal_structure','technical_manual','warranty_schedule','historic_claims']
  const isFull = r => DOC_TYPES.every(t => (r.documents||[]).some(d => d.doc_type===t))
  const hasAny = r => (r.documents||[]).length > 0

  // Deduplicate by OEM name for Quick Select
  const seen = new Set()
  const uniqueOems = rows.filter(r => {
    if (seen.has(r.oemName)) return false
    seen.add(r.oemName)
    return true
  }).slice(0, 8)

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img
          src="/blue-group-logo.png"
          alt="Blue Group"
          style={{ width: '100%', maxWidth: '180px', height: 'auto', marginBottom: '12px', display: 'block' }}
        />
        <span className="sidebar-logo-mark">Warranty Engine</span>
      </div>

      <div style={{ marginTop: 4 }}>
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${item.extra||''} ${currentPage===item.id?'active':''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div style={{ height: 1, background: '#2A3550', margin: '8px 0' }} />
        {NAV_BOTTOM.map(item => (
          <button
            key={item.id}
            className={`nav-item ${currentPage===item.id?'active':''}`}
            onClick={() => onNavigate(item.id)}
            style={{ fontSize: 13 }}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {uniqueOems.length > 0 && (
        <>
          <div className="sidebar-divider" style={{ marginTop: 8 }} />
          <div className="sidebar-section-label">Quick Select</div>
          <div className="sidebar-oem-list">
            {uniqueOems.map(r => (
              <button
                key={r.oemName}
                className={`sidebar-oem-item ${currentPage==='brand'?'':''}`}
                onClick={() => onSelectBrand(r.oemName)}
              >
                <span className={`sidebar-oem-dot ${isFull(r)?'full':hasAny(r)?'partial':''}`} />
                <span className="sidebar-oem-name" title={r.oemName}>{r.oemName}</span>
              </button>
            ))}
            {rows.length > 8 && (
              <div style={{ padding: '6px 18px', fontSize: 11, color: 'rgba(255,255,255,.25)' }}>
                +{rows.length - 8} more in library
              </div>
            )}
          </div>
        </>
      )}

      <div className="sidebar-footer">v2.1 · Blue Group</div>
    </aside>
  )
}
