import { useState, useRef } from 'react'

export default function JobCardUpload({ oemConfig, onDone, onBack }) {
  const [file,     setFile]     = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [phase,    setPhase]    = useState('idle') // idle | extracting | enriching
  const [error,    setError]    = useState(null)
  const fileRef = useRef()

  async function handleProcess() {
    if (!file) return
    setError(null)

    try {
      // ── Phase 1: extract fields ────────────────────────────────
      setPhase('extracting')
      const fd = new FormData()
      fd.append('pdf', file)
      fd.append('oemConfigId', oemConfig.id)

      const r1 = await fetch('/api/jobcard/upload', { method: 'POST', body: fd })
      if (!r1.ok) { const e = await r1.json(); throw new Error(e.error || 'Extraction failed') }
      const { sessionId } = await r1.json()

      // ── Phase 2: enrich ────────────────────────────────────────
      setPhase('enriching')
      const r2 = await fetch(`/api/jobcard/enrich/${sessionId}`, { method: 'POST' })
      if (!r2.ok) { const e = await r2.json(); throw new Error(e.error || 'Enrichment failed') }

      // ── Fetch full session ─────────────────────────────────────
      const r3 = await fetch(`/api/session/${sessionId}`)
      const sessionData = await r3.json()

      onDone(sessionId, sessionData)
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') setFile(f)
  }

  if (phase === 'extracting') return (
    <div className="loader">
      <div className="spinner" />
      <div className="loader-title">Extracting job card fields…</div>
      <div className="loader-sub">Reading values against {oemConfig.name} field definitions</div>
    </div>
  )

  if (phase === 'enriching') return (
    <div className="loader">
      <div className="spinner" />
      <div className="loader-title">Enriching fields against policy…</div>
      <div className="loader-sub">Assessing each field for compliance and completeness</div>
    </div>
  )

  return (
    <div className="card">
      <div style={{marginBottom:18}}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back to OEM Config</button>
      </div>

      <div className="card-head">
        <h2 className="card-title">Step 2 — Job Card Upload</h2>
        <p className="card-subtitle">
          Upload the engineer's job card PDF for <strong>{oemConfig.name}</strong>.
          Fields will be extracted and enriched against the warranty policy automatically.
        </p>
      </div>

      {error && <div className="err">{error}</div>}

      <div
        className={`drop-zone ${dragOver ? 'over' : ''}`}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input ref={fileRef} type="file" accept="application/pdf"
          onChange={e => setFile(e.target.files[0])} />
        <div className="drop-zone-icon">📋</div>
        <div className="drop-zone-title">{file ? file.name : 'Drop engineer job card PDF here'}</div>
        <div className="drop-zone-sub">
          {file ? `${(file.size/1024).toFixed(0)} KB — click to change` : 'or click to browse · PDF only'}
        </div>
      </div>

      {file && (
        <div style={{marginTop:16,display:'flex',gap:8}}>
          <button className="btn btn-primary" onClick={handleProcess}>Extract &amp; Enrich →</button>
          <button className="btn btn-ghost" onClick={() => setFile(null)}>Clear</button>
        </div>
      )}

      <div className="divider" />
      <div style={{background:'var(--grey-bg)',borderRadius:8,padding:'14px 18px'}}>
        <div style={{fontWeight:600,color:'var(--navy)',marginBottom:4}}>{oemConfig.name}</div>
        <div style={{fontSize:13,color:'var(--grey-muted)'}}>
          {(oemConfig.job_card_fields||[]).length} fields to extract ·{' '}
          {(oemConfig.portal_fields||[]).length} portal fields ·{' '}
          {(oemConfig.policy_rules||[]).length} policy rules
        </div>
      </div>
    </div>
  )
}
