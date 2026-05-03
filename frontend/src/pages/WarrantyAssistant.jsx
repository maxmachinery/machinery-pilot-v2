import { useState, useEffect } from 'react'

const GREEN = '#3B9B53'
const GREEN_DARK = '#2e7a40'

// ── Shared small components ───────────────────────────────────────────────────
function Sel({ value, onChange, children, style = {} }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        height: 34, padding: '0 10px', border: '1px solid var(--grey-border)',
        borderRadius: 5, fontSize: 13, color: 'var(--text)',
        background: '#fff', fontFamily: 'Barlow, sans-serif',
        ...style,
      }}
    >
      {children}
    </select>
  )
}

function GreenBtn({ onClick, disabled, loading, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background: disabled || loading ? '#9ca3af' : GREEN,
        color: '#fff', border: 'none', borderRadius: 5,
        padding: '8px 24px', fontSize: 13, fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'background .15s', fontFamily: 'Barlow, sans-serif',
      }}
      onMouseEnter={e => { if (!disabled && !loading) e.currentTarget.style.background = GREEN_DARK }}
      onMouseLeave={e => { if (!disabled && !loading) e.currentTarget.style.background = GREEN }}
    >
      {loading ? 'Working…' : children}
    </button>
  )
}

function SectionCard({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {title && <h3 className="sec-title" style={{ marginBottom: 12 }}>{title}</h3>}
      {children}
    </div>
  )
}

// ── Significance badge ────────────────────────────────────────────────────────
const SIG_COLOURS = {
  'Material change': { bg: '#fee2e2', text: '#991b1b' },
  'Tightened':       { bg: '#fef3c7', text: '#92400e' },
  'Loosened':        { bg: '#d1fae5', text: '#065f46' },
  'Removed':         { bg: '#f3f4f6', text: '#374151' },
  'Added':           { bg: '#dbeafe', text: '#1e40af' },
  'Wording only':    { bg: '#f5f3ff', text: '#5b21b6' },
}
function SigBadge({ sig }) {
  const c = SIG_COLOURS[sig] || { bg: '#f3f4f6', text: '#374151' }
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 600, padding: '2px 7px',
      borderRadius: 10, whiteSpace: 'nowrap',
    }}>{sig}</span>
  )
}

