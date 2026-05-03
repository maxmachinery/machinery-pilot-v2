import { useState } from 'react'

export default function ReviewStep({ sessionId, sessionData, onDone, onBack }) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const fields      = sessionData?.original_fields || []
  const enrichments = sessionData?.enrichments     || []
  const images      = sessionData?.extracted_images || []
  const isVision    = sessionData?.transcription_method === 'vision'

  const merged = fields.map(f => ({
    ...f,
    gaps: enrichments.find(e => e.fieldId === f.fieldId) || null,
  }))

  async function handleConfirm() {
    setSaving(true); setError(null)
    try {
      const r = await fetch(`/api/session/${sessionId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: {} }),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Save failed') }
      const result = await r.json()
      onDone({ ...sessionData, review_decisions: result.decisions })
    } catch (e) {
      setError(e.message); setSaving(false)
    }
  }

  const showImagesPanel = images.length > 0

  return (
    <div className={showImagesPanel ? 'review-layout' : undefined}>
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 className="card-title">Documentation Gap Review</h2>
              <p className="card-subtitle">
                {isVision && <span className="vision-badge" style={{ marginRight: 8 }}>👁 Vision transcription</span>}
                Review gaps in each field. Use these notes to amend the job card before OEM submission.
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginTop: 2 }}>← Back</button>
          </div>
          {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
        </div>

        <div className="review-fields">
          {merged.map(f => <FieldGapCard key={f.fieldId} field={f} />)}
        </div>

        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--grey-muted)' }}>
              {merged.length} field{merged.length !== 1 ? 's' : ''} reviewed — ready to export
            </span>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
              {saving ? 'Saving…' : 'Confirm & Export →'}
            </button>
          </div>
        </div>
      </div>

      {showImagesPanel && (
        <div className="images-panel">
          <div className="card" style={{ padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 2 }}>
              Extracted Images / Diagrams
            </div>
            <div style={{ fontSize: 12, color: 'var(--grey-muted)' }}>
              {images.length} item{images.length !== 1 ? 's' : ''} found via vision
            </div>
          </div>
          {images.map(img => (
            <div key={img.id} className="img-card">
              <div className="img-thumb">📸</div>
              <div className="img-body">
                <p className="img-desc">{img.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldGapCard({ field }) {
  const gaps      = field.gaps
  const hasDiag   = gaps?.diagnosticGaps?.length > 0
  const hasRepair = gaps?.repairGaps?.length > 0

  return (
    <div className="rev-card">
      <div className="rev-head">
        <span className="rev-head-name">{field.name}</span>
      </div>
      <div className="rev-body">
        <div className="two-col">
          <div className="val-row">
            <span className="val-lbl">Original</span>
            <div className={`val-box ${!field.value ? 'empty' : ''}`}>
              {field.value || '(empty)'}
            </div>
          </div>
          <div className="val-row">
            <span className="val-lbl">Documentation Gaps</span>
            {!hasDiag && !hasRepair ? (
              <div className="val-box" style={{ color: 'var(--ok)', fontSize: 13 }}>
                ✓ No gaps identified
              </div>
            ) : (
              <div>
                {hasDiag && (
                  <div style={{ marginBottom: hasRepair ? 12 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--grey-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
                      Diagnostic
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {gaps.diagnosticGaps.map((g, i) => (
                        <li key={i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 3, lineHeight: 1.4 }}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {hasRepair && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--grey-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
                      Repair
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {gaps.repairGaps.map((g, i) => (
                        <li key={i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 3, lineHeight: 1.4 }}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
