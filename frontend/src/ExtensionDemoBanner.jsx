import { useState, useEffect } from 'react'

const DISMISS_KEY = 'mp_demo_banner_dismissed'
const BANNER_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"

function ChromeLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="20" fill="#fff"/>
      <path d="M24 4a20 20 0 0 1 17.32 10H24a10 10 0 0 0-9.06 5.78L7.86 11.4A20 20 0 0 1 24 4z" fill="#ea4335"/>
      <path d="M44 24a20 20 0 0 1-9.66 17.13l-7.08-12.27A10 10 0 0 0 32 24a10 10 0 0 0-1.32-5h13.05A20 20 0 0 1 44 24z" fill="#34a853"/>
      <path d="M24 44a20 20 0 0 1-16.14-8.13L14.94 23.6A10 10 0 0 0 24 34a10 10 0 0 0 5.66-1.74L36.66 44.5A20 20 0 0 1 24 44z" fill="#fbbc04"/>
      <circle cx="24" cy="24" r="8" fill="#4285f4"/>
    </svg>
  )
}

function EdgeLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M44 24c0-11.05-8.95-20-20-20S4 12.95 4 24c0 1.4.14 2.77.42 4.1C7.6 21.07 14.85 16 23.5 16c5.6 0 10.6 2.13 14.42 5.6C39.31 19.4 39.5 17.13 39.5 17.13c0-1.5-.5-2.5-.5-2.5C40.95 17.5 44 20.5 44 24z" fill="#0078d4"/>
      <path d="M40 24c0 11.05-8.95 20-20 20-3.7 0-7.16-1-10.13-2.74C12.5 39 16 35.7 16 31c0-5-4-9-9-9-1.4 0-2.74.32-3.94.9C4.65 13.1 13.5 4 24 4c11.05 0 20 8.95 20 20z" fill="#00bcf2"/>
    </svg>
  )
}

const installBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 14px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: BANNER_FONT,
  fontWeight: 500,
  color: '#374151',
  textDecoration: 'none',
  background: '#ffffff',
  cursor: 'pointer',
}

function EmailLink() {
  const [underline, setUnderline] = useState(false)
  return (
    <a
      href="mailto:hello@machinerypilot.com"
      style={{ color: '#2563eb', textDecoration: underline ? 'underline' : 'none' }}
      onMouseEnter={() => setUnderline(true)}
      onMouseLeave={() => setUnderline(false)}
    >
      hello@machinerypilot.com
    </a>
  )
}

function ModalEmailLink() {
  const [underline, setUnderline] = useState(false)
  return (
    <a
      href="mailto:hello@machinerypilot.com"
      style={{ color: '#2563eb', textDecoration: underline ? 'underline' : 'none' }}
      onMouseEnter={() => setUnderline(true)}
      onMouseLeave={() => setUnderline(false)}
    >
      hello@machinerypilot.com
    </a>
  )
}

export default function ExtensionDemoBanner() {
  const [visible, setVisible] = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (!dismissed) setVisible(true)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  function handleInstallClick(e) {
    e.preventDefault()
    setShowModal(true)
  }

  if (!visible) return null

  return (
    <>
      <div style={{
        background: '#f5f7fa',
        border: '1px solid #d1d5db',
        borderRadius: 8,
        padding: '14px 20px',
        marginBottom: 24,
        fontSize: 15,
        fontFamily: BANNER_FONT,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: '#4b5563',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <span style={{ marginRight: 6 }}>ℹ</span>
          <strong>This is a demo.</strong>{' '}When used on your OEM portals, the widget in the lower right-hand corner will appear in your Chrome or Edge browser. Learn how we help teams submit claims faster and recover more value. Email <EmailLink />.
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="#" onClick={handleInstallClick} style={installBtnStyle}>
              <ChromeLogo /> Install for Chrome
            </a>
            <a href="#" onClick={handleInstallClick} style={installBtnStyle}>
              <EdgeLogo /> Install for Edge
            </a>
          </div>
        </div>
        <button
          onClick={dismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#9ca3af',
            fontSize: 18,
            fontFamily: BANNER_FONT,
            lineHeight: 1,
            padding: '2px 4px',
            flexShrink: 0,
          }}
          title="Dismiss"
        >✕</button>
      </div>

      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 32, maxWidth: 460, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F3C', marginBottom: 16 }}>Coming soon</div>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#4b5563', lineHeight: 1.5, marginBottom: 24 }}>
              Learn about our Google Chrome and Microsoft Edge integrations. Faster submissions. Lower warranty WIP. Higher recovery rate. Email{' '}
              <ModalEmailLink />.
            </p>
            <button onClick={() => setShowModal(false)} style={{ background: '#16a34a', color: '#fff', width: '100%', height: 36, border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
