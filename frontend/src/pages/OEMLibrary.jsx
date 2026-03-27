import { useState, useEffect, useRef } from 'react'

const DOC_SLOTS = [
  { type: 'warranty_policy',  icon: '📋', label: 'Warranty Policy',    desc: 'Rules, claim requirements, pre-auth thresholds' },
  { type: 'portal_structure', icon: '🔧', label: 'Portal Structure',   desc: 'Portal field definitions, char limits, required fields' },
  { type: 'machine_handbook', icon: '📖', label: 'Machine Handbook',   desc: 'Repair procedures, torque specs, removal steps' },
  { type: 'historic_claims',  icon: '✅', label: 'Historic Claims',    desc: 'Previously approved claims — teaches tone and detail' },
]

export default function OEMLibrary({ focusOemId, onStartClaim }) {
  const [configs,    setConfigs]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null) // OEM in detail view
  const [showAdd,    setShowAdd]    = useState(false)

  useEffect(() => {
    loadConfigs()
  }, [])

  useEffect(() => {
    if (focusOemId && configs.length) {
      const found = configs.find(c => c.id === focusOemId)
      if (found) setSelected(found)
    }
  }, [focusOemId, configs])

  function loadConfigs() {
    setLoading(true)
    fetch('/api/oem/configs')
      .then(r => r.json())
      .then(data => { setConfigs(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  async function refreshSelected(id) {
    const r = await fetch(`/api/oem/${id}`)
    const data = await r.json()
    setSelected(data)
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, documents: data.documents } : c))
  }

  const isFullyConfigured = (cfg) =>
    DOC_SLOTS.every(s => (cfg.documents || []).some(d => d.doc_type === s.type))

  if (loading) return (
    <div className="loader"><div className="spinner" /><div className="loader-title">Loading OEM library…</div></div>
  )

  if (selected) {
    return (
      <OEMDetailView
        oem={selected}
        onBack={() => setSelected(null)}
        onRefresh={() => refreshSelected(selected.id)}
        onStartClaim={() => onStartClaim(selected)}
      />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, color: 'var(--navy)', fontFamily: 'Barlow, sans-serif', fontWeight: 600 }}>
            {configs.length} OEM configuration{configs.length !== 1 ? 's' : ''}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--grey-muted)' }}>
            Each OEM can have up to 4 reference documents. More documents = better enrichment.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add OEM</button>
      </div>

      {configs.length === 0 ? (
        <div className="empty">
          No OEM configurations yet.<br />
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setShowAdd(true)}>
            Upload Warranty Policy to get started
          </button>
        </div>
      ) : (
        <div className="oem-grid">
          {configs.map(cfg => (
            <OEMCard
              key={cfg.id}
              cfg={cfg}
              isFull={isFullyConfigured(cfg)}
              onClick={() => setSelected(cfg)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddOEMModal
          onClose={() => setShowAdd(false)}
          onAdded={(cfg) => {
            setConfigs(prev => [cfg, ...prev])
            setShowAdd(false)
            setSelected(cfg)
          }}
        />
      )}
    </>
  )
}

function OEMCard({ cfg, isFull, onClick }) {
  const docs     = cfg.documents || []
  const initials = cfg.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div className="oem-card" onClick={onClick}>
      <div className="oem-card-head">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div className="oem-logo-placeholder">{initials}</div>
          <div>
            <div className="oem-card-name">{cfg.name}</div>
            {cfg.brand && cfg.brand !== cfg.name &&
              <div className="oem-card-brand">{cfg.brand}</div>}
          </div>
        </div>
        <span className={isFull ? 'oem-badge-full' : 'oem-badge-part'}>
          {isFull ? '✓ Fully set up' : `${docs.length}/4 docs`}
        </span>
      </div>

      <div className="oem-doc-status">
        {DOC_SLOTS.map(s => {
          const present = docs.some(d => d.doc_type === s.type)
          return (
            <div key={s.type} className={`doc-chip ${present ? 'present' : 'missing'}`}>
              {s.icon} {present ? s.label : s.label}
            </div>
          )
        })}
      </div>

      <div className="oem-card-stats">
        {(cfg.job_card_fields || []).length} job card fields ·{' '}
        {(cfg.portal_fields || []).length} portal fields ·{' '}
        {(cfg.policy_rules || []).length} rules
      </div>
    </div>
  )
}

