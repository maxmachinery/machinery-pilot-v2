import { useState, useMemo } from 'react'

const SEV_ORDER = { critical:0, warning:1, minor:2, ok:3 }
const SEV_LABEL = { critical:'Critical', warning:'Warning', minor:'Minor', ok:'OK' }
const SEV_ICON  = { critical:'⚠', warning:'△', minor:'◎', ok:'✓' }

function SevBadge({ sev }) {
  return (
    <span className={`sev ${sev}`}>
      {SEV_ICON[sev]} {SEV_LABEL[sev]||sev}
    </span>
  )
}

export default function ReviewStep({ sessionId, sessionData, onDone, onBack }) {
  const [decisions,   setDecisions]   = useState({})
  const [editVals,    setEditVals]    = useState({})
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)

  const fields      = sessionData?.original_fields || []
  const enrichments = sessionData?.enrichments     || []

  const merged = useMemo(() =>
    fields
      .map(f => ({ ...f, enrichment: enrichments.find(e => e.fieldId === f.fieldId) || null }))
      .sort((a,b) => (SEV_ORDER[a.enrichment?.severity]??3) - (SEV_ORDER[b.enrichment?.severity]??3)),
    [fields, enrichments]
  )

  const needsReview  = merged.filter(f => f.enrichment?.severity !== 'ok')
  const okFields     = merged.filter(f => f.enrichment?.severity === 'ok')
  const reviewedCount = needsReview.filter(f => decisions[f.fieldId]).length
  const allDone       = reviewedCount === needsReview.length
  const pct           = needsReview.length === 0 ? 100 : Math.round(reviewedCount / needsReview.length * 100)

  function decide(fieldId, action) {
    setDecisions(p => ({ ...p, [fieldId]: { action, value: editVals[fieldId] } }))
  }

  function openEdit(fieldId, suggestion, origValue) {
    const init = editVals[fieldId] ?? suggestion ?? origValue ?? ''
    setEditVals(p => ({ ...p, [fieldId]: init }))
    setDecisions(p => ({ ...p, [fieldId]: { action: 'edit', value: init } }))
  }

  function updateEdit(fieldId, val) {
    setEditVals(p => ({ ...p, [fieldId]: val }))
    setDecisions(p => ({ ...p, [fieldId]: { action: 'edit', value: val } }))
  }

  async function handleSubmit() {
    setSaving(true); setError(null)
    const auto = {}
    okFields.forEach(f => { auto[f.fieldId] = { action: 'accept' } })
    const all = { ...auto, ...decisions }
    try {
      const r = await fetch(`/api/session/${sessionId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: all }),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error||'Save failed') }
      const result = await r.json()
      onDone({ ...sessionData, review_decisions: result.decisions })
    } catch (e) {
      setError(e.message); setSaving(false)
    }
  }

  return (
    <>
      {/* ── Summary bar ─────────────────────────────────────────── */}
      <div className="card" style={{marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
          <div>
            <h2 className="card-title">Step 3 — Review Enrichments</h2>
            <p className="card-subtitle">
              {needsReview.length === 0
                ? 'All fields are compliant — nothing to review.'
                : `${reviewedCount} of ${needsReview.length} fields reviewed`}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{marginTop:4}}>← Back</button>
        </div>

        {needsReview.length > 0 && (
          <div style={{marginTop:14}}>
            <div className="prog-wrap" style={{marginBottom:6}}>
              <div className="prog-fill" style={{width:`${pct}%`}} />
            </div>
            <span style={{fontSize:12,color:'var(--grey-muted)'}}>
              {pct}% complete · {needsReview.length - reviewedCount} remaining
            </span>
          </div>
        )}
        {error && <div className="err" style={{marginTop:12}}>{error}</div>}
      </div>

      {/* ── Fields needing review ────────────────────────────────── */}
      {needsReview.map(f => (
        <FieldCard
          key={f.fieldId}
          field={f}
          decision={decisions[f.fieldId]}
          editVal={editVals[f.fieldId]}
          onAccept={() => decide(f.fieldId, 'accept')}
          onEdit={() => openEdit(f.fieldId, f.enrichment?.suggestion, f.value)}
          onReject={() => decide(f.fieldId, 'reject')}
          onEditChange={v => updateEdit(f.fieldId, v)}
        />
      ))}

      {/* ── OK fields summary ────────────────────────────────────── */}
      {okFields.length > 0 && <OkSummary fields={okFields} />}

      {/* ── Confirm bar ─────────────────────────────────────────── */}
      <div className="card" style={{marginTop:4}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
          <span style={{fontSize:14,color:'var(--grey-muted)'}}>
            {allDone
              ? '✓ All gap fields reviewed — ready to export'
              : `${needsReview.length - reviewedCount} field${needsReview.length-reviewedCount!==1?'s':''} still need review`}
          </span>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!allDone||saving}>
            {saving ? 'Saving…' : 'Confirm & Continue →'}
          </button>
        </div>
      </div>
    </>
  )
}

function FieldCard({ field, decision, editVal, onAccept, onEdit, onReject, onEditChange }) {
  const sev        = field.enrichment?.severity || 'ok'
  const suggestion = field.enrichment?.suggestion || ''
  const isEditing  = decision?.action === 'edit'

  return (
    <div className={`rev-card ${decision ? 'done' : ''}`}>
      <div className="rev-head">
        <span className="rev-head-name">{field.name}</span>
        <SevBadge sev={sev} />
      </div>
      <div className="rev-body">
        <div className="two-col">
          <div className="val-row">
            <span className="val-lbl">Original Value</span>
            <div className={`val-box ${!field.value?'empty':''}`}>
              {field.value || '(empty)'}
            </div>
          </div>
          <div className="val-row">
            <span className="val-lbl">AI Suggestion</span>
            <div className={`val-box ${!suggestion?'empty':''}`}>
              {suggestion || '(no change recommended)'}
            </div>
          </div>
        </div>

        {field.enrichment?.reason &&
          <p className="reason">{field.enrichment.reason}</p>}

        {isEditing && (
          <div className="val-row">
            <span className="val-lbl">Your Edit</span>
            <textarea
              className="edit-area"
              value={editVal || ''}
              onChange={e => onEditChange(e.target.value)}
              placeholder="Enter custom value…"
              rows={3}
            />
          </div>
        )}

        <div className="rev-actions">
          <button className={`btn btn-sm btn-accept ${decision?.action==='accept'?'on':''}`} onClick={onAccept}>
            ✓ Accept
          </button>
          <button className={`btn btn-sm btn-edit ${isEditing?'on':''}`} onClick={onEdit}>
            ✎ Edit
          </button>
          <button className={`btn btn-sm btn-reject ${decision?.action==='reject'?'on':''}`} onClick={onReject}>
            ✕ Keep Original
          </button>
        </div>
      </div>
    </div>
  )
}

function OkSummary({ fields }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card" style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}}
        onClick={() => setOpen(v => !v)}>
        <div>
          <span style={{fontWeight:600,color:'var(--ok)',fontSize:15}}>
            ✓ {fields.length} compliant field{fields.length!==1?'s':''} — auto-accepted
          </span>
          <p style={{fontSize:13,color:'var(--grey-muted)',marginTop:2}}>
            These fields are complete and policy-compliant
          </p>
        </div>
        <span style={{color:'var(--grey-muted)',fontSize:13}}>{open?'▲ Hide':'▼ Show'}</span>
      </div>
      {open && <>
        <div className="divider" />
        <div className="fgrid">
          {fields.map(f => (
            <div key={f.fieldId} className="frow">
              <span className="fname">{f.name}</span>
              <span className="fdesc">{f.enrichment?.suggestion || f.value || '(empty)'}</span>
              <span className="sev ok" style={{fontSize:11}}>✓ OK</span>
            </div>
          ))}
        </div>
      </>}
    </div>
  )
}
