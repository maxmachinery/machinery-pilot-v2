import { useState } from 'react'
import OEMEngine    from './components/OEMEngine.jsx'
import JobCardUpload from './components/JobCardUpload.jsx'
import ReviewStep   from './components/ReviewStep.jsx'
import ExportStep   from './components/ExportStep.jsx'

const STEPS = [
  { n: 1, label: 'OEM Policy'  },
  { n: 2, label: 'Job Card'    },
  { n: 3, label: 'Review'      },
  { n: 4, label: 'Export'      },
]

export default function App() {
  const [step,        setStep]        = useState(1)
  const [oemConfig,   setOemConfig]   = useState(null)
  const [sessionId,   setSessionId]   = useState(null)
  const [sessionData, setSessionData] = useState(null)

  function goOem(cfg) {
    setOemConfig(cfg)
    setStep(2)
  }

  function goReview(id, data) {
    setSessionId(id)
    setSessionData(data)
    setStep(3)
  }

  function goExport(updated) {
    setSessionData(updated)
    setStep(4)
  }

  function reset() {
    setStep(1)
    setOemConfig(null)
    setSessionId(null)
    setSessionData(null)
  }

  return (
    <div className="shell">
      <header className="hdr">
        <div className="hdr-logo">
          <span className="hdr-logo-title">Warranty Enrichment Engine</span>
          <span className="hdr-logo-sub">Blue Group</span>
        </div>
        <nav className="steps">
          {STEPS.map(s => {
            const done   = step > s.n
            const active = step === s.n
            return (
              <div key={s.n} className="step">
                <div className={`step-num ${active ? 'active' : done ? 'done' : ''}`}>
                  {done ? '✓' : s.n}
                </div>
                <span className={`step-lbl ${active ? 'active' : done ? 'done' : ''}`}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </nav>
      </header>

      <main className="main">
        {step === 1 && <OEMEngine    onConfirm={goOem} />}
        {step === 2 && <JobCardUpload oemConfig={oemConfig} onDone={goReview} onBack={() => setStep(1)} />}
        {step === 3 && <ReviewStep   sessionId={sessionId} sessionData={sessionData} onDone={goExport} onBack={() => setStep(2)} />}
        {step === 4 && <ExportStep   sessionId={sessionId} sessionData={sessionData} oemConfig={oemConfig} onReset={reset} />}
      </main>
    </div>
  )
}
