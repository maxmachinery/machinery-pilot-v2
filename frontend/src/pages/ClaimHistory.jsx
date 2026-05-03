import { useState, useEffect } from 'react'
import { PortalView } from './NewClaim.jsx'

// ── Status helpers ────────────────────────────────────────────────────────────
function statusClass(status) {
  if (status === 'submitted')           return 'exported'
  if (status === 'copied_to_oem_portal') return 'enriched'
  return 'draft'
}

function statusLabel(status) {
  if (status === 'submitted')            return 'SUBMITTED'
  if (status === 'copied_to_oem_portal') return 'COPIED'
  return 'READY'
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${statusClass(status)}`}>{statusLabel(status)}</span>
}

// ── Main list view ────────────────────────────────────────────────────────────
export default function ClaimHistory() {
  const [claims,  setClaims]  = useState([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null)
  const [toast,   setToast]   = useState('')

  useEffect(() => {
    fetch('/api/claims')
      .then(r => r.json())
      .then(data => { setClaims(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function markSubmitted(id, e) {
    e.stopPropagation()
    const r = await fetch(`/api/claims/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'submitted' }),
    })
    if (r.ok) setClaims(prev => prev.map(c => c.id === id ? { ...c, status: 'submitted' } : c))
  }

  async function deleteClaim(id, e) {
    e.stopPropagation()
    if (!window.confirm('Delete this claim? This cannot be undone.')) return
    const r = await fetch(`/api/claims/${id}`, { method: 'DELETE' })
    if (r.ok) {
      setClaims(prev => prev.filter(c => c.id !== id))
      showToast('Claim deleted')
    }
  }

  function updateClaimStatus(id, status) {
    setClaims(prev => prev.map(c => c.id === id ? { ...c, status } : c))
  }

  if (loading) return <div className="loader"><div className="spinner" /><div className="loader-title">Loading claim history…</div></div>

  if (viewing) {
    return (
      <ClaimDetailView
        claimId={viewing}
        onBack={() => setViewing(null)}
        onStatusChange={(status) => updateClaimStatus(viewing, status)}
      />
    )
  }

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#1a1a1a', color: '#fff', fontSize: 13,
          padding: '10px 18px', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.25)',
          fontFamily: 'Barlow, sans-serif', fontWeight: 500,
        }}>
          {toast}
        </div>
      )}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', fontFamily: 'Barlow, sans-serif' }}>
          {claims.length} claim{claims.length !== 1 ? 's' : ''}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--grey-muted)' }}>
          Full audit trail — view uploaded files, exact prompt used, and portal output for every claim.
        </p>
      </div>

      {claims.length === 0 ? (
        <div className="empty">No claims yet — process your first job card in New Claim.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>OEM</th>
                <th>Docs</th>
                <th>Prompt</th>
                <th>Status</th>
                <th>Action</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} onClick={() => setViewing(c.id)} style={{ cursor: 'pointer' }}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(c.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{c.oem_name || '—'}</td>
                  <td className="muted" style={{ textAlign: 'center' }}>
                    {(c.uploaded_documents || []).length}
                  </td>
                  <td className="muted" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.promptPreview || '—'}
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => setViewing(c.id)}>View</button>
                      {c.status === 'copied_to_oem_portal' && (
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--ok)', borderColor: 'var(--ok-ring)' }} onClick={(e) => markSubmitted(c.id, e)}>
                          Mark Submitted
                        </button>
                      )}
                    </div>
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{ width: 32, textAlign: 'center' }}>
                    <button
                      onClick={e => deleteClaim(c.id, e)}
                      title="Delete claim"
                      style={{
                        width: 28, height: 28, padding: 0, border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        borderRadius: 4, fontSize: 15,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'inherit' }}
                    >🗑</button>
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

// ── Claim detail view ─────────────────────────────────────────────────────────
function ClaimDetailView({ claimId, onBack, onStatusChange }) {
  const [claim,   setClaim]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/claims/${claimId}`)
      .then(r => r.json())
      .then(data => { setClaim(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [claimId])

  function handleStatusChange(status) {
    setClaim(prev => ({ ...prev, status }))
    onStatusChange?.(status)
  }

  if (loading) return <div className="loader"><div className="spinner" /><div className="loader-title">Loading claim…</div></div>
  if (!claim)  return (
    <div className="card">
      <div className="err">Failed to load claim.</div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginTop: 10 }}>← Back</button>
    </div>
  )

  const docs = claim.uploaded_documents || []
  const po   = claim.portal_output || {}
  const oem  = claim.oem_config
    ? { ...claim.oem_config, name: claim.oem_name || claim.oem_config.name }
    : { name: claim.oem_name, portal_fields: [] }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 20, color: 'var(--navy)' }}>
          {claim.oem_name || 'Claim'} #{claim.id}
        </span>
        <button
          onClick={onBack}
          style={{
            background: '#3B9B53', color: '#fff',
            border: 'none', borderRadius: 4,
            padding: '8px 18px', fontSize: 12,
            fontWeight: 700, letterSpacing: '0.05em',
            cursor: 'pointer', transition: 'background .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2f7d42' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#3B9B53' }}
        >
          ← Claim History
        </button>
      </div>

      {/* Metadata */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 24, fontSize: 13, flexWrap: 'wrap', alignItems: 'center' }}>
          <span><strong style={{ color: 'var(--navy)' }}>OEM:</strong> {claim.oem_name || '—'}</span>
          <span><strong style={{ color: 'var(--navy)' }}>Date:</strong> {new Date(claim.created_at).toLocaleString()}</span>
          <span>
            <strong style={{ color: 'var(--navy)' }}>Status:</strong>{' '}
            <StatusBadge status={claim.status} />
          </span>
        </div>
      </div>

      {/* Uploaded Documents */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="sec-title">Uploaded Documents ({docs.length})</h3>
        {docs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--grey-muted)' }}>No documents recorded.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docs.map((doc, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--grey-bg)', borderRadius: 6 }}>
                <span style={{ fontSize: 16 }}>{doc.type === 'pdf' ? '📄' : '📝'}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.filename}
                </span>
                <span style={{ fontSize: 11, color: 'var(--grey-muted)', whiteSpace: 'nowrap' }}>
                  {doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ''}
                </span>
                <a
                  href={`/api/claims/${claimId}/document/${i}`}
                  download={doc.filename}
                  className="btn btn-ghost btn-xs"
                  onClick={e => e.stopPropagation()}
                >⬇ Download</a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prompt */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="sec-title">Analysis Prompt</h3>
        <textarea
          readOnly
          value={claim.prompt || ''}
          style={{
            width: '100%', minHeight: 180, padding: '10px 12px',
            border: '1.5px solid var(--grey-border)', borderRadius: 6,
            fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6,
            color: 'var(--text)', background: 'var(--grey-bg)', resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Portal View */}
      <PortalView
        claimId={claimId}
        portalOutput={po}
        aiRawResponse={claim.ai_raw_response || ''}
        oem={oem}
        onStatusChange={handleStatusChange}
      />
    </>
  )
}
