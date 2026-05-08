import { useState, useRef, useEffect } from 'react'
import TerexPortalView from '../components/portals/TerexPortalView.jsx'
import GenericPortalView from '../components/portals/GenericPortalView.jsx'

const TEREX_BRANDS = ['terex', 'powerscreen', 'terex fuchs', 'doppstadt', 'finlay', 'ecotec', 'evoquip']

function getPortalComponent(oem) {
  const label = ((oem?.name || '') + ' ' + (oem?.brand || '')).toLowerCase()
  if (TEREX_BRANDS.some(b => label.includes(b))) return TerexPortalView
  return GenericPortalView
}

export default function NewClaim({ onNavigate }) {
  const [uploadedFiles,  setUploadedFiles]  = useState([])
  const [files,          setFiles]          = useState([])
  const [pastedText,     setPastedText]     = useState('')
  const [oems,           setOems]           = useState(null)
  const [selectedOemId,  setSelectedOemId]  = useState('')
  const [prompts,        setPrompts]        = useState(null)
  const [selectedPromptId, setSelectedPromptId] = useState('')
  const [drag,           setDrag]           = useState(false)
  const [selectedOem,    setSelectedOem]    = useState(null)
  const [claimId,        setClaimId]        = useState(null)
  const [claimIds,       setClaimIds]       = useState([])
  const [portalOutput,   setPortalOutput]   = useState({})
  const [aiRawResponse,  setAiRawResponse]  = useState('')
  const [usedPromptId,   setUsedPromptId]   = useState(null)
  const [usedPromptName, setUsedPromptName] = useState('')
  const [processing,     setProcessing]     = useState(false)
  const [processError,   setProcessError]   = useState(null)

  const fileRef = useRef()
  const ACCEPT = '.pdf,.doc,.docx'

  useEffect(() => {
    fetch('/api/oem/configs')
      .then(r => r.json())
      .then(setOems)
      .catch(() => setOems([]))
    fetch('/api/prompts')
      .then(r => r.json())
      .then(all => setPrompts(all.filter(p => p.category === 'New Claim')))
      .catch(() => setPrompts([]))
  }, [])

  // Auto-select best default prompt when OEM changes
  useEffect(() => {
    if (!prompts) return
    const oem   = oems?.find(o => String(o.id) === String(selectedOemId))
    const brand = (oem?.brand || oem?.name || '').toLowerCase()
    const brandDefault  = prompts.find(p => p.is_default && p.brand && p.brand.toLowerCase() === brand)
    const globalDefault = prompts.find(p => p.is_default && !p.brand)
    const best = brandDefault || globalDefault
    if (best) setSelectedPromptId(String(best.id))
  }, [selectedOemId, prompts]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFiles(fileList) {
    for (const f of Array.from(fileList)) {
      const ext = f.name.split('.').pop().toLowerCase()
      if (!['pdf','doc','docx'].includes(ext)) continue

      const tempId = Math.random().toString(36).slice(2)
      setFiles(prev => [...prev, { tempId, filename: f.name, size: f.size, type: ext, uploading: true }])

      const fd = new FormData()
      fd.append('file', f)
      try {
        const r = await fetch('/api/claim/upload-files', { method: 'POST', body: fd })
        if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed') }
        const data = await r.json()
        setFiles(prev => prev.map(fi => fi.tempId === tempId ? { ...data, tempId, uploading: false } : fi))
      } catch(e) {
        setFiles(prev => prev.filter(fi => fi.tempId !== tempId))
        setProcessError(`Failed to upload ${f.name}: ${e.message}`)
      }
    }
  }

  async function runProcess(filesArg, oem, promptId, pasted) {
    setProcessing(true)
    setProcessError(null)
    try {
      const r = await fetch('/api/claim/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oemConfigId: oem?.id,
          files: filesArg.map(f => ({ r2_key: f.r2_key, filename: f.filename, type: f.type, size: f.size })),
          promptId: promptId || undefined,
          pastedText: pasted || undefined,
        }),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Processing failed') }
      const data = await r.json()
      setClaimId(data.claimId)
      setClaimIds(data.claimIds || [])
      setPortalOutput(data.portalOutput || {})
      setAiRawResponse(data.aiRawResponse || '')
      setUsedPromptId(data.promptId || null)
      setUsedPromptName(data.promptName || '')
    } catch(e) {
      setProcessError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  function handleProcess() {
    const oem = oems?.find(o => String(o.id) === String(selectedOemId))
    const readyFiles = files.filter(f => !f.uploading && f.r2_key)
    const pasted = pastedText.trim() || null
    setUploadedFiles(readyFiles)
    setSelectedOem(oem)
    runProcess(readyFiles, oem, selectedPromptId || null, pasted)
  }

  function handleReset() {
    setUploadedFiles([])
    setFiles([])
    setPastedText('')
    setSelectedOem(null)
    setClaimId(null)
    setClaimIds([])
    setPortalOutput({})
    setAiRawResponse('')
    setUsedPromptId(null)
    setUsedPromptName('')
    setProcessError(null)
    setSelectedOemId('')
    setSelectedPromptId('')
  }

  const readyFiles    = files.filter(f => !f.uploading && f.r2_key)
  const hasPastedText = pastedText.trim().length > 0
  const canProcess    = (readyFiles.length > 0 || hasPastedText) && selectedOemId && selectedPromptId && oems?.length > 0
  const hasPortalOutput = Object.keys(portalOutput).length > 0

  // Empty state: no portals configured
  if (oems !== null && oems.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🖥️</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)', marginBottom: 8 }}>
          No portals configured yet
        </div>
        <div style={{ fontSize: 13, color: 'var(--grey-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          Set up your first OEM portal in Portal Setup before processing claims.
        </div>
        <button
          className="btn btn-primary"
          onClick={() => onNavigate && onNavigate('library')}
        >
          Go to Portal Setup
        </button>
      </div>
    )
  }

  return (
    <div>
      {processError && (
        <div className="err" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
          <span>{processError}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }} onClick={() => setProcessError(null)}>✕</button>
        </div>
      )}

      {/* ── Input section (always visible until portal output appears) ── */}
      {!hasPortalOutput && !processing && (
        <div className="card">
          {/* Row 1: OEM Portal + Prompt dropdowns */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">OEM Portal <span style={{ color: 'var(--crit)' }}>*</span></label>
              {oems === null ? (
                <div style={{ fontSize: 13, color: 'var(--grey-muted)' }}>Loading…</div>
              ) : (
                <select className="field-input" value={selectedOemId} onChange={e => setSelectedOemId(e.target.value)}>
                  <option value="">Select OEM Portal…</option>
                  {oems.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
            </div>

            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">Prompt <span style={{ color: 'var(--crit)' }}>*</span></label>
              {prompts === null ? (
                <div style={{ fontSize: 13, color: 'var(--grey-muted)' }}>Loading…</div>
              ) : prompts.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--warn)', padding: '8px 12px', background: 'var(--warn-bg)', borderRadius: 6, border: '1px solid var(--warn-ring)' }}>
                  No prompts configured — add one in Custom Prompts.
                </div>
              ) : (
                <select
                  className="field-input"
                  value={selectedPromptId}
                  onChange={e => setSelectedPromptId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {prompts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.brand ? ` · ${p.brand}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Row 2: Two-column upload area */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>

            {/* Left: File upload */}
            <div style={{ flex: 1, opacity: hasPastedText ? 0.4 : 1, pointerEvents: hasPastedText ? 'none' : 'auto', transition: 'opacity .15s' }}>
              <div
                className={`drop-zone ${drag ? 'over' : ''}`}
                onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
              >
                <input ref={fileRef} type="file" accept={ACCEPT} multiple onChange={e => handleFiles(e.target.files)} />
                <div className="drop-zone-icon">📋</div>
                <div className="drop-zone-title">Drop job card files here</div>
                <div className="drop-zone-sub">PDF or Word documents · Click to browse · Multiple files supported</div>
              </div>
              {files.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {files.map((f, i) => (
                    <div key={f.tempId || i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 6,
                      background: f.uploading ? 'var(--grey-bg)' : 'rgba(22,163,74,.06)',
                      border: `1px solid ${f.uploading ? 'var(--grey-border)' : '#86EFAC'}`,
                    }}>
                      <span style={{ fontSize: 16 }}>{f.type === 'pdf' ? '📄' : '📝'}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
                      <span style={{ fontSize: 11, color: 'var(--grey-muted)', whiteSpace: 'nowrap' }}>{(f.size / 1024).toFixed(0)} KB</span>
                      {f.uploading
                        ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        : <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span>
                      }
                      {!f.uploading && (
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--grey-muted)', fontSize: 14, padding: '0 2px' }}
                          onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {hasPastedText && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#6B7280', fontStyle: 'italic' }}>
                  Using paste input — clear to use file upload
                </div>
              )}
            </div>

            {/* Centre: OR divider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px' }}>
              <div style={{ flex: 1, width: 1, background: '#E5E7EB' }} />
              <span style={{ padding: '10px 0', fontWeight: 700, fontSize: 14, color: '#6B7280', userSelect: 'none' }}>OR</span>
              <div style={{ flex: 1, width: 1, background: '#E5E7EB' }} />
            </div>

            {/* Right: Paste textarea */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: files.length > 0 ? 0.4 : 1, pointerEvents: files.length > 0 ? 'none' : 'auto', transition: 'opacity .15s' }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 2 }}>Paste Prompt Result</div>
                <div style={{ fontSize: 12, color: 'var(--grey-muted)' }}>Paste raw text from a job card or extracted prompt result</div>
              </div>
              <textarea
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Paste raw job card text or prompt result here..."
                style={{
                  flex: 1, minHeight: 160, width: '100%', padding: '12px',
                  border: '1px solid #D1D5DB', borderRadius: 6,
                  fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5,
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  color: 'var(--text)', background: '#fff',
                }}
              />
              {files.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#6B7280', fontStyle: 'italic' }}>
                  Using file upload — clear files to use paste input
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Process button */}
          <div style={{ marginTop: 18 }}>
            <button
              className="btn btn-primary"
              disabled={!canProcess}
              onClick={handleProcess}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Process Job Card
            </button>
          </div>
        </div>
      )}

      {/* ── Processing spinner ── */}
      {processing && (
        <div className="loader">
          <div className="spinner" />
          <div className="loader-title">Extracting and mapping…</div>
          <div className="loader-sub">
            {uploadedFiles.length > 0
              ? `Working on ${uploadedFiles.length} document${uploadedFiles.length !== 1 ? 's' : ''}`
              : 'Working on pasted text'}
          </div>
        </div>
      )}

      {/* ── Portal output (conditionally shown when processing is done) ── */}
      {hasPortalOutput && !processing && (
        <PortalView
          claimId={claimId}
          claimIds={claimIds}
          portalOutput={portalOutput}
          aiRawResponse={aiRawResponse}
          oem={selectedOem}
          uploadedFiles={uploadedFiles}
          usedPromptId={usedPromptId}
          usedPromptName={usedPromptName}
          onRerun={(promptId) => runProcess(uploadedFiles, selectedOem, promptId, pastedText.trim() || null)}
          onReset={handleReset}
        />
      )}
    </div>
  )
}

// ── Portal View (with prompt switcher) ────────────────────────────────────────
export function PortalView({ claimId, claimIds, portalOutput, aiRawResponse, oem, usedPromptId, usedPromptName, onRerun, onReset, onStatusChange, readOnly = false }) {
  const [showSwitcher,   setShowSwitcher]   = useState(false)
  const [availPrompts,   setAvailPrompts]   = useState(null)
  const [selectedPid,    setSelectedPid]    = useState(null)
  // localOutput is used only in the generic portal path, but hooks must be called unconditionally
  const [localOutput,    setLocalOutput]    = useState(portalOutput)

  function openSwitcher() {
    setShowSwitcher(true)
    if (!availPrompts) {
      fetch('/api/prompts')
        .then(r => r.json())
        .then(all => setAvailPrompts(all.filter(p => p.category === 'New Claim')))
        .catch(() => setAvailPrompts([]))
    }
  }

  function switchPrompt() {
    if (!selectedPid) return
    setShowSwitcher(false)
    onRerun(selectedPid)
  }

  // Route to brand-specific portal mirror
  const PortalComponent = getPortalComponent(oem)
  const portalFields = oem?.portal_fields || []

  if (PortalComponent === TerexPortalView) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="card-title" style={{ margin: 0 }}>Portal View — {oem?.name || 'OEM'}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PromptCaption usedPromptName={usedPromptName} claimIds={claimIds} onOpenSwitcher={openSwitcher} />
            {onReset && (
              <button
                onClick={onReset}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--grey-muted)', padding: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--navy)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--grey-muted)' }}
              >
                ↺ Start New Claim
              </button>
            )}
          </div>
        </div>
        {showSwitcher && (
          <PromptSwitcher
            prompts={availPrompts}
            currentId={usedPromptId}
            selectedPid={selectedPid}
            onSelect={setSelectedPid}
            onConfirm={switchPrompt}
            onClose={() => setShowSwitcher(false)}
          />
        )}
        <TerexPortalView data={portalOutput} onReset={onReset} claimId={claimId} onStatusChange={onStatusChange} readOnly={readOnly} />
      </>
    )
  }

  // Generic portal view

  function handleFieldChange(fieldId, value) {
    setLocalOutput(prev => ({ ...prev, [fieldId]: value }))
  }

  function copyAll() {
    const lines = portalFields.length > 0
      ? portalFields.map(f => `${f.name || f.fieldId}:\n${localOutput[f.fieldId] || ''}`)
      : Object.entries(localOutput).filter(([k]) => k !== 'analysis_notes').map(([k, v]) => `${k}:\n${v}`)
    navigator.clipboard.writeText(lines.join('\n\n')).catch(() => {})
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="card-title">Portal View — {oem?.name || 'OEM'}</h2>
            <p className="card-subtitle">
              Results formatted to match {oem?.name || 'OEM'} portal structure.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <PromptCaption usedPromptName={usedPromptName} claimIds={claimIds} onOpenSwitcher={openSwitcher} />
            <button className="btn btn-ghost btn-sm" onClick={copyAll}>📋 Copy All</button>
            {onReset && (
              <button
                onClick={onReset}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--grey-muted)', padding: '0 4px' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--navy)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--grey-muted)' }}
              >
                ↺ Start New Claim
              </button>
            )}
          </div>
        </div>
      </div>

      {showSwitcher && (
        <PromptSwitcher
          prompts={availPrompts}
          currentId={usedPromptId}
          selectedPid={selectedPid}
          onSelect={setSelectedPid}
          onConfirm={switchPrompt}
          onClose={() => setShowSwitcher(false)}
        />
      )}

      {Object.keys(localOutput).length === 0 && !localOutput.analysis_notes ? (
        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--grey-muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', background: 'var(--grey-bg)', padding: '12px 14px', borderRadius: 6 }}>
            {aiRawResponse}
          </div>
        </div>
      ) : (
        <GenericPortalView
          portalOutput={localOutput}
          portalFields={portalFields}
          onChange={handleFieldChange}
        />
      )}

      {localOutput.analysis_notes && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 className="sec-title">Analysis Notes</h3>
          <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {localOutput.analysis_notes}
          </div>
        </div>
      )}

      {onReset && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-navy" onClick={onReset}>↩ Start New Claim</button>
        </div>
      )}
    </>
  )
}

// ── Prompt caption bar ────────────────────────────────────────────────────────
function PromptCaption({ usedPromptName, claimIds, onOpenSwitcher }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--grey-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {usedPromptName && (
          <span>Analysed using prompt: <strong style={{ color: 'var(--navy)' }}>{usedPromptName}</strong></span>
        )}
        {claimIds && claimIds.length > 1 && (
          <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
            · {claimIds.length} job cards — showing first
          </span>
        )}
      </div>
      {onOpenSwitcher && (
        <button
          onClick={onOpenSwitcher}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--navy)', fontSize: 12, fontWeight: 600, padding: 0,
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
        >
          ↔ Switch Prompt
        </button>
      )}
    </div>
  )
}

// ── Prompt switcher modal ─────────────────────────────────────────────────────
function PromptSwitcher({ prompts, currentId, selectedPid, onSelect, onConfirm, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 10, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--grey-border)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)', marginBottom: 4 }}>Switch Prompt</div>
          <div style={{ fontSize: 12, color: 'var(--grey-muted)' }}>Select a different prompt and re-run the analysis.</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prompts === null ? (
            <div className="loader"><div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /></div>
          ) : prompts.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--grey-muted)', fontStyle: 'italic' }}>No prompts found. Add some in Custom Prompts.</div>
          ) : prompts.map(p => (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{
                padding: '10px 12px', borderRadius: 7, cursor: 'pointer',
                border: `1.5px solid ${selectedPid === p.id ? 'var(--cyan)' : 'var(--grey-border)'}`,
                background: selectedPid === p.id ? 'var(--cyan-soft)' : p.id === currentId ? 'var(--grey-bg)' : 'var(--white)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', marginBottom: 2 }}>
                {p.name}
                {p.id === currentId && <span style={{ marginLeft: 7, fontSize: 10, color: 'var(--grey-muted)', fontWeight: 400 }}>current</span>}
                {p.is_default ? <span style={{ marginLeft: 7, fontSize: 10, color: 'var(--ok)', fontWeight: 700 }}>default</span> : null}
              </div>
              <div style={{ fontSize: 11, color: 'var(--grey-muted)' }}>{p.category}{p.brand ? ` · ${p.brand}` : ' · All Brands'}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--grey-border)', display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" disabled={!selectedPid || selectedPid === currentId} onClick={onConfirm}>
            Re-run Analysis
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
