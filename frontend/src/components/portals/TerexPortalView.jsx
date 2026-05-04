import { useState, useEffect, useRef } from 'react'

// ── Tokens ───────────────────────────────────────────────────────────────────
const FONT       = "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif"
const LBL_DEF    = '#3a5a87'
const LBL_EMPH   = '#0000FF'
const BORDER_DEF = '#cbd5e0'
const BORDER_RED = '#c53030'
const BG          = '#F5F5F5'
const BG_WHITE    = '#ffffff'
const TAB_INACT   = '#5b7d9d'
const INFO_ICON   = '#3182ce'
const TEXT_INPUT  = '#2d3748'
const NO_SEL      = { userSelect: 'none', WebkitUserSelect: 'none' }

const RED_FIELDS = new Set([
  'customer_name', 'serial_no',
  'application', 'hours_run', 'helpdesk_ref', 'dealer_ref',
  'repair_date', 'description', 'suspect_cause', 'action_taken',
])
const EMPH_FIELDS = new Set(['customer_name', 'serial_no'])
const DATE_FIELDS = new Set(['registration_date', 'failure_date', 'repair_date', 'submitted_date', 'date_closed'])

const DETAILS_FIELDS = [
  ['Customer Name',      'customer_name'     ],
  ['Customer No.',       'customer_no'       ],
  ['Tax No.',            'tax_no'            ],
  ['Site Address',       'site_address'      ],
  ['Product',            'product'           ],
  ['Serial No.',         'serial_no'         ],
  ['Settings',           'settings'          ],
  ['Application',        'application'       ],
  ['Engine SN',          'engine_sn'         ],
  ['Hours Run',          'hours_run'         ],
  ['HelpDesk Ref',       'helpdesk_ref'      ],
  ['Dealer Ref',         'dealer_ref'        ],
  ['Registration Date',  'registration_date' ],
  ['Failure Date',       'failure_date'      ],
  ['Repair Date',        'repair_date'       ],
  ['Submitted Date',     'submitted_date'    ],
  ['Date Closed',        'date_closed'       ],
  ['Description',        'description'       ],
  ['Suspect Cause',      'suspect_cause'     ],
  ['Action Taken',       'action_taken'      ],
]

const ALL_FIELDS = [
  { id: 'claim_id',          label: 'Claim ID'         },
  { id: 'type',              label: 'Type'              },
  { id: 'dealer',            label: 'Dealer'            },
  { id: 'brand',             label: 'Brand'             },
  { id: 'model',             label: 'Model'             },
  { id: 'currency',          label: 'Currency'          },
  { id: 'submitted_total',   label: 'Submitted Total'   },
  { id: 'total_paid',        label: 'Total Paid'        },
  { id: 'customer_name',     label: 'Customer Name'     },
  { id: 'customer_no',       label: 'Customer No.'      },
  { id: 'tax_no',            label: 'Tax No.'           },
  { id: 'site_address',      label: 'Site Address'      },
  { id: 'product',           label: 'Product'           },
  { id: 'serial_no',         label: 'Serial No.'        },
  { id: 'settings',          label: 'Settings'          },
  { id: 'application',       label: 'Application'       },
  { id: 'engine_sn',         label: 'Engine SN'         },
  { id: 'hours_run',         label: 'Hours Run'         },
  { id: 'helpdesk_ref',      label: 'HelpDesk Ref'      },
  { id: 'dealer_ref',        label: 'Dealer Ref'        },
  { id: 'registration_date', label: 'Registration Date' },
  { id: 'failure_date',      label: 'Failure Date'      },
  { id: 'repair_date',       label: 'Repair Date'       },
  { id: 'submitted_date',    label: 'Submitted Date'    },
  { id: 'date_closed',       label: 'Date Closed'       },
  { id: 'description',       label: 'Description'       },
  { id: 'suspect_cause',     label: 'Suspect Cause'     },
  { id: 'action_taken',      label: 'Action Taken'      },
]

