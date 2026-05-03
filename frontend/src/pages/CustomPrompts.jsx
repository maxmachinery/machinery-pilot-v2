import { useState, useEffect } from 'react'

const CATEGORIES = ['New Claim', 'Diagnostic', 'Repair Sequence', 'Cost Recovery', 'Custom']

function fmtDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function CategoryBadge({ cat }) {
  const colours = {
    'New Claim':       { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
    'Diagnostic':      { bg: '#F0FDF4', color: '#16A34A', border: '#86EFAC' },
    'Repair Sequence': { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
    'Cost Recovery':   { bg: '#FFF1F2', color: '#E11D48', border: '#FECDD3' },
    'Custom':          { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
  }
  const s = colours[cat] || { bg: '#F4F6F8', color: '#8A95A3', border: '#DDE3EA' }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 12, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {cat}
    </span>
  )
}

export default function CustomPrompts() {
  const [prompts,  setPrompts]  = useState(null)
  const [oems,     setOems]     = useState([])
  const [editing,  setEditing]  = useState(null)   // null = list, 'new' = new form, {id,...} = edit form
  const [error,    setError]    = useState(null)

  useEffect(() => {
    fetch('/api/prompts').then(r => r.json()).then(setPrompts).catch(() => setPrompts([]))
    fetch('/api/oem/configs').then(r => r.json()).then(setOems).catch(() => setOems([]))
  }, [])

  function openNew() {
    setEditing({ id: null, name: '', category: 'New Claim', brand: '', is_default: false, prompt_text: '' })
    setError(null)
  }

  function openEdit(p) {
    setEditing({ ...p, brand: p.brand || '', is_default: !!p.is_default })
    setError(null)
  }

  function cancel() { setEditing(null); setError(null) }

  async function save() {
    if (!editing.name.trim())        return setError('Name is required')
    if (!editing.prompt_text.trim()) return setError('Prompt text is required')
    const body = {
      name:        editing.name.trim(),
      category:    editing.category,
      brand:       editing.brand || null,
      is_default:  editing.is_default ? 1 : 0,
      prompt_text: editing.prompt_text,
    }
    try {
      const url    = editing.id ? `/api/prompts/${editing.id}` : '/api/prompts'
      const method = editing.id ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Save failed') }
      const updated = await r.json()
      setPrompts(prev => {
        if (editing.id) return prev.map(p => p.id === editing.id ? updated : p)
        return [...(prev || []), updated]
      })
      // If is_default changed, refresh entire list (other prompts may have had is_default cleared)
      if (editing.is_default) {
        fetch('/api/prompts').then(r => r.json()).then(setPrompts).catch(() => {})
      }
      setEditing(null)
      setError(null)
    } catch(e) { setError(e.message) }
  }

  async function duplicate(p) {
    const body = { name: `${p.name} (copy)`, category: p.category, brand: p.brand || null, is_default: 0, prompt_text: p.prompt_text }
    const r = await fetch('/api/prompts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { const np = await r.json(); setPrompts(prev => [...(prev || []), np]) }
  }

  async function del(p) {
    if (!window.confirm(`Delete "${p.name}"?`)) return
    const r = await fetch(`/api/prompts/${p.id}`, { method: 'DELETE' })
    if (r.ok) setPrompts(prev => (prev || []).filter(x => x.id !== p.id))
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  if (editing !== null) {
    const isNew = !editing.id
    return (
      <div className="card" style={{ maxWidth: 860 }}>
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={cancel}>← Back</button>
        </div>
        <div className="card-head">
          <h2 className="card-title">{isNew ? 'New Prompt' : 'Edit Prompt'}</h2>
        </div>

        {error && <div className="err" style={{ marginBottom: 14 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="field-group">
            <label className="field-label">Name <span style={{ color: 'var(--crit)' }}>*</span></label>
            <input className="field-input" value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Standard Warranty Extraction" />
          </div>
          <div className="field-group">
            <label className="field-label">Category <span style={{ color: 'var(--crit)' }}>*</span></label>
            <select className="field-input" value={editing.category} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Brand <span style={{ color: 'var(--grey-muted)', fontWeight: 400 }}>(optional)</span></label>
            <select className="field-input" value={editing.brand} onChange={e => setEditing(p => ({ ...p, brand: e.target.value }))}>
              <option value="">All Brands</option>
              {oems.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
          </div>
          <div className="field-group" style={{ justifyContent: 'flex-end', paddingTop: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!!editing.is_default}
                onChange={e => setEditing(p => ({ ...p, is_default: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span>Set as default for <strong>{editing.category}</strong>{editing.brand ? ` / ${editing.brand}` : ' / All Brands'}</span>
            </label>
          </div>
        </div>

        <div className="field-group" style={{ marginBottom: 20 }}>
          <label className="field-label">Prompt Text <span style={{ color: 'var(--crit)' }}>*</span></label>
          <textarea
            value={editing.prompt_text}
            onChange={e => setEditing(p => ({ ...p, prompt_text: e.target.value }))}
            style={{
              width: '100%', minHeight: 340, padding: '12px 14px',
              border: '1.5px solid var(--grey-border)', borderRadius: 8,
              fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6,
              color: 'var(--text)', background: 'var(--grey-bg)', resize: 'vertical',
              boxSizing: 'border-box',
            }}
            placeholder="Enter the analysis prompt…"
          />
          <div style={{ fontSize: 11, color: 'var(--grey-muted)', marginTop: 4 }}>
            {editing.prompt_text.length} characters
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={save}>Save</button>
          <button className="btn btn-ghost" onClick={cancel}>Cancel</button>
          {!isNew && (
            <button className="btn btn-danger" style={{ marginLeft: 'auto' }} onClick={() => { del(editing); cancel() }}>
              Delete
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="card-title">Custom Prompts</h2>
            <p className="card-subtitle">Manage reusable analysis prompts for different claim types and brands.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ New Prompt</button>
        </div>
      </div>

      {prompts === null ? (
        <div className="loader"><div className="spinner" /></div>
      ) : prompts.length === 0 ? (
        <div className="card empty">No prompts yet — click "+ New Prompt" to create one.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Brand</th>
                <th>Default</th>
                <th>Last Edited</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prompts.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(p)}>
                  <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{p.name}</td>
                  <td><CategoryBadge cat={p.category} /></td>
                  <td style={{ color: 'var(--grey-muted)' }}>{p.brand || 'All Brands'}</td>
                  <td>
                    {p.is_default ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ok)', background: 'var(--ok-bg)', border: '1px solid var(--ok-ring)', padding: '2px 8px', borderRadius: 12 }}>
                        ✓ Default
                      </span>
                    ) : null}
                  </td>
                  <td className="muted">{fmtDate(p.updated_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(p)}>Edit</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => duplicate(p)}>Duplicate</button>
                      <button className="btn btn-danger btn-xs" onClick={() => del(p)}>Delete</button>
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
