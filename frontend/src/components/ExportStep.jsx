import { useState } from 'react'

export default function ExportStep({ sessionId, sessionData, oemConfig, onReset }) {
  const [dl,       setDl]       = useState(null)
  const [exported, setExported] = useState(false)

  const fields      = sessionData?.original_fields  || []
  const enrichments = sessionData?.enrichments      || []
  const decisions   = sessionData?.review_decisions || {}
  const portalFields = oemConfig?.portal_fields     || []

  function finalVal(fieldId) {
    const f = fields.find(f => f.fieldId === fieldId)
    if (!f) return ''
    const e = enrichments.find(e => e.fieldId === fieldId)
    const d = decisions[fieldId]
    if (d) {
      if (d.action === 'accept') return e?.suggestion ?? f.value
      if (d.action === 'edit')   return d.value ?? ''
      return f.value
    }
    if (e?.severity === 'ok') return e.suggestion ?? f.value
    return f.value
  }

  async function download(fmt) {
    setDl(fmt)
    try {
      const r    = await fetch(`/api/export/${sessionId}/${fmt}`)
      if (!r.ok) throw new Error('Download failed')
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${fmt === 'txt' ? 'enriched-job-card' : 'portal-export'}-${sessionId.slice(0, 8)}.${fmt}`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)

      // Mark as exported on first download
      if (!exported) {
        await fetch(`/api/session/${sessionId}/export`, { method: 'PUT' })
        setExported(true)
      }
    } catch (e) { console.error(e) }
    finally { setDl(null) }
  }

  const accepted = Object.values(decisions).filter(d => d.action === 'accept').length
  const edited   = Object.values(decisions).filter(d => d.action === 'edit').length
  const autoOk   = enrichments.filter(e => e.severity === 'ok').length
  const critical = enrichments.filter(e => e.severity === 'critical').length
  const warnings = enrichments.filter(e => e.severity === 'warning').length

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Export</h2>
          <p className="card-subtitle">
            Review complete — download the enriched job card and portal CSV.
            {exported && <span style={{ color: 'var(--ok)', marginLeft: 8 }}>✓ Saved to claim history</span>}
          </p>
        </div>

        {/* Metadata summary */}
        {(sessionData?.job_ref || sessionData?.machine || sessionData?.engineer) && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 18, fontSize: 13, color: 'var(--grey-muted)' }}>
            {sessionData.job_ref   && <span><strong style={{ color: 'var(--navy)' }}>Job Ref:</strong> {sessionData.job_ref}</span>}
            {sessionData.machine   && <span><strong style={{ color: 'var(--navy)' }}>Machine:</strong> {sessionData.machine}</span>}
            {sessionData.engineer  && <span><strong style={{ color: 'var(--navy)' }}>Engineer:</strong> {sessionData.engineer}</span>}
          </div>
        )}

        <div className="stat-row">
          <StatBox val={fields.length} lbl="Total Fields"  color="var(--navy)" />
          <StatBox val={autoOk}        lbl="Auto OK"       color="var(--ok)"   />
          <StatBox val={accepted}      lbl="Accepted"      color="var(--ok)"   />
          <StatBox val={edited}        lbl="Edited"        color="var(--minor)" />
        </div>

        {(critical > 0 || warnings > 0) && (
          <div className="err" style={{ marginBottom: 18 }}>
            ⚠ {critical > 0 ? `${critical} critical` : ''}{critical > 0 && warnings > 0 ? ' and ' : ''}{warnings > 0 ? `${warnings} warning` : ''} issue{critical + warnings !== 1 ? 's' : ''} were found. Review decisions have been recorded.
          </div>
        )}

        <div className="export-grid">
          <div className="exp-card">
            <div className="exp-icon">📄</div>
            <h3 className="exp-title">Enriched Job Card</h3>
            <p className="exp-desc">
              Plain text with all final field values in labelled sections. For internal records or manual portal entry.
            </p>
            <button className="btn btn-navy" onClick={() => download('txt')} disabled={dl === 'txt'}>
              {dl === 'txt' ? 'Generating…' : '⬇ Download .txt'}
            </button>
          </div>
          <div className="exp-card">
            <div className="exp-icon">📊</div>
            <h3 className="exp-title">OEM Portal CSV</h3>
            <p className="exp-desc">
              Mapped to <strong>{oemConfig?.name || 'OEM'}</strong> portal field structure with character limits enforced.
            </p>
            <button className="btn btn-primary" onClick={() => download('csv')} disabled={dl === 'csv'}>
              {dl === 'csv' ? 'Generating…' : '⬇ Download .csv'}
            </button>
          </div>
        </div>
      </div>

      {/* Portal field preview */}
      {portalFields.length > 0 && (
        <div className="card">
          <h3 className="sec-title">Portal Field Preview</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Final Value</th>
                  <th>Chars</th>
                  <th>Max</th>
                </tr>
              </thead>
              <tbody>
                {portalFields.map(f => {
                  const val  = finalVal(f.fieldId)
                  const over = f.maxChars && val.length > f.maxChars
                  return (
                    <tr key={f.fieldId}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{f.name || f.fieldId}</td>
                      <td style={{ maxWidth: 280, wordBreak: 'break-word' }}>
                        {over ? val.substring(0, f.maxChars) : val || <em style={{ color: 'var(--grey-muted)' }}>empty</em>}
                      </td>
                      <td className={over ? 'char-warn' : 'char-ok'}>{val.length}</td>
                      <td className="char-ok">{f.maxChars || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--navy)' }}>Start another claim</div>
            <div style={{ fontSize: 13, color: 'var(--grey-muted)', marginTop: 2 }}>
              Begin a new enrichment session
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onReset}>↩ New Claim</button>
        </div>
      </div>
    </>
  )
}

function StatBox({ val, lbl, color }) {
  return (
    <div className="stat-box">
      <div className="stat-val" style={{ color }}>{val}</div>
      <div className="stat-lbl">{lbl}</div>
    </div>
  )
}