function ddmmyyyyToISO(s) {
  if (!s) return ''
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s
}

// ── Style helpers — ALL labels use fontWeight 700 uniformly ──────────────────
function lblSty(id) {
  return {
    fontSize: 11, fontFamily: FONT, fontWeight: 700,
    textAlign: 'right', lineHeight: '26px',
    color: EMPH_FIELDS.has(id) ? LBL_EMPH : LBL_DEF,
    minWidth: 110, flexShrink: 0,
    ...NO_SEL,
  }
}

function inpSty(id, extra = {}) {
  return {
    height: 26, padding: '4px 8px', boxSizing: 'border-box',
    border: `1px solid ${RED_FIELDS.has(id) ? BORDER_RED : BORDER_DEF}`,
    borderRadius: 0, fontSize: 12, fontFamily: FONT,
    color: TEXT_INPUT, background: BG_WHITE, outline: 'none',
    ...extra,
  }
}

// ── White separator between sections ─────────────────────────────────────────
const WhiteGap = () => <div style={{ height: 5, background: BG_WHITE }} />

// ── Text field ────────────────────────────────────────────────────────────────
function F({ id, label, value, onChange, readOnly }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <label style={lblSty(id)}>{label}</label>
      <input
        type="text" value={value ?? ''}
        onChange={readOnly ? undefined : e => onChange(id, e.target.value)}
        readOnly={readOnly}
        style={{ ...inpSty(id), flex: 1, minWidth: 0 }}
      />
    </div>
  )
}

