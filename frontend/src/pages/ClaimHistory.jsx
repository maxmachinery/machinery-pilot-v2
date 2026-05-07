import { useState, useEffect, useRef } from 'react'
import { PortalView } from './NewClaim.jsx'

// ── Files badge (download / view pasted text) ─────────────────────────────────
function PastedTextModal({ text, onClose }) {
  function copyAll() { navigator.clipboard.writeText(text).catch(() => {}) }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, width: 560, maxHeight: '72vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,.2)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--grey-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Pasted Job Card Text</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--grey-muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          <pre style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, color: 'var(--text)' }}>{text}</pre>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--grey-border)' }}>
          <button className="btn btn-ghost btn-sm" onClick={copyAll}>📋 Copy to clipboard</button>
        </div>
      </div>
    </div>
  )
}

function FilesBadge({ claim }) {
  const docs = claim.uploaded_documents || []
  const [open,       setOpen]       = useState(false)
  const [modalText,  setModalText]  = useState(null)
  const ref = useRef()

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (docs.length === 0) return <span style={{ color: 'var(--grey-muted)', fontSize: 12 }}>—</span>

  const pastedDoc = docs.find(d => d.type === 'pasted_text')
  if (pastedDoc) {
    return (
      <>
        <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); setModalText(pastedDoc.content) }}>
          📄 View Text
        </button>
        {modalText !== null && <PastedTextModal text={modalText} onClose={() => setModalText(null)} />}
      </>
    )
  }

  const fileDocs = docs.map((d, i) => ({ ...d, idx: i })).filter(d => d.r2_key)
  if (fileDocs.length === 0) {
    return <span style={{ color: 'var(--grey-muted)', fontSize: 11 }} title="Original files not available for this claim">—</span>
  }

  if (fileDocs.length === 1) {
    return (
      <a href={`/api/claims/${claim.id}/document/${fileDocs[0].idx}`} download={fileDocs[0].filename}
        className="btn btn-ghost btn-xs" onClick={e => e.stopPropagation()}>
        📥 Download
      </a>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
        📥 Download ({fileDocs.length})
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50,
          background: '#fff', border: '1px solid var(--grey-border)',
          borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          minWidth: 220, padding: 6, marginTop: 2,
        }} onClick={e => e.stopPropagation()}>
          {fileDocs.map(doc => (
            <a key={doc.idx} href={`/api/claims/${claim.id}/document/${doc.idx}`} download={doc.filename}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 4, fontSize: 12, color: 'var(--navy)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--grey-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => setOpen(false)}>
              <span>📄</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

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
                  <td onClick={e => e.stopPropagation()}>
                    <FilesBadge claim={c} />
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
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--navy)', fontSize: 13, fontWeight: 600,
            padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
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
                  {doc.type === 'pasted_text_docx' && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: '#6B7280', fontWeight: 400, background: '#F3F4F6', padding: '1px 5px', borderRadius: 3, border: '1px solid #E5E7EB' }}>Pasted Text</span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: 'var(--grey-muted)', whiteSpace: 'nowrap' }}>
                  {doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ''}
                </span>
                {doc.r2_key ? (
                  <a
                    href={`/api/claims/${claimId}/document/${i}`}
                    download={doc.filename}
                    className="btn btn-ghost btn-xs"
                    onClick={e => e.stopPropagation()}
                  >⬇ Download</a>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--grey-muted)', fontStyle: 'italic' }}>Not available</span>
                )}
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
            width: '100%', minHeight: 90, padding: '10px 12px',
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