// ── COMPARE MODE ─────────────────────────────────────────────────────────────
function CompareMode({ brands, allDocs, focusPrompts }) {
  const [brand,   setBrand]   = useState('')
  const [docAId,  setDocAId]  = useState('')
  const [docBId,  setDocBId]  = useState('')
  const [focusId, setFocusId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)

  const brandDocs = allDocs.filter(d => !brand || d.oemName === brand)

  async function runCompare() {
    if (!docAId || !docBId) return
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await fetch('/api/assistant/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, docAId: Number(docAId), docBId: Number(docBId), focusPromptId: focusId ? Number(focusId) : null }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Compare failed')
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function exportCsv() {
    if (!result?.differences) return
    const rows = [['Topic', 'Document A', 'Document B', 'Significance']]
    result.differences.forEach(d => rows.push([d.topic, d.documentA, d.documentB, d.significance]))
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'comparison.csv' })
    a.click()
  }

  return (
    <>
      <SectionCard title="Compare Two Documents">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={lbl}>Brand (optional)</label>
            <Sel value={brand} onChange={setBrand} style={{ width: 180 }}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </Sel>
          </div>
          <div>
            <label style={lbl}>Document A</label>
            <Sel value={docAId} onChange={setDocAId} style={{ width: 260 }}>
              <option value="">Select document…</option>
              {brandDocs.map(d => <option key={d.id} value={d.id}>{d.oemName} — {d.filename} ({d.docType})</option>)}
            </Sel>
          </div>
          <div>
            <label style={lbl}>Document B</label>
            <Sel value={docBId} onChange={setDocBId} style={{ width: 260 }}>
              <option value="">Select document…</option>
              {brandDocs.map(d => <option key={d.id} value={d.id}>{d.oemName} — {d.filename} ({d.docType})</option>)}
            </Sel>
          </div>
          <div>
            <label style={lbl}>Focus (optional)</label>
            <Sel value={focusId} onChange={setFocusId} style={{ width: 200 }}>
              <option value="">All Differences</option>
              {focusPrompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Sel>
          </div>
          <GreenBtn onClick={runCompare} disabled={!docAId || !docBId} loading={loading}>
            Compare
          </GreenBtn>
        </div>
        {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
      </SectionCard>

      {loading && (
        <div className="loader">
          <div className="spinner" />
          <div className="loader-title">Analysing documents…</div>
        </div>
      )}

      {result && (
        <div className="card">
          {result.summary && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac',
              borderRadius: 6, padding: '10px 14px', marginBottom: 16,
              fontSize: 13, color: '#166534', lineHeight: 1.5,
            }}>
              <strong>Summary:</strong> {result.summary}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>Section / Topic</th>
                  <th style={{ minWidth: 200 }}>Document A</th>
                  <th style={{ minWidth: 200 }}>Document B</th>
                  <th style={{ minWidth: 120 }}>Significance</th>
                </tr>
              </thead>
              <tbody>
                {(result.differences || []).map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)', verticalAlign: 'top', paddingTop: 8 }}>{d.topic}</td>
                    <td style={{ fontSize: 13, verticalAlign: 'top', paddingTop: 8, lineHeight: 1.5 }}>{d.documentA}</td>
                    <td style={{ fontSize: 13, verticalAlign: 'top', paddingTop: 8, lineHeight: 1.5 }}>{d.documentB}</td>
                    <td style={{ verticalAlign: 'top', paddingTop: 8 }}><SigBadge sig={d.significance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={exportCsv} className="btn btn-ghost btn-sm">⬇ Export CSV</button>
          </div>
        </div>
      )}
    </>
  )
}

// ── ASK MODE ─────────────────────────────────────────────────────────────────
const EXAMPLE_CHIPS = [
  "What's the time limit for submitting a warranty claim?",
  "What evidence is required for an engine warranty claim?",
  "Are pre-authorisations required for labour over a certain amount?",
  "What are the documentation requirements for parts replacement?",
]

function AskMode({ brands, allDocs }) {
  const [brand,    setBrand]    = useState('')
  const [docId,    setDocId]    = useState('')
  const [question, setQuestion] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null)

  const brandDocs = allDocs.filter(d => !brand || d.oemName === brand)

  async function runAsk() {
    if (!question.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brand || null, docId: docId ? Number(docId) : null, question }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Query failed')
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <>
      <SectionCard title="Ask a Question">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <label style={lbl}>Brand (optional)</label>
            <Sel value={brand} onChange={v => { setBrand(v); setDocId('') }} style={{ width: 180 }}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </Sel>
          </div>
          <div>
            <label style={lbl}>Specific document (optional)</label>
            <Sel value={docId} onChange={setDocId} style={{ width: 300 }}>
              <option value="">All documents{brand ? ` for ${brand}` : ''}</option>
              {brandDocs.map(d => <option key={d.id} value={d.id}>{d.oemName} — {d.filename}</option>)}
            </Sel>
          </div>
        </div>

        <label style={{ ...lbl, display: 'block', marginBottom: 6 }}>Your question</label>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="What do you want to know about this policy?"
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box',
            border: '1px solid var(--grey-border)', borderRadius: 5,
            padding: '8px 12px', fontSize: 13, lineHeight: 1.5,
            resize: 'vertical', outline: 'none',
          }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAsk() }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, marginBottom: 14 }}>
          {EXAMPLE_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => setQuestion(chip)}
              style={{
                background: '#f1f5f9', border: '1px solid #cbd5e1',
                borderRadius: 20, padding: '4px 12px', fontSize: 12,
                cursor: 'pointer', color: '#334155', transition: 'all .12s',
                fontFamily: 'Barlow, sans-serif',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9' }}
            >
              {chip}
            </button>
          ))}
        </div>

        <GreenBtn onClick={runAsk} disabled={!question.trim()} loading={loading}>
          Ask
        </GreenBtn>
        {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
      </SectionCard>

      {loading && (
        <div className="loader">
          <div className="spinner" />
          <div className="loader-title">Searching documents…</div>
        </div>
      )}

      {result && (
        <div className="card">
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: 16 }}>
            {result.answer}
          </div>
          {result.sources?.length > 0 && (
            <div style={{ borderTop: '1px solid var(--grey-border)', paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--grey-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Source documents
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {result.sources.map((s, i) => (
                  <span key={i} style={{
                    background: '#f1f5f9', border: '1px solid #cbd5e1',
                    borderRadius: 4, padding: '3px 10px', fontSize: 12, color: '#334155',
                  }}>
                    📄 {s.filename} <span style={{ color: '#94a3b8' }}>({s.docType})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Recent Queries Panel ──────────────────────────────────────────────────────
function RecentQueries() {
  const [open,    setOpen]    = useState(false)
  const [queries, setQueries] = useState(null)

  function load() {
    if (queries) { setOpen(o => !o); return }
    fetch('/api/assistant/queries')
      .then(r => r.json())
      .then(data => { setQueries(data); setOpen(true) })
      .catch(() => setQueries([]))
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <button
        onClick={load}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, color: 'var(--navy)',
          padding: 0, display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'Barlow, sans-serif',
        }}
      >
        <span style={{ fontSize: 11 }}>{open ? '▾' : '▸'}</span>
        Recent queries
      </button>
      {open && queries && (
        <div style={{ marginTop: 12 }}>
          {queries.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--grey-muted)' }}>No queries yet.</div>
          )}
          {queries.map(q => (
            <div key={q.id} style={{
              padding: '8px 0', borderBottom: '1px solid var(--grey-border)',
              display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13,
            }}>
              <span style={{
                background: q.query_type === 'compare' ? '#dbeafe' : '#f0fdf4',
                color: q.query_type === 'compare' ? '#1e40af' : '#166534',
                fontSize: 11, fontWeight: 600, padding: '2px 7px',
                borderRadius: 10, flexShrink: 0, marginTop: 1,
              }}>
                {q.query_type === 'compare' ? 'Compare' : 'Ask'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--grey-muted)', marginRight: 8 }}>
                  {new Date(q.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                </span>
                {q.brand && <span style={{ fontWeight: 600, color: 'var(--navy)', marginRight: 6 }}>{q.brand}</span>}
                <span style={{ color: 'var(--text)' }}>
                  {(q.question_or_prompt_id || '').slice(0, 80)}{(q.question_or_prompt_id || '').length > 80 ? '…' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Label style helper ────────────────────────────────────────────────────────
const lbl = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--grey-muted)', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 5,
  fontFamily: 'Barlow, sans-serif',
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WarrantyAssistant() {
  const [mode,         setMode]         = useState('compare')
  const [brands,       setBrands]       = useState([])
  const [allDocs,      setAllDocs]      = useState([])
  const [focusPrompts, setFocusPrompts] = useState([])
  const [loadingData,  setLoadingData]  = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/library').then(r => r.json()),
      fetch('/api/prompts').then(r => r.json()),
    ]).then(([lib, prompts]) => {
      // Flatten all docs from the library response
      const docs = []
      const seenBrands = new Set()
      for (const row of lib) {
        if (row.oemName) seenBrands.add(row.oemName)
        for (const d of (row.documents || [])) {
          docs.push({ id: d.id, filename: d.filename, docType: d.doc_type, oemName: row.oemName })
        }
      }
      setBrands([...seenBrands].sort())
      setAllDocs(docs)
      // Focus prompts: all except New Claim category
      setFocusPrompts(prompts.filter(p => p.category !== 'New Claim'))
      setLoadingData(false)
    }).catch(() => setLoadingData(false))
  }, [])

  if (loadingData) return (
    <div className="loader"><div className="spinner" /><div className="loader-title">Loading library…</div></div>
  )

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, color: 'var(--grey-muted)' }}>
          Query OEM policies, compare versions, surface differences.
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 6, overflow: 'hidden', width: 'fit-content', border: '1px solid var(--grey-border)' }}>
        {[['compare', 'Compare Policies'], ['ask', 'Ask a Question']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: mode === id ? GREEN : '#fff',
              color: mode === id ? '#fff' : 'var(--text)',
              fontFamily: 'Barlow, sans-serif',
              transition: 'all .12s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'compare' && (
        <CompareMode brands={brands} allDocs={allDocs} focusPrompts={focusPrompts} />
      )}
      {mode === 'ask' && (
        <AskMode brands={brands} allDocs={allDocs} />
      )}

      <RecentQueries />
    </>
  )
}