// ── Date field ────────────────────────────────────────────────────────────────
function FDate({ id, label, value, onChange, readOnly }) {
  const border = `1px solid ${RED_FIELDS.has(id) ? BORDER_RED : BORDER_DEF}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <label style={lblSty(id)}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <input
          type="text" value={value ?? ''}
          onChange={readOnly ? undefined : e => onChange(id, e.target.value)}
          readOnly={readOnly}
          style={{ ...inpSty(id), width: 96, borderRight: 'none' }}
        />
        <div style={{
          position: 'relative', width: 22, height: 26, flexShrink: 0,
          border, borderLeft: 'none', background: '#ebebeb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', cursor: readOnly ? 'default' : 'pointer',
        }}>
          <span style={{ fontSize: 11, lineHeight: 1, pointerEvents: 'none', ...NO_SEL }}>🗓</span>
          {!readOnly && (
            <input
              type="date"
              onChange={e => onChange(id, e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
              tabIndex={-1}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Multiline textarea ────────────────────────────────────────────────────────
function FM({ id, label, value, onChange, readOnly }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%' }}>
      <label style={{ ...lblSty(id), paddingTop: 4, lineHeight: '18px' }}>{label}</label>
      <textarea
        value={value ?? ''}
        onChange={readOnly ? undefined : e => onChange(id, e.target.value)}
        readOnly={readOnly}
        style={{
          flex: 1, height: 52, minWidth: 0,
          border: `1px solid ${RED_FIELDS.has(id) ? BORDER_RED : BORDER_DEF}`,
          borderRadius: 0, fontSize: 12, fontFamily: FONT,
          color: TEXT_INPUT, background: BG_WHITE,
          padding: '4px 8px', resize: readOnly ? 'none' : 'vertical',
          lineHeight: 1.5, outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ── Row wrapper ───────────────────────────────────────────────────────────────
function Row({ children, cols, style = {} }) {
  return (
    <div style={{
      display: cols ? 'grid' : 'flex',
      gridTemplateColumns: cols,
      gap: '6px 24px',
      padding: '10px 12px',
      background: BG,
      alignItems: 'center',
      flexWrap: 'wrap',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TerexPortalView({ data = {}, onReset, claimId, onStatusChange }) {
  function buildInit(d) {
    const init = {}
    ALL_FIELDS.forEach(f => {
      if (f.id === 'claim_id') { init[f.id] = ''; return }
      const raw = d[f.id] ?? ''
      init[f.id] = DATE_FIELDS.has(f.id) ? ddmmyyyyToISO(raw) : raw
    })
    return init
  }

  const [fields,     setFields]     = useState(() => buildInit(data))
  const [activeTab,  setActiveTab]  = useState('details')
  const [ctaStatus,  setCtaStatus]  = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const saveTimeoutRef = useRef(null)

  // Reset fields if claimId changes (e.g. navigating between claims)
  useEffect(() => {
    setFields(buildInit(data))
  }, [claimId]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateField(id, val) {
    const newFields = { ...fields, [id]: val }
    setFields(newFields)

    if (!claimId) return

    setSaveStatus('Saving…')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/claims/${claimId}/portal-output`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portal_output: newFields }),
        })
        if (!res.ok) throw new Error('Save failed')
        setSaveStatus('✓ Saved')
        setTimeout(() => setSaveStatus(''), 1500)
      } catch (err) {
        console.error('Autosave failed:', err)
        setSaveStatus('Save failed — retry')
      }
    }, 600)
  }

  const fp = { onChange: updateField }

  const DETAILS_FIELDS_ORDER = [
    'customer_name', 'customer_no', 'tax_no', 'site_address',
    'product', 'serial_no', 'settings', 'application', 'engine_sn',
    'hours_run', 'helpdesk_ref', 'dealer_ref',
    'registration_date', 'failure_date', 'repair_date', 'submitted_date', 'date_closed',
    'description', 'suspect_cause', 'action_taken',
  ]

  async function copyDemoField() {
    const value = (fields.action_taken ?? '').toString()

    if (!value.trim()) {
      setCtaStatus('No Action Taken text to copy')
      setTimeout(() => setCtaStatus(''), 2500)
      return
    }

    try {
      await navigator.clipboard.writeText(value)

      if (claimId) {
        await fetch(`/api/claims/${claimId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'copied_to_oem_portal' }),
        })
        onStatusChange?.('copied_to_oem_portal')
      }

      setCtaStatus('✓ Action Taken copied — paste into Terex portal')
      setTimeout(() => setCtaStatus(''), 3000)
    } catch (err) {
      console.error('Clipboard write failed:', err)
      setCtaStatus('Copy failed — check browser permissions')
    }
  }

  const TABS = [
    { id: 'details',  label: 'Details'      },
    { id: 'parts',    label: 'Parts 0'      },
    { id: 'labour',   label: 'Labour 0'     },
    { id: 'accounts', label: 'Accounts'     },
    { id: 'comments', label: 'Comments 0/0' },
  ]

  const staticInp = {
    height: 26, padding: '4px 8px', boxSizing: 'border-box',
    border: `1px solid ${BORDER_DEF}`, borderRadius: 0,
    fontSize: 12, fontFamily: FONT, color: TEXT_INPUT,
    background: BG_WHITE, outline: 'none',
  }

  return (
    <div>
      {/* ── Workflow caption ─────────────────────────────────────────────── */}
      <div style={{
        fontSize: 12, fontFamily: FONT, color: '#374151', marginBottom: 10,
        padding: '8px 12px', background: '#f0f9ff',
        border: '1px solid #bae6fd', borderRadius: 6, ...NO_SEL,
      }}>
        Review the extracted data below and edit any field if needed.
        Then click <strong>Copy-Paste to Portal</strong> to copy the key fields ready to paste.
      </div>

      {/* ── Portal canvas ────────────────────────────────────────────────── */}
      <div style={{ width: 1400, fontFamily: FONT, fontSize: 12, border: '1px solid #b0b0b0', background: BG }}>

          {/* ── Title bar ────────────────────────────────────────────────── */}
          <div style={{
            background: '#1e6091', color: '#fff', padding: '5px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            ...NO_SEL,
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT }}>Terex MP — Warranty Claim</span>
              {saveStatus && (
                <span style={{
                  fontSize: 11, fontFamily: FONT, marginLeft: 12,
                  color: saveStatus.includes('✓') ? '#86efac' : saveStatus.includes('failed') ? '#fca5a5' : '#d1d5db',
                }}>
                  {saveStatus}
                </span>
              )}
            </div>
            {onReset && (
              <button
                onClick={onReset}
                style={{
                  background: '#3B9B53', border: 'none', color: '#fff',
                  padding: '8px 18px', fontSize: 12, fontFamily: FONT,
                  fontWeight: 700, cursor: 'pointer', borderRadius: 4,
                  transition: 'background .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2f7d42' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#3B9B53' }}
              >+ New Claim</button>
            )}
          </div>

          {/* ── Metadata block ───────────────────────────────────────────── */}
          <div style={{ padding: '8px 12px', background: BG }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px 24px', marginBottom: 6, alignItems: 'center',
            }}>
              <F id="claim_id" label="Claim ID" value={fields.claim_id} {...fp} />
              <F id="type"     label="Type"     value={fields.type}     {...fp} />
              <F id="dealer"   label="Dealer"   value={fields.dealer}   {...fp} />
              <F id="brand"    label="Brand"    value={fields.brand}    {...fp} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <label style={lblSty('model')}>Model</label>
                <input
                  type="text" value={fields.model ?? ''}
                  onChange={e => updateField('model', e.target.value)}
                  style={{ ...inpSty('model'), flex: 1, minWidth: 0 }}
                />
                <div style={{
                  width: 15, height: 15, borderRadius: '50%', background: INFO_ICON,
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...NO_SEL,
                }}>
                  <span style={{ color: '#fff', fontSize: 9, fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: 1 }}>i</span>
                </div>
              </div>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px 24px', alignItems: 'center',
            }}>
              <F id="currency"        label="Currency"        value={fields.currency}        {...fp} />
              <F id="submitted_total" label="Submitted Total" value={fields.submitted_total} {...fp} />
              <F id="total_paid"      label="Total Paid"      value={fields.total_paid}      {...fp} />
              <div /><div />
            </div>
          </div>

          {/* ── White gap after metadata ──────────────────────────────────── */}
          <WhiteGap />

          {/* ── Action bar ───────────────────────────────────────────────── */}
          <div style={{
            padding: '8px 12px', background: BG,
            display: 'flex', alignItems: 'center', gap: 8, ...NO_SEL,
          }}>
            <span style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: LBL_DEF }}>Action</span>
            <input type="text" readOnly value="Requestor Action Needed" style={{ ...staticInp, width: 210 }} />
            <span style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: LBL_EMPH, marginLeft: 16 }}>Status (1)</span>
            <input type="text" readOnly value="Draft" style={{ ...staticInp, width: 100 }} />
          </div>

          {/* ── White gap after action bar ────────────────────────────────── */}
          <WhiteGap />

          {/* ── Tab bar (no bottom border) ────────────────────────────────── */}
          <div style={{ display: 'flex', background: BG_WHITE, ...NO_SEL }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                fontSize: 12, fontFamily: FONT,
                padding: '6px 22px',
                border: 'none', borderRight: `1px solid #c8c8c8`,
                borderRadius: '3px 3px 0 0',
                cursor: 'pointer',
                background: activeTab === tab.id ? BG : TAB_INACT,
                fontWeight: activeTab === tab.id ? 700 : 400,
                color: activeTab === tab.id ? '#1a1a1a' : '#fff',
                ...NO_SEL,
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Details tab ──────────────────────────────────────────────── */}
          {activeTab === 'details' && (
            <div>
              <Row cols="repeat(4, 1fr)">
                <F id="customer_name" label="Customer Name" value={fields.customer_name} {...fp} />
                <F id="customer_no"   label="Customer No."  value={fields.customer_no}   {...fp} />
                <F id="tax_no"        label="Tax No."       value={fields.tax_no}        {...fp} />
                <F id="site_address"  label="Site Address"  value={fields.site_address}  {...fp} />
              </Row>
              <Row cols="repeat(5, 1fr)">
                <F id="product"     label="Product"     value={fields.product}     {...fp} />
                <F id="serial_no"   label="Serial No."  value={fields.serial_no}   {...fp} />
                <F id="settings"    label="Settings"    value={fields.settings}    {...fp} />
                <F id="application" label="Application" value={fields.application} {...fp} />
                <F id="engine_sn"   label="Engine SN"   value={fields.engine_sn}   {...fp} />
              </Row>
              <Row>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={lblSty('hours_run')}>Hours Run</label>
                  <input type="text" value={fields.hours_run ?? ''}
                    onChange={e => updateField('hours_run', e.target.value)}
                    style={{ ...inpSty('hours_run'), width: 90 }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                  <label style={lblSty('helpdesk_ref')}>HelpDesk Ref</label>
                  <input type="text" value={fields.helpdesk_ref ?? ''}
                    onChange={e => updateField('helpdesk_ref', e.target.value)}
                    style={{ ...inpSty('helpdesk_ref'), width: 280 }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                  <label style={lblSty('dealer_ref')}>Dealer Ref</label>
                  <input type="text" value={fields.dealer_ref ?? ''}
                    onChange={e => updateField('dealer_ref', e.target.value)}
                    style={{ ...inpSty('dealer_ref'), width: 280 }}
                  />
                </div>
              </Row>
              <Row>
                <FDate id="registration_date" label="Registration Date" value={fields.registration_date} {...fp} />
                <FDate id="failure_date"      label="Failure Date"      value={fields.failure_date}      {...fp} />
                <FDate id="repair_date"       label="Repair Date"       value={fields.repair_date}       {...fp} />
                <FDate id="submitted_date"    label="Submitted Date"    value={fields.submitted_date}    {...fp} />
                <FDate id="date_closed"       label="Date Closed"       value={fields.date_closed}       {...fp} />
              </Row>
              <Row><FM id="description"   label="Description"   value={fields.description}   {...fp} /></Row>
              <Row><FM id="suspect_cause" label="Suspect Cause" value={fields.suspect_cause} {...fp} /></Row>
              <Row><FM id="action_taken"  label="Action Taken"  value={fields.action_taken}  {...fp} /></Row>
            </div>
          )}

          {activeTab !== 'details' && (
            <div style={{ padding: 20, color: '#9ca3af', fontSize: 12, fontFamily: FONT, background: BG_WHITE, ...NO_SEL }}>
              No {TABS.find(t => t.id === activeTab)?.label} entries.
            </div>
          )}

          {/* ── Footer: Copy-Paste CTA ────────────────────────────────────── */}
          <div style={{
            background: BG_WHITE, padding: '10px 12px',
            borderTop: '1px solid #d0d0d0',
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
            ...NO_SEL,
          }}>
            {ctaStatus && (
              <span style={{
                fontSize: 12, fontFamily: FONT, fontWeight: 600,
                color: ctaStatus.startsWith('✓') ? '#16a34a' : '#dc2626',
              }}>
                {ctaStatus}
              </span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <button
                onClick={copyDemoField}
                style={{
                  background: '#FF8300', color: '#fff', border: 'none',
                  padding: '12px 24px', fontSize: 14, fontFamily: FONT, fontWeight: 700,
                  letterSpacing: '0.05em', cursor: 'pointer', borderRadius: 4,
                  transition: 'background .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#E07500' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FF8300' }}
              >
                Copy-Paste set fields to Terex Portal
              </button>
              <span style={{
                fontSize: 11, fontFamily: FONT, color: '#6B7280',
                fontStyle: 'italic', marginTop: 4, textAlign: 'right',
              }}>
                Disclaimer: Set field Action Taken only for demo purposes
              </span>
            </div>
          </div>

      </div>
    </div>
  )
}
