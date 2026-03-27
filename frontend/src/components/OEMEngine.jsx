import { useState, useEffect, useRef } from 'react'

export default function OEMEngine({ onConfirm }) {
  const [tab,        setTab]        = useState('existing')
  const [configs,    setConfigs]    = useState([])
  const [selected,   setSelected]   = useState(null)
  const [file,       setFile]       = useState(null)
  const [dragOver,   setDragOver]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [fetching,   setFetching]   = useState(true)
  const [newConfig,  setNewConfig]  = useState(null)
  const [error,      setError]      = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    fetch('/api/oem/configs')
      .then(r => r.json())
      .then(data => {
        setConfigs(data)
        setFetching(false)
        if (data.length === 0) setTab('upload')
      })
      .catch(() => setFetching(false))
  }, [])

  async function handleUpload() {
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      const r = await fetch('/api/oem/upload', { method: 'POST', body: fd })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed') }
      const data = await r.json()
      setNewConfig(data)
      setConfigs(prev => [data, ...prev])
      setSelected(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') { setFile(f); setNewConfig(null) }
  }

  const preview = newConfig || selected

  if (loading) return (
    <div className="loader">
      <div className="spinner" />
      <div className="loader-title">Parsing warranty policy…</div>
      <div className="loader-sub">Extracting OEM rules, job card fields, and portal structure</div>
    </div>
  )

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Step 1 — OEM Policy Engine</h2>
          <p className="card-subtitle">Select a saved OEM config or upload a new warranty policy PDF</p>
        </div>

        <div className="tabs">
          <button className={`tab ${tab==='existing'?'on':''}`}
            onClick={() => { setTab('existing'); setNewConfig(null); setError(null) }}>
            Saved Configs{configs.length > 0 ? ` (${configs.length})` : ''}
          </button>
          <button className={`tab ${tab==='upload'?'on':''}`}
            onClick={() => { setTab('upload'); setSelected(null) }}>
            Upload New Policy
          </button>
        </div>

        {tab === 'existing' && (
          fetching ? <div className="empty">Loading…</div> :
          configs.length === 0 ? <div className="empty">No configs yet — upload a policy PDF.</div> :
          <div className="cfg-list">
            {configs.map(c => (
              <div key={c.id}
                className={`cfg-item ${selected?.id === c.id ? 'sel' : ''}`}
                onClick={() => { setSelected(c); setNewConfig(null) }}
              >
                <div>
                  <div className="cfg-item-name">{c.name}</div>
                  <div className="cfg-item-meta">
                    {c.brand && c.brand !== c.name ? `${c.brand} · ` : ''}
                    {(c.job_card_fields?.length||0)} job card fields ·{' '}
                    {(c.portal_fields?.length||0)} portal fields
                  </div>
                </div>
                {selected?.id === c.id && <span className="cfg-sel-badge">Selected</span>}
              </div>
            ))}
          </div>
        )}

        {tab === 'upload' && !newConfig && (
          <>
            {error && <div className="err">{error}</div>}
            <div
              className={`drop-zone ${dragOver ? 'over' : ''}`}
              onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input ref={fileRef} type="file" accept="application/pdf"
                onChange={e => { setFile(e.target.files[0]); setNewConfig(null) }} />
              <div className="drop-zone-icon">📄</div>
              <div className="drop-zone-title">{file ? file.name : 'Drop warranty policy PDF here'}</div>
              <div className="drop-zone-sub">
                {file ? `${(file.size/1024).toFixed(0)} KB — click to change` : 'or click to browse · PDF only'}
              </div>
            </div>
            {file && (
              <div style={{marginTop:14,display:'flex',gap:8}}>
                <button className="btn btn-primary" onClick={handleUpload}>Parse Policy →</button>
                <button className="btn btn-ghost" onClick={() => setFile(null)}>Clear</button>
              </div>
            )}
          </>
        )}
      </div>

      {preview && <ConfigPreview config={preview} onConfirm={() => onConfirm(preview)} />}
    </>
  )
}

function ConfigPreview({ config, onConfirm }) {
  const rules        = config.policy_rules    || []
  const jobFields    = config.job_card_fields || []
  const portalFields = config.portal_fields   || []

  return (
    <div className="card">
      <div className="card-head" style={{marginBottom:0}}>
        <h3 className="card-title" style={{fontSize:20}}>{config.name}</h3>
        {config.brand && config.brand !== config.name &&
          <p className="card-subtitle">{config.brand}</p>}
      </div>

      {rules.length > 0 && <>
        <div className="divider" />
        <h4 className="sec-title">Policy Rules ({rules.length})</h4>
        <ul className="rules">
          {rules.slice(0,10).map((r,i) => <li key={i}>{r}</li>)}
          {rules.length > 10 &&
            <li style={{color:'var(--grey-muted)',fontStyle:'italic'}}>+ {rules.length-10} more</li>}
        </ul>
      </>}

      {jobFields.length > 0 && <>
        <div className="divider" />
        <h4 className="sec-title">Job Card Fields ({jobFields.length})</h4>
        <div className="fgrid">
          <div className="frow head"><span>Field</span><span>Description</span><span>Required</span></div>
          {jobFields.map(f => (
            <div key={f.fieldId} className="frow">
              <span className="fname">{f.name}</span>
              <span className="fdesc">{f.description||'—'}</span>
              <span className={`req-badge ${f.required?'y':'n'}`}>{f.required?'Yes':'Optional'}</span>
            </div>
          ))}
        </div>
      </>}

      {portalFields.length > 0 && <>
        <div className="divider" />
        <h4 className="sec-title">Portal Fields ({portalFields.length})</h4>
        <div className="fgrid">
          <div className="frow head"><span>Field</span><span>Description</span><span>Max chars</span></div>
          {portalFields.map(f => (
            <div key={f.fieldId} className="frow">
              <span className="fname">{f.name||f.fieldId}</span>
              <span className="fdesc">{f.description||'—'}</span>
              <span style={{fontSize:13,color:'var(--grey-muted)'}}>{f.maxChars||'—'}</span>
            </div>
          ))}
        </div>
      </>}

      <div className="divider" />
      <button className="btn btn-primary" onClick={onConfirm}>
        Use This Config — Upload Job Card →
      </button>
    </div>
  )
}
