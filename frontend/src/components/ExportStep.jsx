import { useState } from 'react'

export default function ExportStep({ sessionId, sessionData, oemConfig, onReset }) {
  const [dl, setDl] = useState(null) // 'txt' | 'csv' | null

  const fields      = sessionData?.original_fields  || []
  const enrichments = sessionData?.enrichments      || []
  const decisions   = sessionData?.review_decisions || {}

  // Compute final values for portal preview
  const portalFields = oemConfig?.portal_fields || []

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
      const r = await fetch(`/api/export/${sessionId}/${fmt}`)
      if (!r.ok) throw new Error('Download failed')
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${fmt==='txt'?'enriched-job-card':'portal-export'}-${sessionId.slice(0,8)}.${fmt}`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (e) { console.error(e) }
    finally { setDl(null) }
  }

  // Stats
  const accepted = Object.values(decisions).filter(d => d.action==='accept').length
  const edited   = Object.values(decisions).filter(d => d.action==='edit').length
  const rejected = Object.values(decisions).filter(d => d.action==='reject').length
  const autoOk   = enrichments.filter(e => e.severity==='ok').length

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Step 4 — Export</h2>
          <p className="card-subtitle">Review complete. Download the enriched job card and portal CSV.</p>
        </div>

        {/* Stats */}
        <div className="stat-grid">
          <StatBox val={fields.length} lbl="Total Fields" color="var(--navy)" />
          <StatBox val={autoOk}        lbl="Auto OK"      color="var(--ok)"   />
          <StatBox val={accepted}      lbl="Accepted"     color="var(--ok)"   />
          <StatBox val={edited}        lbl="Edited"       color="var(--minor)" />
        </div>

        {/* Downloads */}
        <div className="export-grid">
          <div className="exp-card">
            <div className="exp-icon">📄</div>
            <h3 className="exp-title">Enriched Job Card</h3>
            <p className="exp-desc">
              Plain text file with all final field values in labelled sections.
              Ready for internal records or manual portal entry.
            </p>
            <button className="btn btn-navy" onClick={() => download('txt')} disabled={dl==='txt'}>
              {dl==='txt' ? 'Generating…' : '⬇ Download .txt'}
            </button>
          </div>

          <div className="exp-card">
            <div className="exp-icon">📊</div>
            <h3 className="exp-title">OEM Portal CSV</h3>
            <p className="exp-desc">
              CSV mapped to <strong>{oemConfig?.name||'OEM'}</strong> portal field structure
              with character limits enforced. Import directly.
            </p>
            <button className="btn btn-primary" onClick={() => download('csv')} disabled={dl==='csv'}>
              {dl==='csv' ? 'Generating…' : '⬇ Download .csv'}
            </button>
          </div>
        </div>

        {/* Portal field preview */}
        {portalFields.length > 0 && <>
          <div className="divider" />
          <h4 className="sec-title">Portal Field Preview</h4>
          <div style={{overflowX:'auto'}}>
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
                  const val     = finalVal(f.fieldId)
                  const over    = f.maxChars && val.length > f.maxChars
                  const capped  = f.maxChars ? val.substring(0, f.maxChars) : val
                  return (
                    <tr key={f.fieldId}>
                      <td style={{fontWeight:600,color:'var(--navy)'}}>{f.name||f.fieldId}</td>
                      <td style={{maxWidth:280,wordBreak:'break-word'}}>{capped||<em style={{color:'var(--grey-muted)'}}>empty</em>}</td>
                      <td className={over ? 'char-warn' : 'char-ok'}>{val.length}</td>
                      <td className="char-ok">{f.maxChars||'—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>}
      </div>

      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:600,color:'var(--navy)'}}>Process another job card</div>
            <div style={{fontSize:13,color:'var(--grey-muted)',marginTop:2}}>
              Start a new enrichment session with the same or different OEM config
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onReset}>↩ Start Over</button>
        </div>
      </div>
    </>
  )
}

function StatBox({ val, lbl, color }) {
  return (
    <div className="stat-box">
      <div className="stat-val" style={{color}}>{val}</div>
      <div className="stat-lbl">{lbl}</div>
    </div>
  )
}
