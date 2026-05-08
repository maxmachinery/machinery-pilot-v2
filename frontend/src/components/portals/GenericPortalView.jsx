import { useState } from 'react'

// Group fields by section
function groupBySection(fields) {
  const sections = []
  const seen = {}
  for (const f of fields) {
    const sec = f.section || 'General'
    if (!seen[sec]) {
      seen[sec] = { section: sec, fields: [] }
      sections.push(seen[sec])
    }
    seen[sec].fields.push(f)
  }
  return sections
}

export default function GenericPortalView({ portalOutput = {}, portalFields = [], onChange }) {
  const [copied, setCopied] = useState(null)

  if (!portalFields || portalFields.length === 0) {
    return (
      <div className="card" style={{ padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--grey-muted)', lineHeight: 1.6 }}>
          No portal schema defined for this OEM.
          Go to Portal Setup to generate a portal schema from a screenshot.
        </div>
      </div>
    )
  }

  const sections = groupBySection(portalFields)

  function copyField(fieldId, value) {
    navigator.clipboard.writeText(value || '').catch(() => {})
    setCopied(fieldId)
    setTimeout(() => setCopied(null), 1500)
  }

  function renderInput(field) {
    const value = portalOutput[field.fieldId] || ''
    const handleChange = onChange ? (e) => onChange(field.fieldId, e.target.value) : undefined

    const baseStyle = {
      width: '100%',
      padding: '8px 10px',
      border: '1.5px solid var(--grey-border)',
      borderRadius: 6,
      fontSize: 13,
      fontFamily: 'inherit',
      color: 'var(--text)',
      background: '#fff',
      boxSizing: 'border-box',
      outline: 'none',
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={handleChange}
          readOnly={!onChange}
          style={{ ...baseStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
        />
      )
    }
    if (field.type === 'date') {
      return (
        <input
          type="date"
          value={value}
          onChange={handleChange}
          readOnly={!onChange}
          style={baseStyle}
        />
      )
    }
    if (field.type === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={handleChange}
          readOnly={!onChange}
          style={baseStyle}
        />
      )
    }
    return (
      <input
        type="text"
        value={value}
        onChange={handleChange}
        readOnly={!onChange}
        style={baseStyle}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sections.map(sec => (
        <div key={sec.section} className="card" style={{ padding: '18px 20px' }}>
          <div style={{
            fontFamily: 'Barlow, sans-serif',
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--navy)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            marginBottom: 14,
            paddingBottom: 8,
            borderBottom: '1.5px solid var(--grey-border)',
          }}>
            {sec.section}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px 20px' }}>
            {sec.fields.map(field => (
              <div key={field.fieldId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--navy)',
                    textTransform: 'uppercase',
                    letterSpacing: '.05em',
                  }}>
                    {field.name}
                    {field.required && <span style={{ color: 'var(--crit)', marginLeft: 2 }}>*</span>}
                  </label>
                  <button
                    onClick={() => copyField(field.fieldId, portalOutput[field.fieldId] || '')}
                    title="Copy to clipboard"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: copied === field.fieldId ? 'var(--ok)' : 'var(--grey-muted)',
                      padding: '0 2px',
                      lineHeight: 1,
                    }}
                  >
                    {copied === field.fieldId ? '✓' : '📋'}
                  </button>
                </div>
                {renderInput(field)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
