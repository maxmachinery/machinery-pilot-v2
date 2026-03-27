import { useState, useRef } from 'react'
import ReviewStep from '../components/ReviewStep.jsx'
import ExportStep from '../components/ExportStep.jsx'

const STEPS = [
  { n: 1, label: 'Select OEM' },
  { n: 2, label: 'Job Card' },
  { n: 3, label: 'Review' },
  { n: 4, label: 'Export' },
]

export default function NewClaim({ initialOem, onOemChange }) {
  const [step,        setStep]        = useState(initialOem ? 2 : 1)
  const [oemConfig,   setOemConfig]   = useState(initialOem || null)
  const [sessionId,   setSessionId]   = useState(null)
  const [sessionData, setSessionData] = useState(null)

  function handleOemSelected(oem) {
    setOemConfig(oem)
    onOemChange?.(oem)
    setStep(2)
  }

  function handleJobCardDone(id, data) {
    setSessionId(id)
    setSessionData(data)
    setStep(3)
  }

  function handleReviewDone(updated) {
    setSessionData(updated)
    setStep(4)
  }

  function handleReset() {
    setStep(initialOem ? 2 : 1)
    setOemConfig(initialOem || null)
    setSessionId(null)
    setSessionData(null)
  }

  return (
    <div className="claim-layout">
      {/* Step rail */}
      <div className="step-rail">
        <div className="card" style={{ padding: '16px 14px' }}>
          {STEPS.map((s, i) => (
            <div key={s.n}>
              <div className={`step-rail-item ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}>
                <div className={`step-num ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}>
                  {step > s.n ? '✓' : s.n}
                </div>
                {s.label}
              </div>
              {i < STEPS.length - 1 && <div className="step-rail-line" />}
            </div>
          ))}
          {oemConfig && (
            <>
              <div className="divider" style={{ margin: '14px 0' }} />
              <div style={{ fontSize: 11, color: 'var(--grey-muted)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, marginBottom: 5 }}>
                OEM Config
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{oemConfig.name}</div>
              <div style={{ fontSize: 11, color: 'var(--grey-muted)', marginTop: 2 }}>
                {(oemConfig.job_card_fields || oemConfig.job_card_fields)?.length || 0} fields
              </div>
            </>
          )}
        </div>
      </div>

      {/* Step content */}
      <div>
        {step === 1 && <StepSelectOEM onSelect={handleOemSelected} />}
        {step === 2 && (
          <StepJobCard
            oemConfig={oemConfig}
            onDone={handleJobCardDone}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <ReviewStep
            sessionId={sessionId}
            sessionData={sessionData}
            onDone={handleReviewDone}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <ExportStep
            sessionId={sessionId}
            sessionData={sessionData}
            oemConfig={oemConfig}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}

// ── Step 1: Select OEM ───────────────────────────────────────────────────────

function StepSelectOEM({ onSelect }) {
  const [configs,  setConfigs]  = useState(null)
  const [selected, setSelected] = useState(null)

  useState(() => {
    fetch('/api/oem/configs')
      .then(r => r.json())
      .then(setConfigs)
  })

  const DOC_TYPES = ['warranty_policy', 'portal_structure', 'machine_handbook', 'historic_claims']
  const completeness = (cfg) => {
    const docs = cfg.documents || []
    const count = DOC_TYPES.filter(t => docs.some(d => d.doc_type === t)).length
    return { count, full: count === 4 }
  }

  if (!configs) return <div className="loader"><div className="spinner" /></div>

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">Select OEM Configuration</h2>
        <p className="card-subtitle">Choose the OEM whose warranty policy and documents this claim is against</p>
      </div>

      {configs.length === 0 ? (
        <div className="empty">
          No OEM configurations found.<br />
          <span style={{ fontSize: 13 }}>Go to OEM Library and add an OEM first.</span>
        </div>
      ) : (
        <>
          <div className="cfg-list">
            {configs.map(cfg => {
              const { count, full } = completeness(cfg)
              return (
                <div
                  key={cfg.id}
                  className={`cfg-item ${selected?.id === cfg.id ? 'sel' : ''}`}
                  onClick={() => setSelected(cfg)}
                >
                  <div>
                    <div className="cfg-item-name">{cfg.name}</div>
                    <div className="cfg-item-meta">
                      {cfg.brand && cfg.brand !== cfg.name ? `${cfg.brand} · ` : ''}
                      {count}/4 documents ·{' '}
                      {(cfg.job_card_fields || []).length} job card fields
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {!full && (
                      <span style={{ fontSize: 11, color: 'var(--warn)' }}>⚠ Partial setup</span>
                    )}
                    {selected?.id === cfg.id && <span className="cfg-sel-badge">Selected</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {selected && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => onSelect(selected)}>
                Use {selected.name} — Upload Job Card →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Step 2: Job Card Upload ───────────────────────────────────────────────────

function StepJobCard({ oemConfig, onDone, onBack }) {
  const [file,     setFile]    = useState(null)
  const [dragOver, setDragOver]= useState(false)
  const [phase,    setPhase]   = useState('idle')
  const [error,    setError]   = useState(null)
  const [jobRef,   setJobRef]  = useState('')
  const [machine,  setMachine] = useState('')
  const [engineer, setEngineer]= useState('')
  const fileRef = useRef()

  async function handleProcess() {
    if (!file) return
    setError(null)
    try {
      setPhase('extracting')
      const fd = new FormData()
      fd.append('pdf', file)
      fd.append('oemConfigId', oemConfig.id)
      if (jobRef)   fd.append('jobRef',   jobRef)
      if (machine)  fd.append('machine',  machine)
      if (engineer) fd.append('engineer', engineer)

      const r1 = await fetch('/api/jobcard/upload', { method: 'POST', body: fd })
      if (!r1.ok) { const e = await r1.json(); throw new Error(e.error || 'Extraction failed') }
      const { sessionId, transcriptionMethod } = await r1.json()

      setPhase('enriching')
      const r2 = await fetch(`/api/jobcard/enrich/${sessionId}`, { method: 'POST' })
      if (!r2.ok) { const e = await r2.json(); throw new Error(e.error || 'Enrichment failed') }

      const r3 = await fetch(`/api/session/${sessionId}`)
      const sessionData = await r3.json()

      if (transcriptionMethod === 'vision') {
        sessionData._transcriptionMethod = 'vision'
      }

      onDone(sessionId, sessionData)
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  if (phase === 'extracting') return (
    <div className="loader">
      <div className="spinner" />
      <div className="loader-title">Extracting job card fields…</div>
      <div className="loader-sub">Detecting content type and reading field values</div>
    </div>
  )
  if (phase === 'enriching') return (
    <div className="loader">
      <div className="spinner" />
      <div className="loader-title">Enriching fields against policy…</div>
      <div className="loader-sub">Using all {oemConfig.name} reference documents</div>
    </div>
  )

  return (
    <div className="card">
      <div style={{ marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Change OEM</button>
      </div>
      <div className="card-head">
        <h2 className="card-title">Upload Job Card</h2>
        <p className="card-subtitle">
          Upload the engineer's job card for <strong>{oemConfig.name}</strong>.
          Handwritten and scanned documents are supported via vision processing.
        </p>
      </div>

      {error && <div className="err">{error}</div>}

      {/* Optional metadata */}
      <div className="meta-grid" style={{ marginBottom: 18 }}>
        <div className="field-group">
          <label className="field-label">Job Reference</label>
          <input className="field-input" placeholder="e.g. JC-2024-0042" value={jobRef} onChange={e => setJobRef(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Machine / Unit</label>
          <input className="field-input" placeholder="e.g. 320GC Excavator" value={machine} onChange={e => setMachine(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Engineer</label>
          <input className="field-input" placeholder="e.g. J. Smith" value={engineer} onChange={e => setEngineer(e.target.value)} />
        </div>
      </div>

      <div
        className={`drop-zone ${dragOver ? 'over' : ''}`}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); setFile(e.dataTransfer.files[0]) }}
      >
        <input ref={fileRef} type="file" accept="application/pdf"
          onChange={e => setFile(e.target.files[0])} />
        <div className="drop-zone-icon">📋</div>
        <div className="drop-zone-title">{file ? file.name : 'Drop job card PDF here'}</div>
        <div className="drop-zone-sub">
          {file
            ? `${(file.size / 1024).toFixed(0)} KB · Digital PDFs and scanned/handwritten documents supported`
            : 'Digital or scanned PDF · Click to browse'}
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={!file} onClick={handleProcess}>
          Extract &amp; Enrich →
        </button>
        {file && <button className="btn btn-ghost" onClick={() => setFile(null)}>Clear</button>}
      </div>
    </div>
  )
}