function OEMDetailView({ oem, onBack, onRefresh, onStartClaim }) {
  const docs = oem.documents || []

  return (
    <>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Library</button>
        <div>
          <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--navy)' }}>
            {oem.name}
          </span>
          {oem.brand && oem.brand !== oem.name &&
            <span style={{ fontSize: 13, color: 'var(--grey-muted)', marginLeft: 10 }}>{oem.brand}</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={onStartClaim}>Start New Claim →</button>
        </div>
      </div>

      <div className="card">
        <h3 className="sec-title" style={{ marginBottom: 14 }}>Reference Documents</h3>
        <div className="doc-slots">
          {DOC_SLOTS.map(slot => {
            const existing = docs.find(d => d.doc_type === slot.type)
            return (
              <DocSlot
                key={slot.type}
                slot={slot}
                existing={existing}
                oemId={oem.id}
                onUploaded={onRefresh}
                onDeleted={onRefresh}
              />
            )
          })}
        </div>
      </div>

      {/* Config preview */}
      {(oem.job_card_fields || []).length > 0 && (
        <div className="card">
          <h3 className="sec-title">Job Card Fields ({oem.job_card_fields.length})</h3>
          <div className="fgrid">
            <div className="frow head"><span>Field</span><span>Description</span><span>Required</span></div>
            {oem.job_card_fields.map(f => (
              <div key={f.fieldId} className="frow">
                <span className="fname">{f.name}</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{f.description || '—'}</span>
                <span className={`req-badge ${f.required ? 'y' : 'n'}`}>{f.required ? 'Yes' : 'Optional'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(oem.portal_fields || []).length > 0 && (
        <div className="card">
          <h3 className="sec-title">Portal Fields ({oem.portal_fields.length})</h3>
          <div className="fgrid">
            <div className="frow head"><span>Field</span><span>Description</span><span>Max chars</span></div>
            {oem.portal_fields.map(f => (
              <div key={f.fieldId} className="frow">
                <span className="fname">{f.name || f.fieldId}</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{f.description || '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--grey-muted)' }}>{f.maxChars || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(oem.policy_rules || []).length > 0 && (
        <div className="card">
          <h3 className="sec-title">Policy Rules ({oem.policy_rules.length})</h3>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {oem.policy_rules.map((r, i) => (
              <li key={i} style={{ display: 'flex', gap: 9, fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--cyan)', fontWeight: 700, flexShrink: 0 }}>•</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function DocSlot({ slot, existing, oemId, onUploaded, onDeleted }) {
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState(null)
  const [dragOver,  setDragOver]  = useState(false)
  const fileRef = useRef()

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') return
    setUploading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      fd.append('docType', slot.type)
      const r = await fetch(`/api/oem/${oemId}/documents`, { method: 'POST', body: fd })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed') }
      onUploaded()
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!existing) return
    await fetch(`/api/oem/documents/${existing.id}`, { method: 'DELETE' })
    onDeleted()
  }

  if (uploading) return (
    <div className={`doc-slot`} style={{ opacity: .7 }}>
      <span className="doc-slot-icon">{slot.icon}</span>
      <div className="doc-slot-info">
        <div className="doc-slot-title">{slot.label}</div>
        <div className="doc-slot-sub">Uploading and extracting content…</div>
      </div>
      <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
    </div>
  )

  return (
    <div
      className={`doc-slot ${existing ? 'uploaded' : ''} ${dragOver ? 'over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
    >
      <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])} />
      <span className="doc-slot-icon">{existing ? '✅' : slot.icon}</span>
      <div className="doc-slot-info">
        <div className="doc-slot-title">{slot.label}</div>
        <div className="doc-slot-sub">
          {existing
            ? `${existing.filename} · ${new Date(existing.uploaded_at).toLocaleDateString()}`
            : slot.desc}
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--crit)', marginTop: 3 }}>{error}</div>}
      </div>
      <div className="doc-slot-actions">
        <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current.click()}>
          {existing ? 'Replace' : 'Upload'}
        </button>
        {existing && (
          <button className="btn btn-danger btn-xs" onClick={handleDelete}>Delete</button>
        )}
      </div>
    </div>
  )
}

function AddOEMModal({ onClose, onAdded }) {
  const [file,     setFile]    = useState(null)
  const [dragOver, setDragOver]= useState(false)
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState(null)
  const fileRef = useRef()

  async function handleUpload() {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      const r = await fetch('/api/oem/upload', { method: 'POST', body: fd })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed') }
      const data = await r.json()
      onAdded(data)
    } catch (e) {
      setError(e.message); setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(13,31,60,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{ background: 'var(--white)', borderRadius: 12, padding: 28, width: 480, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, color: 'var(--navy)' }}>Add OEM Configuration</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="loader" style={{ padding: '36px 0' }}>
            <div className="spinner" />
            <div className="loader-title">Parsing warranty policy…</div>
            <div className="loader-sub">Extracting rules, fields, and portal structure</div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--grey-muted)', marginBottom: 16 }}>
              Upload the OEM warranty policy PDF. We'll automatically extract the OEM name, policy rules, job card fields, and portal field structure.
            </p>
            {error && <div className="err">{error}</div>}
            <div
              className={`drop-zone ${dragOver ? 'over' : ''}`}
              onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); setFile(e.dataTransfer.files[0]) }}
            >
              <input ref={fileRef} type="file" accept="application/pdf"
                onChange={e => setFile(e.target.files[0])} />
              <div className="drop-zone-icon">📄</div>
              <div className="drop-zone-title">{file ? file.name : 'Drop warranty policy PDF here'}</div>
              <div className="drop-zone-sub">{file ? `${(file.size/1024).toFixed(0)} KB` : 'or click to browse'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleUpload} disabled={!file}>
                Parse &amp; Create OEM →
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
