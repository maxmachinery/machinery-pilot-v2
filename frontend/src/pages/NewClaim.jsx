import { useState, useRef } from 'react'
import ReviewStep from '../components/ReviewStep.jsx'
import ExportStep from '../components/ExportStep.jsx'

const STEPS = [
  { n:1, label:'Select Machine' },
  { n:2, label:'Job Card' },
  { n:3, label:'Review' },
  { n:4, label:'Export' },
]

export default function NewClaim({ initialOem, onOemChange }) {
  // initialOem may now be a library row (has machineId, machineModel, oemName)
  const initMachine = initialOem?.machineId ? initialOem : null

  const [step,        setStep]        = useState(initMachine ? 2 : 1)
  const [machine,     setMachine]     = useState(initMachine)   // library row
  const [sessionId,   setSessionId]   = useState(null)
  const [sessionData, setSessionData] = useState(null)

  function handleMachineSelected(row) {
    setMachine(row)
    onOemChange?.({ id: row.oemId, name: row.oemName, ...row })
    setStep(2)
  }

  function handleJobCardDone(id, data) {
    setSessionId(id); setSessionData(data); setStep(3)
  }
  function handleReviewDone(updated) {
    setSessionData(updated); setStep(4)
  }
  function handleReset() {
    setStep(initMachine ? 2 : 1)
    setMachine(initMachine)
    setSessionId(null); setSessionData(null)
  }

  // Build the oemConfig shape the review/export components expect
  const oemConfig = machine ? {
    id:              machine.oemId,
    name:            machine.oemName,
    brand:           machine.oemBrand,
    job_card_fields: machine.job_card_fields || [],
    portal_fields:   machine.portal_fields   || [],
    policy_rules:    machine.policy_rules    || [],
  } : null

  return (
    <div className="claim-layout">
      {/* Step rail */}
      <div className="step-rail">
        <div className="card" style={{ padding:'16px 14px' }}>
          {STEPS.map((s, i) => (
            <div key={s.n}>
              <div className={`step-rail-item ${step===s.n?'active':step>s.n?'done':''}`}>
                <div className={`step-num ${step===s.n?'active':step>s.n?'done':''}`}>
                  {step > s.n ? '✓' : s.n}
                </div>
                {s.label}
              </div>
              {i < STEPS.length-1 && <div className="step-rail-line" />}
            </div>
          ))}
          {machine && (
            <>
              <div className="divider" style={{ margin:'14px 0' }} />
              <div style={{ fontSize:11, color:'var(--grey-muted)', textTransform:'uppercase', letterSpacing:'.07em', fontWeight:600, marginBottom:5 }}>
                Selected
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--navy)' }}>{machine.oemName}</div>
              <div style={{ fontSize:12, color:'var(--grey-muted)', marginTop:2 }}>{machine.machineModel}</div>
            </>
          )}
        </div>
      </div>

      {/* Step content */}
      <div>
        {step === 1 && <StepSelectMachine onSelect={handleMachineSelected} />}
        {step === 2 && machine && (
          <StepJobCard
            machine={machine}
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

// ── Step 1: Select OEM × Machine ─────────────────────────────────────────────
function StepSelectMachine({ onSelect }) {
  const [rows,     setRows]    = useState(null)
  const [selected, setSelected]= useState(null)
  const [filter,   setFilter]  = useState('')

  useState(() => {
    fetch('/api/library').then(r => r.json()).then(setRows)
  })

  if (!rows) return <div className="loader"><div className="spinner" /></div>

  const filtered = filter
    ? rows.filter(r =>
        r.oemName.toLowerCase().includes(filter.toLowerCase()) ||
        r.machineModel.toLowerCase().includes(filter.toLowerCase())
      )
    : rows

  const DOC_TYPES = ['warranty_policy','portal_structure','machine_handbook','historic_claims']
  const docCount  = r => DOC_TYPES.filter(t => (r.documents||[]).some(d => d.doc_type===t)).length

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">Select Machine</h2>
        <p className="card-subtitle">Choose the OEM + Machine this claim is for</p>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          No machines configured yet.<br />
          <span style={{ fontSize:13 }}>Go to OEM Library and upload documents first.</span>
        </div>
      ) : (
        <>
          {/* Search */}
          <input
            className="field-input"
            placeholder="Filter by OEM or machine model…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ marginBottom:12, width:'100%' }}
          />

          <div className="cfg-list">
            {filtered.map(row => {
              const count = docCount(row)
              return (
                <div
                  key={row.machineId}
                  className={`cfg-item ${selected?.machineId===row.machineId?'sel':''}`}
                  onClick={() => setSelected(row)}
                >
                  <div>
                    <div className="cfg-item-name">
                      {row.oemName}
                      <span style={{ fontWeight:400, color:'var(--grey-muted)', marginLeft:8, fontSize:14 }}>
                        {row.machineModel}
                      </span>
                    </div>
                    <div className="cfg-item-meta">
                      {count}/4 documents ·{' '}
                      {(row.job_card_fields||[]).length} job card fields ·{' '}
                      {(row.portal_fields||[]).length} portal fields
                      {count < 4 && <span style={{ color:'var(--warn)', marginLeft:6 }}>⚠ Partial setup</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {/* Doc dots */}
                    <div style={{ display:'flex', gap:3 }}>
                      {['warranty_policy','portal_structure','machine_handbook','historic_claims'].map(t => {
                        const has = (row.documents||[]).some(d => d.doc_type===t)
                        return <span key={t} style={{ width:7, height:7, borderRadius:'50%', background: has ? 'var(--ok)' : 'var(--grey-border)', display:'inline-block' }} />
                      })}
                    </div>
                    {selected?.machineId===row.machineId && <span className="cfg-sel-badge">Selected</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {selected && (
            <div style={{ marginTop:16, display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={() => onSelect(selected)}>
                Use {selected.oemName} {selected.machineModel} →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Step 2: Job Card Upload ───────────────────────────────────────────────────
function StepJobCard({ machine, onDone, onBack }) {
  const [file,     setFile]    = useState(null)
  const [drag,     setDrag]    = useState(false)
  const [phase,    setPhase]   = useState('idle')
  const [error,    setError]   = useState(null)
  const [jobRef,   setJobRef]  = useState('')
  const [engineer, setEngineer]= useState('')
  const fileRef = useRef()

  async function handleProcess() {
    if (!file) return
    setError(null)
    try {
      setPhase('extracting')
      const fd = new FormData()
      fd.append('pdf',       file)
      fd.append('machineId', machine.machineId)
      if (jobRef)   fd.append('jobRef',   jobRef)
      if (engineer) fd.append('engineer', engineer)

      const r1 = await fetch('/api/jobcard/upload', { method:'POST', body:fd })
      if (!r1.ok) { const e = await r1.json(); throw new Error(e.error||'Extraction failed') }
      const { sessionId } = await r1.json()

      setPhase('enriching')
      const r2 = await fetch(`/api/jobcard/enrich/${sessionId}`, { method:'POST' })
      if (!r2.ok) { const e = await r2.json(); throw new Error(e.error||'Enrichment failed') }

      const r3 = await fetch(`/api/session/${sessionId}`)
      onDone(sessionId, await r3.json())
    } catch(e) {
      setError(e.message); setPhase('idle')
    }
  }

  if (phase==='extracting') return (
    <div className="loader">
      <div className="spinner" />
      <div className="loader-title">Extracting job card fields…</div>
      <div className="loader-sub">Detecting content type · {machine.oemName} {machine.machineModel}</div>
    </div>
  )
  if (phase==='enriching') return (
    <div className="loader">
      <div className="spinner" />
      <div className="loader-title">Enriching against policy…</div>
      <div className="loader-sub">Using all uploaded reference documents</div>
    </div>
  )

  return (
    <div className="card">
      <div style={{ marginBottom:14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Change Machine</button>
      </div>
      <div className="card-head">
        <h2 className="card-title">Upload Job Card</h2>
        <p className="card-subtitle">
          Engineer job card for <strong>{machine.oemName} {machine.machineModel}</strong>.
          Scanned and handwritten PDFs are supported.
        </p>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="meta-grid" style={{ marginBottom:16 }}>
        <div className="field-group">
          <label className="field-label">Job Reference</label>
          <input className="field-input" placeholder="JC-2024-0042" value={jobRef} onChange={e => setJobRef(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Engineer</label>
          <input className="field-input" placeholder="J. Smith" value={engineer} onChange={e => setEngineer(e.target.value)} />
        </div>
      </div>

      <div
        className={`drop-zone ${drag?'over':''}`}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0]) }}
      >
        <input ref={fileRef} type="file" accept="application/pdf" onChange={e => setFile(e.target.files[0])} />
        <div className="drop-zone-icon">📋</div>
        <div className="drop-zone-title">{file ? file.name : 'Drop job card PDF here'}</div>
        <div className="drop-zone-sub">
          {file ? `${(file.size/1024).toFixed(0)} KB` : 'Digital or scanned/handwritten · Click to browse'}
        </div>
      </div>

      <div style={{ marginTop:14, display:'flex', gap:8 }}>
        <button className="btn btn-primary" disabled={!file} onClick={handleProcess}>
          Extract &amp; Enrich →
        </button>
        {file && <button className="btn btn-ghost" onClick={() => setFile(null)}>Clear</button>}
      </div>
    </div>
  )
}
