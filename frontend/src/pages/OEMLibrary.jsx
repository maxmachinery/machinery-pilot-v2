import { useState, useEffect, useRef } from 'react'

const DOC_SLOTS = [
  { type: 'warranty_policy',  label: 'Warranty Policy',  short: 'Policy'  },
  { type: 'portal_structure', label: 'Portal Structure', short: 'Portal'  },
  { type: 'machine_handbook', label: 'Machine Handbook', short: 'Handbook'},
  { type: 'historic_claims',  label: 'Historic Claims',  short: 'Historic'},
]

export default function OEMLibrary({ focusOemId, onStartClaim }) {
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showAdd,    setShowAdd]    = useState(false)
  const [expandedId, setExpandedId] = useState(null) // machineId with detail open

  useEffect(() => { loadLibrary() }, [])

  function loadLibrary() {
    setLoading(true)
    fetch('/api/library')
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function handleDocUploaded() { loadLibrary() }
  function handleDocDeleted()  { loadLibrary() }

  if (loading) return (
    <div className="loader"><div className="spinner" /><div className="loader-title">Loading library…</div></div>
  )

  return (
    <>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <span style={{ fontSize:15, fontWeight:600, color:'var(--navy)' }}>
            {rows.length} machine configuration{rows.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize:13, color:'var(--grey-muted)', marginLeft:12 }}>
            Each row is a unique OEM + Machine combination
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Documents</button>
      </div>

      {rows.length === 0 ? (
        <div className="empty" style={{ background:'var(--white)', borderRadius:10, border:'1px solid var(--grey-border)' }}>
          No documents yet.<br />
          <button className="btn btn-primary" style={{ marginTop:14 }} onClick={() => setShowAdd(true)}>
            Upload first document
          </button>
        </div>
      ) : (
        <div style={{ background:'var(--white)', borderRadius:10, border:'1px solid var(--grey-border)', overflow:'hidden' }}>
          {/* Table header */}
          <div style={{
            display:'grid',
            gridTemplateColumns:'160px 180px repeat(4,1fr) 100px',
            padding:'9px 16px',
            background:'var(--grey-bg)',
            borderBottom:'2px solid var(--grey-border)',
            fontSize:11, fontWeight:700, color:'var(--grey-muted)',
            textTransform:'uppercase', letterSpacing:'.06em',
            gap:8,
          }}>
            <span>OEM</span>
            <span>Machine</span>
            {DOC_SLOTS.map(s => <span key={s.type}>{s.short}</span>)}
            <span></span>
          </div>

          {rows.map((row, i) => {
            const isExpanded = expandedId === row.machineId
            const prevRow    = rows[i - 1]
            const sameOem    = prevRow && prevRow.oemId === row.oemId

            return (
              <div key={row.machineId}>
                {/* Main row */}
                <div
                  style={{
                    display:'grid',
                    gridTemplateColumns:'160px 180px repeat(4,1fr) 100px',
                    padding:'10px 16px',
                    borderBottom: isExpanded ? 'none' : '1px solid var(--grey-border)',
                    alignItems:'center',
                    gap:8,
                    cursor:'pointer',
                    transition:'background .12s',
                    background: isExpanded ? 'rgba(0,180,240,.04)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(0,180,240,.03)' }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                  onClick={() => setExpandedId(isExpanded ? null : row.machineId)}
                >
                  {/* OEM — show name only for first row of each OEM */}
                  <div style={{ fontSize:14, fontWeight:600, color: sameOem ? 'transparent' : 'var(--navy)', userSelect:'none' }}>
                    {sameOem ? '└' : row.oemName}
                  </div>

                  {/* Machine */}
                  <div style={{ fontSize:13, color:'var(--text)', fontWeight:500 }}>
                    {row.machineModel}
                  </div>

                  {/* Doc status cells */}
                  {DOC_SLOTS.map(s => {
                    const doc = (row.documents || []).find(d => d.doc_type === s.type)
                    return (
                      <div key={s.type}>
                        {doc
                          ? <span title={doc.filename} style={{ color:'var(--ok)', fontWeight:700, fontSize:13 }}>✓</span>
                          : <span style={{ color:'var(--grey-border)', fontSize:16 }}>—</span>
                        }
                      </div>
                    )
                  })}

                  {/* Actions */}
                  <div style={{ display:'flex', gap:5 }} onClick={e => e.stopPropagation()}>
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => onStartClaim(row)}
                      title="Start new claim with this machine"
                    >
                      Claim
                    </button>
                  </div>
                </div>

                {/* Expanded detail row */}
                {isExpanded && (
                  <MachineDetailRow
                    row={row}
                    onDocUploaded={handleDocUploaded}
                    onDocDeleted={handleDocDeleted}
                    onClose={() => setExpandedId(null)}
                    onStartClaim={() => onStartClaim(row)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      {rows.length > 0 && (
        <div style={{ marginTop:12, fontSize:12, color:'var(--grey-muted)', display:'flex', gap:16 }}>
          <span><span style={{ color:'var(--ok)', fontWeight:700 }}>✓</span> Document uploaded</span>
          <span><span style={{ color:'var(--grey-border)' }}>—</span> Not uploaded</span>
          <span>Click any row to manage its documents</span>
        </div>
      )}

      {/* Add Documents modal */}
      {showAdd && (
        <AddDocModal
          existingRows={rows}
          onClose={() => setShowAdd(false)}
          onUploaded={() => { loadLibrary(); setShowAdd(false) }}
        />
      )}
    </>
  )
}

// ── Expanded detail row ──────────────────────────────────────────────────────
function MachineDetailRow({ row, onDocUploaded, onDocDeleted, onClose, onStartClaim }) {
  return (
    <div style={{
      background:'var(--grey-bg)',
      borderBottom:'1px solid var(--grey-border)',
      padding:'16px 20px',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <span style={{ fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:18, color:'var(--navy)' }}>
            {row.oemName} — {row.machineModel}
          </span>
          <span style={{ fontSize:12, color:'var(--grey-muted)', marginLeft:10 }}>
            {(row.job_card_fields || []).length} job card fields · {(row.portal_fields || []).length} portal fields
          </span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary btn-sm" onClick={onStartClaim}>Start Claim →</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {DOC_SLOTS.map(slot => {
          const existing = (row.documents || []).find(d => d.doc_type === slot.type)
          return (
            <DocCell
              key={slot.type}
              slot={slot}
              existing={existing}
              oemName={row.oemName}
              machineName={row.machineModel}
              onUploaded={onDocUploaded}
              onDeleted={onDocDeleted}
            />
          )
        })}
      </div>

      {(row.policy_rules || []).length > 0 && (
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--grey-muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>
            Policy Rules ({row.policy_rules.length})
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {row.policy_rules.slice(0, 4).map((r, i) => (
              <div key={i} style={{ fontSize:12, color:'var(--text)', display:'flex', gap:8 }}>
                <span style={{ color:'var(--cyan)', fontWeight:700 }}>•</span>{r}
              </div>
            ))}
            {row.policy_rules.length > 4 && (
              <div style={{ fontSize:12, color:'var(--grey-muted)', fontStyle:'italic' }}>
                + {row.policy_rules.length - 4} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Per-doc slot cell in detail row ─────────────────────────────────────────
function DocCell({ slot, existing, oemName, machineName, onUploaded, onDeleted }) {
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState(null)
  const [drag,      setDrag]      = useState(false)
  const fileRef = useRef()

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') return
    setUploading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      fd.append('oemName',     oemName)
      fd.append('machineName', machineName)
      fd.append('docType',     slot.type)
      const r = await fetch('/api/documents/upload', { method:'POST', body:fd })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed') }
      onUploaded()
    } catch(e) { setError(e.message) }
    finally { setUploading(false) }
  }

  async function handleDelete() {
    if (!existing) return
    await fetch(`/api/documents/${existing.id}`, { method:'DELETE' })
    onDeleted()
  }

  return (
    <div
      style={{
        background: existing ? 'rgba(22,163,74,.06)' : 'var(--white)',
        border: `1.5px ${drag ? 'solid' : 'dashed'} ${existing ? '#86EFAC' : drag ? 'var(--cyan)' : 'var(--grey-border)'}`,
        borderRadius:8, padding:'12px',
        transition:'all .15s',
      }}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
    >
      <input ref={fileRef} type="file" accept="application/pdf" style={{ display:'none' }}
        onChange={e => handleFile(e.target.files[0])} />

      <div style={{ fontWeight:700, fontSize:12, color:'var(--navy)', marginBottom:4 }}>
        {existing ? '✅' : '○'} {slot.label}
      </div>

      {existing ? (
        <div>
          <div style={{ fontSize:11, color:'var(--grey-muted)', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {existing.filename}
          </div>
          <div style={{ fontSize:11, color:'var(--grey-muted)', marginBottom:8 }}>
            {new Date(existing.uploaded_at).toLocaleDateString()}
          </div>
          <div style={{ display:'flex', gap:5 }}>
            <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current.click()}>Replace</button>
            <button className="btn btn-danger btn-xs" onClick={handleDelete}>Delete</button>
          </div>
        </div>
      ) : uploading ? (
        <div style={{ fontSize:12, color:'var(--grey-muted)' }}>
          <div className="spinner" style={{ width:18, height:18, borderWidth:2, display:'inline-block', verticalAlign:'middle', marginRight:6 }} />
          Uploading…
        </div>
      ) : (
        <div>
          <div style={{ fontSize:11, color:'var(--grey-muted)', marginBottom:8, lineHeight:1.4 }}>
            {slot.type === 'warranty_policy'  && 'Rules, claim requirements, pre-auth thresholds'}
            {slot.type === 'portal_structure' && 'Portal field definitions, char limits'}
            {slot.type === 'machine_handbook' && 'Repair procedures, torque specs'}
            {slot.type === 'historic_claims'  && 'Approved claims — teaches tone & detail'}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current.click()}>
            Upload PDF
          </button>
        </div>
      )}
      {error && <div style={{ fontSize:11, color:'var(--crit)', marginTop:5 }}>{error}</div>}
    </div>
  )
}

// ── Add Documents modal ──────────────────────────────────────────────────────
function AddDocModal({ existingRows, onClose, onUploaded }) {
  const [oemName,   setOemName]   = useState('')
  const [machName,  setMachName]  = useState('')
  const [docType,   setDocType]   = useState('warranty_policy')
  const [file,      setFile]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [drag,      setDrag]      = useState(false)
  const fileRef = useRef()

  // Autocomplete options
  const oemOptions     = [...new Set(existingRows.map(r => r.oemName))]
  const machineOptions = existingRows.filter(r => r.oemName.toLowerCase() === oemName.toLowerCase()).map(r => r.machineModel)

  async function handleUpload() {
    if (!oemName || !machName || !file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('pdf',         file)
      fd.append('oemName',     oemName.trim())
      fd.append('machineName', machName.trim())
      fd.append('docType',     docType)
      const r = await fetch('/api/documents/upload', { method:'POST', body:fd })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed') }
      onUploaded()
    } catch(e) {
      setError(e.message); setLoading(false)
    }
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(13,31,60,.55)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:200,
    }}>
      <div style={{ background:'var(--white)', borderRadius:12, padding:28, width:500, maxWidth:'92vw' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ fontSize:20, color:'var(--navy)' }}>Add Documents</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="loader" style={{ padding:'36px 0' }}>
            <div className="spinner" />
            <div className="loader-title">Uploading and extracting…</div>
            <div className="loader-sub">This may take a moment for large PDFs</div>
          </div>
        ) : (
          <>
            {error && <div className="err">{error}</div>}

            <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:18 }}>

              {/* OEM name */}
              <div className="field-group">
                <label className="field-label">OEM / Manufacturer</label>
                <input
                  className="field-input" list="oem-opts"
                  placeholder="e.g. Kubota, John Deere, Caterpillar"
                  value={oemName} onChange={e => setOemName(e.target.value)}
                />
                <datalist id="oem-opts">
                  {oemOptions.map(o => <option key={o} value={o} />)}
                </datalist>
              </div>

              {/* Machine model */}
              <div className="field-group">
                <label className="field-label">Machine Model</label>
                <input
                  className="field-input" list="mach-opts"
                  placeholder="e.g. M7-173, 320GC, D6T"
                  value={machName} onChange={e => setMachName(e.target.value)}
                />
                <datalist id="mach-opts">
                  {machineOptions.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>

              {/* Document type */}
              <div className="field-group">
                <label className="field-label">Document Type</label>
                <select className="field-input" value={docType} onChange={e => setDocType(e.target.value)}>
                  {DOC_SLOTS.map(s => (
                    <option key={s.type} value={s.type}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* File upload */}
              <div className="field-group">
                <label className="field-label">PDF File</label>
                <div
                  className={`drop-zone ${drag ? 'over' : ''}`}
                  style={{ padding:'24px 16px' }}
                  onClick={() => fileRef.current.click()}
                  onDragOver={e => { e.preventDefault(); setDrag(true) }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={e => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0]) }}
                >
                  <input ref={fileRef} type="file" accept="application/pdf"
                    onChange={e => setFile(e.target.files[0])} />
                  <div className="drop-zone-icon" style={{ fontSize:24 }}>📄</div>
                  <div className="drop-zone-title" style={{ fontSize:14 }}>
                    {file ? file.name : 'Drop PDF here or click to browse'}
                  </div>
                  {file && (
                    <div className="drop-zone-sub">{(file.size/1024).toFixed(0)} KB</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!oemName || !machName || !file}
              >
                Upload &amp; Extract →
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
