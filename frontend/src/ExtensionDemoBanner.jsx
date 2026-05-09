import { useState, useEffect } from 'react'

const DISMISS_KEY = 'mp_demo_banner_dismissed'

export default function ExtensionDemoBanner() {
  const [visible, setVisible] = useState(false)

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
    alert('Coming soon — the extension will be available on the Chrome Web Store and Edge Add-ons.')
  }

  if (!visible) return null

  return (
    <div style={{
      background: '#f5f7fa',
      border: '1px solid #d1d5db',
      borderRadius: 8,
      padding: '12px 20px',
      marginBottom: 24,
      fontSize: 13,
      color: '#4b5563',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <div style={{ flex: 1 }}>
        <span style={{ marginRight: 6 }}>ℹ</span>
        <strong>This is a demo.</strong> The widget below will appear in your browser as a Chrome or Edge extension when used on your actual Terex Portal.
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href="#"
            onClick={handleInstallClick}
            style={{
              display: 'inline-block',
              padding: '5px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 12,
              color: '#374151',
              textDecoration: 'none',
              background: '#ffffff',
            }}
          >Install for Chrome</a>
          <a
            href="#"
            onClick={handleInstallClick}
            style={{
              display: 'inline-block',
              padding: '5px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 12,
              color: '#374151',
              textDecoration: 'none',
              background: '#ffffff',
            }}
          >Install for Edge</a>
        </div>
      </div>
      <button
        onClick={dismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#9ca3af',
          fontSize: 16,
          lineHeight: 1,
          padding: '2px 4px',
          flexShrink: 0,
        }}
        title="Dismiss"
      >✕</button>
    </div>
  )
}
