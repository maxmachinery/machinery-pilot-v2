import { useState, useEffect } from 'react'

function fileIcon(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase()
  if (ext === 'pdf')  return '📄'
  if (['doc','docx'].includes(ext)) return '📝'
  if (['jpg','jpeg','png','webp','gif'].includes(ext)) return '🖼'
  if (['txt','md','csv'].includes(ext)) return '📃'
  return '📎'
}

function CategoryBadge({ cat }) {
  const colours = {
    'New Claim':       { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
    'Diagnostic':      { bg: '#F0FDF4', color: '#16A34A', border: '#86EFAC' },
    'Repair Sequence': { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
    'Cost Recovery':   { bg: '#FFF1F2', color: '#E11D48', border: '#FECDD3' },
    'Custom':          { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
  }
  const s = colours[cat] || { bg: '#F4F6F8', color: '#8A95A3', border: '#DDE3EA' }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 12, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {cat}
    </span>
  )
}

export default function BrandDetail({ brand, onNavigate }) {
  const [library,  setLibrary]  = useState(null)
  const [prompts,  setPrompts]  = useState(null)

  useEffect(() => {
    if (!brand) return
    fetch('/api/library').then(r => r.json()).then(setLibrary).catch(() => setLibrary([]))
    fetch('/api/prompts').then(r => r.json()).then(setPrompts).catch(() => setPrompts([]))
  }, [brand])

  // All docs for this brand (all machines + OEM-wide)
  const brandRows = (library || []).filter(r => r.oemName === brand)
  const allDocs = brandRows.flatMap(r => (r.documents || []).map(d => ({ ...d, machineModel: r.isOemWide ? null : r.machineModel })))

  // All prompts for this brand or "All Brands"
  const brandPrompts = (prompts || []).filter(p => p.brand === brand || !p.brand)

  if (!brand) return <div className="empty">No brand selected.</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
      {/* Column A — Documents */}
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h2 className="card-title" style={{ fontSize: 17 }}>Documents</h2>
              <p className="card-subtitle">All uploaded documents for {brand}</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('library')}>
              Manage in Library →
            </button>
          </div>

          {library === null ? (
            <div className="loader"><div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /></div>
          ) : allDocs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--grey-muted)', fontStyle: 'italic', padding: '12px 0' }}>
              No documents uploaded for {brand}.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allDocs.map((d, i) => (
                <div key={d.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 7, border: '1px solid var(--grey-border)', background: 'var(--grey-bg)' }}>
                  <span style={{ fontSize: 18 }}>{fileIcon(d.filename)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.filename || '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--grey-muted)', marginTop: 1 }}>
                      {d.doc_type?.replace(/_/g, ' ')}
                      {d.machineModel ? ` · ${d.machineModel}` : ' · OEM-wide'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Column B — Prompts */}
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h2 className="card-title" style={{ fontSize: 17 }}>Prompts</h2>
              <p className="card-subtitle">Saved prompts for {brand} and All Brands</p>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigate('prompts')}
            >
              + Add prompt for {brand}
            </button>
          </div>

          {prompts === null ? (
            <div className="loader"><div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /></div>
          ) : brandPrompts.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--grey-muted)', fontStyle: 'italic', padding: '12px 0' }}>
              No prompts for {brand} yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {brandPrompts.map(p => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 7, border: '1px solid var(--grey-border)', background: 'var(--grey-bg)', cursor: 'pointer' }}
                  onClick={() => onNavigate('prompts')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{p.name}</span>
                      <CategoryBadge cat={p.category} />
                      {p.is_default ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ok)', background: 'var(--ok-bg)', border: '1px solid var(--ok-ring)', padding: '1px 7px', borderRadius: 10 }}>
                          Default
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--grey-muted)' }}>
                      {p.brand ? `Brand: ${p.brand}` : 'All Brands'} · {p.prompt_text.slice(0, 80)}…
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600, whiteSpace: 'nowrap', paddingTop: 2 }}>Edit →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
