import { useState, useEffect } from 'react'
import TerexPortalMock from './TerexPortalMock.jsx'
import Widget from './widget/Widget.jsx'
import ExtensionDemoBanner from './ExtensionDemoBanner.jsx'

const DESIGN_WIDTH = 1400   // native pixel width of the Terex portal mock
const H_PADDING    = 80     // 40px each side from the outer wrapper

function usePortalScale() {
  const [scale, setScale] = useState(() =>
    Math.min(1, (window.innerWidth - H_PADDING) / DESIGN_WIDTH)
  )
  useEffect(() => {
    function update() {
      setScale(Math.min(1, (window.innerWidth - H_PADDING) / DESIGN_WIDTH))
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return scale
}

export default function App() {
  const scale = usePortalScale()

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '40px' }}>
      <ExtensionDemoBanner />
      <div style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 14,
        color: '#4b5563',
        margin: '0 0 16px',
        lineHeight: 1.6,
      }}>
        <div>⏱ Watch how our AI helps fill warranty claims in seconds.</div>
        <div style={{ marginTop: 2, color: '#6b7280' }}>Try it: paste a sample warranty job card extraction into the widget below.</div>
      </div>
      {/* Scaling wrapper — shrinks portal to fit viewport, never enlarges */}
      <div style={{
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        width: DESIGN_WIDTH,
        // Collapse the scaled element's layout footprint so it doesn't leave empty space
        height: 0,
      }}>
        <TerexPortalMock />
      </div>
      {/* Spacer: reserves the visual height the scaled portal actually occupies */}
      <PortalSpacer scale={scale} />
      <Widget />
    </div>
  )
}

// Measures the scaled portal's rendered height and reserves that space below
function PortalSpacer({ scale }) {
  const [height, setHeight] = useState(900)
  useEffect(() => {
    // Approximate: the Terex form is ~900px tall at design size
    setHeight(Math.round(900 * scale))
  }, [scale])
  return <div style={{ height }} />
}
