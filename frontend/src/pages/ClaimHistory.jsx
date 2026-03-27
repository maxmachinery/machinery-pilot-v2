import { useState, useEffect } from 'react'

export default function ClaimHistory({ onReopen }) {
  const [claims,  setClaims]  = useState([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    fetch('/api/claims')
      .then(r => r.json())
      .then(data => { setClaims(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function downloadExport(id, fmt) {
    const r    = await fetch(`/api/export/${id}/${fmt}`)
    const blob = await r.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${fmt === 'txt' ? 'enriched-job-card' : 'portal-export'}-${id.slice(0, 8)}.${fmt}`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  if (loading) return <div className="loader"><div className="spinner" /><div className="loader-title">Loading claim history…</div></div>

  if (viewing) {
    return <ClaimDetailView claim={viewing} onBack={() => setViewing(null)} onDownload={downloadExport} />
  }

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', fontFamily: 'Barlow, sans-serif' }}>
          {claims.length} claim{claims.length !== 1 ? 's' : ''}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--grey-muted)' }}>
          All enrichment sessions — view, re-open, or download at any time.
        </p>
      </div>

      {claims.length === 0 ? (
        <div className="empty">No claims yet — start by processing a job card.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>OEM</th>
                <th>Machine</th>
                <th>Job Ref</th>
                <th>Engineer</th>
                <th>Fields</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(c.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                    {c.oem_name || '—'}
                  </td>
                  <td className="muted">{c.machine || '—'}</td>
                  <td className="muted">{c.job_ref || '—'}</td>
                  <td className="muted">{c.engineer || '—'}</td>
                  <td className="muted">{(c.original_fields || []).length}</td>
                  <td>
                    <StatusBadge status={c.claim_status || c.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => setViewing(c)}>View</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => downloadExport(c.id, 'txt')}>TXT</button>
                      <button className="btn btn-primary btn-xs" onClick={() => downloadExport(c.id, 'csv')}>CSV</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function StatusBadge({ status }) {
  const map = {
    exported: 'exported',
    reviewed: 'reviewed',
    enriched: 'enriched',
    pending:  'draft',
    draft:    'draft',
  }
  const cls = map[status] || 'draft'
  const labels = { exported: '✓ Exported', reviewed: 'Reviewed', enriched: 'Enriched', draft: 'Draft' }
  return <span className={`status-badge ${cls}`}>{labels[cls] || status}</span>
}

function ClaimDetailView({ claim, onBack, onDownload }) {
  const fields      = claim.original_fields  || []
  const enrichments = claim.enrichments      || []
  const decisions   = claim.review_decisions || {}
  const images      = claim.extracted_images || []

  const SEV_LABEL = { critical: 'Critical', warning: 'Warning', minor: 'Minor', ok: 'OK' }

  function finalVal(field) {
    const e = enrichments.find(e => e.fieldId === field.fieldId)
    const d = decisions[field.fieldId]
    if (d) {
      if (d.action === 'accept') return e?.suggestion ?? field.value
      if (d.action === 'edit')   return d.value ?? ''
      return field.value
    }
    if (e?.severity === 'ok') return e.suggestion ?? field.value
    return field.value
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Claim History</button>
        <div>
          <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 20, color: 'var(--navy)' }}>
            {claim.oem_name || 'Claim'}
          </span>
          {claim.job_ref && <span style={{ fontSize: 13, color: 'var(--grey-muted)', marginLeft: 10 }}>#{claim.job_ref}</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onDownload(claim.id, 'txt')}>⬇ .txt</button>
          <button className="btn btn-primary btn-sm" onClick={() => onDownload(claim.id, 'csv')}>⬇ .csv</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 24, fontSize: 13, marginBottom: 4, flexWrap: 'wrap' }}>
          {claim.machine  && <span><strong style={{ color: 'var(--navy)' }}>Machine:</strong> {claim.machine}</span>}
          {claim.engineer && <span><strong style={{ color: 'var(--navy)' }}>Engineer:</strong> {claim.engineer}</span>}
          <span><strong style={{ color: 'var(--navy)' }}>Created:</strong> {new Date(claim.created_at).toLocaleString()}</span>
          {claim.exported_at && <span><strong style={{ color: 'var(--ok)' }}>Exported:</strong> {new Date(claim.exported_at).toLocaleString()}</span>}
          <span><StatusBadge status={claim.claim_status || claim.status} /></span>
          {claim.transcription_method === 'vision' && <span className="vision-badge">👁 Vision transcription</span>}
        </div>
      </div>

      <div className="card">
        <h3 className="sec-title">Fields & Decisions</h3>
        <div className="fgrid">
          <div className="frow head">
            <span>Field</span>
            <span>Final Value</span>
            <span>Severity</span>
          </div>
          {fields.map(f => {
            const e = enrichments.find(e => e.fieldId === f.fieldId)
            const d = decisions[f.fieldId]
            return (
              <div key={f.fieldId} className="frow">
                <span className="fname">{f.name}</span>
                <span style={{ fontSize: 13 }}>{finalVal(f) || <em style={{ color: 'var(--grey-muted)' }}>empty</em>}</span>
                <span className={`sev ${e?.severity || 'ok'}`} style={{ fontSize: 10 }}>
                  {SEV_LABEL[e?.severity] || 'OK'}
                  {d && ` (${d.action})`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {images.length > 0 && (
        <div className="card">
          <h3 className="sec-title">Extracted Images ({images.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {images.map(img => (
              <div key={img.id} style={{ padding: '10px 12px', background: 'var(--grey-bg)', borderRadius: 6, fontSize: 13 }}>
                <strong style={{ color: 'var(--navy)' }}>{img.id}:</strong> {img.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
