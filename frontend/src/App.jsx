import TerexPortalMock from './TerexPortalMock.jsx'
import Widget from './widget/Widget.jsx'
import ExtensionDemoBanner from './ExtensionDemoBanner.jsx'

export default function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '40px' }}>
      <ExtensionDemoBanner />
      <TerexPortalMock />
      <Widget />
    </div>
  )
}
