import { useState, useRef, useEffect } from 'react'
import './widget.css'
import { PROMPT_RESULT_FILL_ORDER } from './fieldMapping.js'

const TEREX_PORTAL_BRANDS = ['terex', 'fuchs', 'powerscreen']

function isBrandMatch(identifiedBrand, portalName) {
  if (!identifiedBrand) return false
  const brandLower = identifiedBrand.toLowerCase().trim()
  const portalLower = (portalName || '').toLowerCase()
  if (portalLower.includes('terex')) {
    return TEREX_PORTAL_BRANDS.some(b => brandLower.includes(b))
  }
  return portalLower.includes(brandLower) || brandLower.includes(portalLower)
}

function escHtml(s) {
  // Not needed in JSX — React escapes by default
  return s || ''
}

const BACKEND_URL = import.meta.env.DEV ? 'http://localhost:3002' : window.location.origin

const PORTAL_NAME = 'Terex Portal'

export default function Widget() {
  const [widgetState, setWidgetState] = useState('IDLE')
  // IDLE | IDENTIFYING | VERIFY | FILLING | SUCCESS | ERROR | MINIMISED
  const [prevWidgetState, setPrevWidgetState] = useState('IDLE')
  const [identified, setIdentified] = useState(null)
  // { brand, machine, jobNumber, confidence }
  const [fillResult, setFillResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [uploadedFileInfo, setUploadedFileInfo] = useState(null)
  const [pendingPaste, setPendingPaste] = useState('')
  const [fillingMessage, setFillingMessage] = useState('')
  const [textareaValue, setTextareaValue] = useState('')
  const [charCount, setCharCount] = useState(0)
  const pasteDebounceRef = useRef(null)
  const fileInputRef = useRef(null)

  function resetToIdle() {
    setWidgetState('IDLE')
    setIdentified(null)
    setFillResult(null)
    setErrorMsg('')
    setUploadedFileInfo(null)
    setPendingPaste('')
    setFillingMessage('')
    setTextareaValue('')
    setCharCount(0)
    if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current)
  }

  function minimise() {
    setPrevWidgetState(widgetState)
    setWidgetState('MINIMISED')
  }

  function handleTextareaInput(e) {
    const text = e.target.value
    setTextareaValue(text)
    setCharCount(text.length)
    if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current)
    if (text.trim().length >= 50) {
      pasteDebounceRef.current = setTimeout(() => {
        setPendingPaste(text.trim())
        setUploadedFileInfo(null)
        setWidgetState('IDENTIFYING')
        identifyPaste(text.trim())
      }, 800)
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text && text.trim().length > 0) {
        setTextareaValue(text)
        setCharCount(text.length)
        if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current)
        if (text.trim().length >= 50) {
          setPendingPaste(text.trim())
          setUploadedFileInfo(null)
          setWidgetState('IDENTIFYING')
          identifyPaste(text.trim())
        }
      }
    } catch (err) {
      console.error('[Widget] clipboard read failed:', err)
    }
  }

  async function handleFileSelected(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      setErrorMsg('Only PDF or Word files are supported.')
      setWidgetState('ERROR')
      return
    }
    setUploadedFileInfo({ filename: file.name, size: file.size })
    setWidgetState('IDENTIFYING')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const upRes = await fetch(`${BACKEND_URL}/api/claim/upload-files`, { method: 'POST', body: fd })
      if (!upRes.ok) throw new Error('Upload failed')
      const upData = await upRes.json()
      const info = { ...upData, filename: file.name, size: file.size }
      setUploadedFileInfo(info)

      const idRes = await fetch(`${BACKEND_URL}/api/claim/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [info] }),
      })
      if (!idRes.ok) throw new Error('Identify failed')
      const result = await idRes.json()
      setIdentified(result)
      setWidgetState('VERIFY')
    } catch (e) {
      setErrorMsg(e.message)
      setWidgetState('ERROR')
    }
  }

  async function identifyPaste(text) {
    try {
      const idRes = await fetch(`${BACKEND_URL}/api/claim/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastedText: text }),
      })
      if (!idRes.ok) throw new Error('Identify failed')
      const result = await idRes.json()
      setIdentified(result)
      setWidgetState('VERIFY')
    } catch (e) {
      setErrorMsg(e.message)
      setWidgetState('ERROR')
    }
  }

  async function startFilling() {
    setWidgetState('FILLING')
    setFillingMessage('Mapping prompt result to portal fields…')

    try {
      // Get cached OEM/prompt IDs from localStorage (best-effort)
      let oemId = null
      let promptId = null
      try {
        const stored = JSON.parse(localStorage.getItem('mpDefaults') || '{}')
        oemId = stored.oemId || null
        promptId = stored.promptId || null
      } catch {}

      // Fetch defaults if not cached
      if (!oemId) {
        try {
          const [oemsRes, promptsRes] = await Promise.all([
            fetch(`${BACKEND_URL}/api/oem/configs`),
            fetch(`${BACKEND_URL}/api/prompts`),
          ])
          const oems = await oemsRes.json()
          const prompts = await promptsRes.json()
          const terexOem = oems.find(o => {
            const label = `${o.name} ${o.brand || ''}`.toLowerCase()
            return TEREX_PORTAL_BRANDS.some(b => label.includes(b))
          }) || oems[0]
          const defaultPrompt = prompts.find(p => p.category === 'New Claim' && p.is_default && !p.brand)
          oemId = terexOem?.id || null
          promptId = defaultPrompt?.id || null
          localStorage.setItem('mpDefaults', JSON.stringify({ oemId, promptId }))
        } catch {}
      }

      const body = { oemConfigId: oemId, promptId: promptId || undefined }
      if (uploadedFileInfo?.r2_key) {
        body.files = [{ r2_key: uploadedFileInfo.r2_key, filename: uploadedFileInfo.filename, type: uploadedFileInfo.type || 'pdf', size: uploadedFileInfo.size }]
      } else if (pendingPaste) {
        body.pastedText = pendingPaste
      }

      const procRes = await fetch(`${BACKEND_URL}/api/claim/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!procRes.ok) throw new Error('Processing failed')
      const procData = await procRes.json()
      const portalOutput = procData.portalOutput || {}

      setFillingMessage('Filling portal fields…')
      const result = await fillProgressively(portalOutput)
      setFillResult(result)
      setWidgetState('SUCCESS')
    } catch (e) {
      setErrorMsg(e.message)
      setWidgetState('ERROR')
    }
  }

  async function fillProgressively(portalOutput) {
    let filled = 0
    let idx = 0

    for (const fieldId of PROMPT_RESULT_FILL_ORDER) {
      const value = portalOutput[fieldId]
      idx++
      if (!value) continue

      const el = document.getElementById(fieldId)
        || document.querySelector(`[name="${fieldId}"]`)
        || document.querySelector(`[data-field="${fieldId}"]`)

      if (!el) continue

      // Set native value so React's synthetic state also updates
      try {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
        if (setter) setter.call(el, value)
        else el.value = value
      } catch { el.value = value }

      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))

      // Yellow flash
      const origBg = el.style.background
      el.style.transition = 'background 0.15s ease-out'
      el.style.background = '#fef9c3'
      setTimeout(() => { el.style.background = origBg }, 600)

      filled++
      setFillingMessage(`Filling field ${idx} of ${PROMPT_RESULT_FILL_ORDER.length}…`)
      await new Promise(r => setTimeout(r, 300))
    }

    return { filled, total: PROMPT_RESULT_FILL_ORDER.length }
  }

  function handleDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelected(f)
  }

  const isLowConfidence = identified?.confidence === 'low'
  const isMedConfidence = identified?.confidence === 'medium'
  const isMismatch = identified?.brand && !isBrandMatch(identified.brand, PORTAL_NAME)
  const portalDisplay = PORTAL_NAME.toLowerCase().includes('terex')
    ? `${PORTAL_NAME} (Fuchs · Powerscreen · Terex)`
    : PORTAL_NAME

  if (widgetState === 'MINIMISED') {
    return (
      <div
        onClick={() => setWidgetState(prevWidgetState)}
        title="Expand Machinery Pilot widget"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 2147483647,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 16px',
          borderRadius: 18,
          background: '#1e3a5f',
          color: '#ffffff',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          userSelect: 'none',
          transition: 'background 150ms',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#162d4a'}
        onMouseLeave={e => e.currentTarget.style.background = '#1e3a5f'}
      >
        <span>⚡</span>
        <span>Fill Portal</span>
      </div>
    )
  }

  return (
    <div className={`mp-widget${isLowConfidence ? ' mp-warning-border' : ''}`}>
      {/* Header */}
      <div className="mp-header">
        <div className="mp-header-title">⚡ Machinery Pilot</div>
        <button className="mp-minimise-btn" onClick={minimise} title="Minimise">–</button>
      </div>

      {/* Body */}
      <div className="mp-body">
        {widgetState === 'IDLE' && (
          <>
            <div
              className="mp-drop-zone"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('mp-drag-over') }}
              onDragLeave={e => e.currentTarget.classList.remove('mp-drag-over')}
              onDrop={e => { e.currentTarget.classList.remove('mp-drag-over'); handleDrop(e) }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) handleFileSelected(e.target.files[0]) }}
              />
              <textarea
                className="mp-input-area"
                placeholder="Paste Prompt Result..."
                spellCheck={false}
                rows={4}
                value={textareaValue}
                onChange={handleTextareaInput}
                onKeyDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              />
            </div>
            {charCount > 0 && (
              <div className="mp-char-count">Read: {charCount} characters</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <button className="mp-paste-btn" onClick={handlePasteFromClipboard} title="Read text from clipboard">
                📋 Paste from clipboard
              </button>
              <button className="mp-browse-btn" onClick={() => fileInputRef.current?.click()} title="Browse for a file">
                📎 Browse file
              </button>
            </div>
            <div className="mp-portal-line" style={{ marginTop: 8 }}>
              Submitting to {PORTAL_NAME}
            </div>
          </>
        )}

        {widgetState === 'IDENTIFYING' && (
          <>
            <div className="mp-status">
              <span className="mp-spinner" /> Reading job card…
            </div>
            <div className="mp-status-sub">
              {uploadedFileInfo?.filename
                ? `${uploadedFileInfo.filename}${uploadedFileInfo.size ? ` · ${(uploadedFileInfo.size / 1024).toFixed(0)} KB` : ''}`
                : 'Pasted text'}
            </div>
          </>
        )}

        {widgetState === 'VERIFY' && identified && (
          <>
            <div className="mp-verify-title">
              Confirm before filling{isMedConfidence ? ' ●' : ''}:
            </div>
            {isMedConfidence && <div className="mp-confidence-note">Some fields may need a closer look</div>}
            {isLowConfidence && <div className="mp-confidence-note">Low confidence read — verify carefully before filling</div>}

            {[['Brand', identified.brand], ['Machine', identified.machine], ['Job no.', identified.jobNumber]].map(([label, value]) => (
              <div key={label} className="mp-verify-row">
                <span className="mp-verify-label">{label}:</span>
                <span className={`mp-verify-value${value ? '' : ' mp-empty'}`}>
                  {value || '— (not detected)'}
                </span>
              </div>
            ))}

            <div className={`mp-portal-line${isMismatch ? ' mp-mismatch' : ''}`}>
              {isMismatch
                ? `⚠ Submitting to ${portalDisplay} — but job card is ${identified.brand}`
                : `Submitting to ${portalDisplay}`}
            </div>

            <div className="mp-btn-row">
              <button className="mp-btn mp-btn-clear" onClick={resetToIdle}>✕ Clear</button>
              <button className="mp-btn mp-btn-fill" onClick={startFilling}>✓ Fill Portal</button>
            </div>
          </>
        )}

        {widgetState === 'FILLING' && (
          <div className="mp-status">
            <span className="mp-spinner" /> {fillingMessage || 'Mapping…'}
          </div>
        )}

        {widgetState === 'SUCCESS' && fillResult && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <span className="mp-success-icon">✓</span>
              <span className="mp-success-count">Filled {fillResult.filled} of {fillResult.total} fields</span>
            </div>
            <div className="mp-success-sub">Review the form, then submit it in the portal.</div>
            <div className="mp-btn-row" style={{ marginTop: 14 }}>
              <button className="mp-btn mp-btn-neutral" onClick={resetToIdle}>↺ Reset for next claim</button>
            </div>
          </>
        )}

        {widgetState === 'ERROR' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <span className="mp-error-icon">✗</span>
              <span style={{ fontWeight: 600, color: '#dc2626' }}>Couldn't process this input</span>
            </div>
            <div className="mp-error-sub">{errorMsg || 'Try a clearer file or paste the text manually.'}</div>
            <div className="mp-btn-row" style={{ marginTop: 14 }}>
              <button className="mp-btn mp-btn-neutral" onClick={resetToIdle}>↺ Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
