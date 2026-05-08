import { useState, useEffect, useRef, useCallback } from 'react'

function fileIcon(filename) {
  if (!filename) return '📎'
  const ext = filename.split('.').pop().toLowerCase()
  if (ext === 'pdf') return '📄'
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'].includes(ext)) return '🖼'
  if (['txt', 'md', 'csv'].includes(ext)) return '📃'
  return '📎'
}

const DOC_SLOTS = [
  { type: 'warranty_policy',   label: 'Warranty Policy',   short: 'Policy'   },
  { type: 'portal_structure',  label: 'Portal Structure',  short: 'Portal'   },
  { type: 'technical_manual',  label: 'Technical Manual',  short: 'Manual'   },
  { type: 'warranty_schedule', label: 'Warranty Schedule', short: 'Schedule' },
  { type: 'historic_claims',   label: 'Historic Claims',   short: 'Historic' },
]

export default function OEMLibrary({ focusOemId, onStartClaim }) {
  const [rows,              setRows]              = useState([])
  const [loading,           setLoading]           = useState(true)
  const [showAdd,           setShowAdd]           = useState(false)
  const [expandedId,        setExpandedId]        = useState(null) // rowKey with detail open
  const [schemaModalOemId,  setSchemaModalOemId]  = useState(null)

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
            gridTemplateColumns:'160px 180px repeat(5,1fr) 100px',
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
            const isExpanded = expandedId === row.rowKey
            const prevRow    = rows[i - 1]
            const sameOem    = prevRow && prevRow.oemId === row.oemId

            return (
              <div key={row.rowKey}>
                {/* Main row */}
                <div
                  style={{
                    display:'grid',
                    gridTemplateColumns:'160px 180px repeat(5,1fr) 100px',
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
                  onClick={() => setExpandedId(isExpanded ? null : row.rowKey)}
                >
                  {/* OEM — show name only for first row of each OEM */}
                  <div style={{ fontSize:14, fontWeight:600, color: sameOem ? 'transparent' : 'var(--navy)', userSelect:'none' }}>
                    {sameOem ? '└' : row.oemName}
                  </div>

                  {/* Machine */}
                  <div style={{ fontSize:13, fontWeight:500 }}>
                    {row.isOemWide
                      ? <span style={{ color:'var(--grey-muted)', fontStyle:'italic' }}>OEM-wide</span>
                      : <span style={{ color:'var(--text)' }}>{row.machineModel}</span>
                    }
                  </div>

                  {/* Doc status cells */}
                  {DOC_SLOTS.map(s => {
                    const doc = (row.documents || []).find(d => d.doc_type === s.type)
                    return (
                      <div key={s.type}>
                        {doc
                          ? <span title={doc.filename} style={{ color:'var(--ok)', fontWeight:700, fontSize:13 }}>{fileIcon(doc.filename)} ✓</span>
                          : <span style={{ color:'var(--grey-border)', fontSize:16 }}>—</span>
                        }
                      </div>
                    )
                  })}

                  {/* Actions */}
                  <div style={{ display:'flex', gap:5 }} onClick={e => e.stopPropagation()}>
                    {!row.isOemWide && (
                      <button
                        className="btn btn-primary btn-xs"
                        onClick={() => onStartClaim(row)}
                        title="Start new claim with this machine"
                      >
                        Claim
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded detail row */}
                {isExpanded && (
                  <MachineDetailRow
                    row={row}
                    onDocUploaded={handleDocUploaded}
                    onDocDeleted={handleDocDeleted}
                    onClose={() => setExpandedId(null)}
                    onStartClaim={row.isOemWide ? null : () => onStartClaim(row)}
                    onGenerateSchema={() => setSchemaModalOemId(row.oemId)}
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

      {/* Generate Portal Schema modal */}
      {schemaModalOemId && (
        <GenerateSchemaModal
          oemId={schemaModalOemId}
          onClose={() => { setSchemaModalOemId(null); loadLibrary() }}
        />
      )}
    </>
  )
}

// ── Expanded detail row ──────────────────────────────────────────────────────
function MachineDetailRow({ row, onDocUploaded, onDocDeleted, onClose, onStartClaim, onGenerateSchema }) {
  const portalFields = row.portal_fields || []
  const hasSchema = portalFields.length > 0

  return (
    <div style={{
      background:'var(--grey-bg)',
      borderBottom:'1px solid var(--grey-border)',
      padding:'16px 20px',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <span style={{ fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:18, color:'var(--navy)' }}>
            {row.isOemWide ? `${row.oemName} — OEM-wide` : `${row.oemName} — ${row.machineModel}`}
          </span>
          <span style={{ fontSize:12, color:'var(--grey-muted)', marginLeft:10 }}>
            {(row.job_card_fields || []).length} job card fields · {portalFields.length} portal fields
          </span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {onStartClaim && <button className="btn btn-primary btn-sm" onClick={onStartClaim}>Start Claim →</button>}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
        {DOC_SLOTS.map(slot => {
          const existing = (row.documents || []).find(d => d.doc_type === slot.type)
          return (
            <DocCell
              key={slot.type}
              slot={slot}
              existing={existing}
              oemName={row.oemName}
              machineName={row.isOemWide ? '' : row.machineModel}
              onUploaded={onDocUploaded}
              onDeleted={onDocDeleted}
            />
          )
        })}
      </div>

      {/* Portal Schema section */}
      <div style={{ marginTop:16, background:'var(--white)', borderRadius:8, border:'1.5px solid var(--grey-border)', padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--navy)', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Portal Schema
            </span>
            <span style={{ marginLeft:10 }}>
              {hasSchema ? (
                <span style={{ fontSize:11, fontWeight:700, color:'var(--ok)', background:'var(--ok-bg)', border:'1px solid var(--ok-ring)', padding:'2px 8px', borderRadius:12 }}>
                  Schema defined ({portalFields.length} fields)
                </span>
              ) : (
                <span style={{ fontSize:11, fontWeight:700, color:'var(--grey-muted)', background:'var(--grey-bg)', border:'1px solid var(--grey-border)', padding:'2px 8px', borderRadius:12 }}>
                  No schema
                </span>
              )}
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onGenerateSchema}>
            Generate Schema from Screenshot
          </button>
        </div>
        {hasSchema && (
          <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Field ID', 'Name', 'Section'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'4px 8px', fontSize:11, fontWeight:700, color:'var(--grey-muted)', textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid var(--grey-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portalFields.slice(0, 5).map(f => (
                <tr key={f.fieldId}>
                  <td style={{ padding:'4px 8px', color:'var(--navy)', fontFamily:'monospace', fontSize:11 }}>{f.fieldId}</td>
                  <td style={{ padding:'4px 8px', color:'var(--text)' }}>{f.name}</td>
                  <td style={{ padding:'4px 8px', color:'var(--grey-muted)' }}>{f.section}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {portalFields.length > 5 && (
          <div style={{ fontSize:11, color:'var(--grey-muted)', fontStyle:'italic', marginTop:6, paddingLeft:8 }}>
            …and {portalFields.length - 5} more field{portalFields.length - 5 !== 1 ? 's' : ''}
          </div>
        )}
        {!hasSchema && (
          <div style={{ fontSize:12, color:'var(--grey-muted)', marginTop:4 }}>
            Upload a screenshot of the OEM portal claim form to auto-generate the field schema.
          </div>
        )}
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
    if (!file) return
    setUploading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('oemName',     oemName)
      fd.append('machineName', machineName)
      fd.append('docType',     slot.type)
      const r = await fetch('/api/documents/upload', { method:'POST', body:fd })
      if (!r.ok) {
        const text = await r.text()
        let msg = `Upload failed (${r.status})`
        try { msg = JSON.parse(text).error || msg } catch { msg = `${msg}: ${text.slice(0, 200)}` }
        throw new Error(msg)
      }
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
      <input ref={fileRef} type="file" accept="*/*" style={{ display:'none' }}
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
            {slot.type === 'technical_manual'  && 'Repair procedures, torque specs'}
            {slot.type === 'warranty_schedule' && 'Per-time labour operations and reimbursement rates'}
            {slot.type === 'historic_claims'   && 'Approved claims — teaches tone & detail'}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current.click()}>
            Upload File
          </button>
        </div>
      )}
      {error && <div style={{ fontSize:11, color:'var(--crit)', marginTop:5 }}>{error}</div>}
    </div>
  )
}

// ── Add Documents modal ──────────────────────────────────────────────────────
function AddDocModal({ existingRows, onClose, onUploaded }) {
  const [oemName,     setOemName]     = useState('')
  const [machName,    setMachName]    = useState('')
  const [docType,     setDocType]     = useState('warranty_policy')
  const [file,        setFile]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [drag,        setDrag]        = useState(false)
  const fileRef = useRef()

  // Autocomplete options
  const oemOptions     = [...new Set(existingRows.map(r => r.oemName))]
  const machineOptions = existingRows.filter(r => r.oemName.toLowerCase() === oemName.toLowerCase()).map(r => r.machineModel)

  async function handleUpload() {
    const errs = {}
    if (!oemName.trim()) errs.oemName = 'OEM is required'
    if (!file)           errs.file    = 'File is required'
    if (Object.keys(errs).length) { setFieldErrors(errs); return }
    setFieldErrors({})
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file',        file)
      fd.append('oemName',     oemName.trim())
      fd.append('machineName', machName.trim())
      fd.append('docType',     docType)
      const r = await fetch('/api/documents/upload', { method:'POST', body:fd })
      if (!r.ok) {
        const text = await r.text()
        let msg = `Upload failed (${r.status})`
        try { msg = JSON.parse(text).error || msg } catch { msg = `${msg}: ${text.slice(0, 200)}` }
        throw new Error(msg)
      }
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
                <label className="field-label">OEM / Manufacturer <span style={{ color:'var(--crit)' }}>*</span></label>
                <input
                  className="field-input" list="oem-opts"
                  placeholder="e.g. Kubota, John Deere, Caterpillar"
                  value={oemName} onChange={e => { setOemName(e.target.value); setFieldErrors(fe => ({ ...fe, oemName: null })) }}
                  style={fieldErrors.oemName ? { borderColor:'var(--crit)' } : {}}
                />
                <datalist id="oem-opts">
                  {oemOptions.map(o => <option key={o} value={o} />)}
                </datalist>
                {fieldErrors.oemName && <div style={{ fontSize:12, color:'var(--crit)', marginTop:4 }}>{fieldErrors.oemName}</div>}
              </div>

              {/* Machine model — optional */}
              <div className="field-group">
                <label className="field-label">Machine Model <span style={{ color:'var(--grey-muted)', fontWeight:400 }}>(optional)</span></label>
                <input
                  className="field-input" list="mach-opts"
                  placeholder="Leave blank for OEM-wide documents (e.g. general warranty policy)"
                  value={machName} onChange={e => setMachName(e.target.value)}
                />
                <datalist id="mach-opts">
                  {machineOptions.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>

              {/* Document type */}
              <div className="field-group">
                <label className="field-label">Document Type <span style={{ color:'var(--crit)' }}>*</span></label>
                <select className="field-input" value={docType} onChange={e => setDocType(e.target.value)}>
                  {DOC_SLOTS.map(s => (
                    <option key={s.type} value={s.type}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* File upload */}
              <div className="field-group">
                <label className="field-label">File <span style={{ color:'var(--crit)' }}>*</span></label>
                <div
                  className={`drop-zone ${drag ? 'over' : ''}`}
                  style={{ padding:'24px 16px', ...(fieldErrors.file ? { borderColor:'var(--crit)' } : {}) }}
                  onClick={() => fileRef.current.click()}
                  onDragOver={e => { e.preventDefault(); setDrag(true) }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; setFile(f); setFieldErrors(fe => ({ ...fe, file: null })) }}
                >
                  <input ref={fileRef} type="file" accept="*/*"
                    onChange={e => { setFile(e.target.files[0]); setFieldErrors(fe => ({ ...fe, file: null })) }} />
                  <div className="drop-zone-icon" style={{ fontSize:24 }}>{file ? fileIcon(file.name) : '📎'}</div>
                  <div className="drop-zone-title" style={{ fontSize:14 }}>
                    {file ? file.name : 'Any file type · click or drop'}
                  </div>
                  {file && (
                    <div className="drop-zone-sub">{(file.size/1024).toFixed(0)} KB</div>
                  )}
                </div>
                {fieldErrors.file && <div style={{ fontSize:12, color:'var(--crit)', marginTop:4 }}>{fieldErrors.file}</div>}
              </div>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!oemName || !file}
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

// ── Generate Portal Schema modal ─────────────────────────────────────────────
function GenerateSchemaModal({ oemId, onClose }) {
  const [file,       setFile]       = useState(null)
  const [notes,      setNotes]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [fields,     setFields]     = useState(null) // generated fields preview
  const fileRef = useRef()

  async function generate() {
    if (!file) return setError('Please select a screenshot file')
    setLoading(true)
    setError(null)
    setFields(null)
    try {
      const fd = new FormData()
      fd.append('screenshot', file)
      if (notes.trim()) fd.append('notes', notes.trim())
      const r = await fetch(`/api/oem/${oemId}/generate-portal-schema`, { method: 'POST', body: fd })
      if (!r.ok) {
        const e = await r.json()
        throw new Error(e.error || 'Generation failed')
      }
      const data = await r.json()
      setFields(data.fields || [])
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    onClose()
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(13,31,60,.55)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:300,
    }}>
      <div style={{ background:'var(--white)', borderRadius:12, padding:28, width:600, maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontSize:18, color:'var(--navy)', margin:0, fontFamily:'Barlow, sans-serif' }}>Generate Portal Schema</h3>
          <button className="btn btn-ghost btn-sm" onClick={handleClose}>✕</button>
        </div>
        <p style={{ fontSize:13, color:'var(--grey-muted)', marginBottom:18, lineHeight:1.5 }}>
          Upload a screenshot of the OEM portal claim form. The AI will identify all input fields.
        </p>

        {error && <div className="err" style={{ marginBottom:14 }}>{error}</div>}

        {loading ? (
          <div className="loader" style={{ padding:'40px 0' }}>
            <div className="spinner" />
            <div className="loader-title">Analysing portal screenshot…</div>
            <div className="loader-sub">This may take 15–30 seconds</div>
          </div>
        ) : fields !== null ? (
          <>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--ok)', marginBottom:8 }}>
                {fields.length} field{fields.length !== 1 ? 's' : ''} identified and saved
              </div>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['Field ID', 'Name', 'Section', 'Required', 'Type'].map(h => (
                      <th key={h} style={{ textAlign:'left', padding:'5px 8px', fontSize:11, fontWeight:700, color:'var(--grey-muted)', textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'2px solid var(--grey-border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map(f => (
                    <tr key={f.fieldId}>
                      <td style={{ padding:'5px 8px', fontFamily:'monospace', fontSize:11, color:'var(--navy)' }}>{f.fieldId}</td>
                      <td style={{ padding:'5px 8px', color:'var(--text)' }}>{f.name}</td>
                      <td style={{ padding:'5px 8px', color:'var(--grey-muted)' }}>{f.section}</td>
                      <td style={{ padding:'5px 8px', color: f.required ? 'var(--crit)' : 'var(--grey-muted)' }}>{f.required ? 'Yes' : 'No'}</td>
                      <td style={{ padding:'5px 8px', color:'var(--grey-muted)' }}>{f.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={handleClose}>Save & Close</button>
              <button className="btn btn-ghost" onClick={() => { setFields(null); setFile(null) }}>Re-run</button>
            </div>
          </>
        ) : (
          <>
            <div className="field-group" style={{ marginBottom:14 }}>
              <label className="field-label">Screenshot <span style={{ color:'var(--crit)' }}>*</span></label>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  style={{ display:'none' }}
                  onChange={e => { setFile(e.target.files[0]); setError(null) }}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}>
                  {file ? '📷 Change screenshot' : '📷 Select screenshot'}
                </button>
                {file && <span style={{ fontSize:12, color:'var(--grey-muted)' }}>{file.name}</span>}
              </div>
            </div>
            <div className="field-group" style={{ marginBottom:18 }}>
              <label className="field-label">Additional instructions <span style={{ color:'var(--grey-muted)', fontWeight:400 }}>(optional)</span></label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. 'Include only the Details tab'"
                style={{
                  width:'100%', minHeight:60, padding:'10px 12px',
                  border:'1.5px solid var(--grey-border)', borderRadius:6,
                  fontSize:13, lineHeight:1.5, resize:'vertical',
                  outline:'none', boxSizing:'border-box', color:'var(--text)',
                }}
              />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={generate} disabled={!file}>Generate</button>
              <button className="btn btn-ghost" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
