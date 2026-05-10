import { useState } from 'react'

// ── Tokens ────────────────────────────────────────────────────────────────────
const FONT       = "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif"
const LBL_DEF    = '#3a5a87'
const LBL_EMPH   = '#0000FF'
const BORDER_DEF = '#cbd5e0'
const BORDER_RED = '#c53030'
const BG         = '#ececec'
const BG_WHITE   = '#ffffff'
const TAB_INACT  = '#5b7d9d'
const INFO_ICON  = '#3182ce'
const TEXT_INPUT = '#2d3748'
const NO_SEL     = { userSelect: 'none', WebkitUserSelect: 'none' }

const REQUIRED_FIELDS = new Set([
  'application', 'hours_run', 'helpdesk_ref', 'dealer_ref',
  'repair_date', 'description', 'suspect_cause', 'action_taken',
])

function borderFor(id, fields) {
  if (REQUIRED_FIELDS.has(id) && !fields[id]) return `1px solid ${BORDER_RED}`
  return `1px solid ${BORDER_DEF}`
}

// ── Info icon ─────────────────────────────────────────────────────────────────
function InfoIcon() {
  return (
    <div style={{
      width: 15, height: 15, borderRadius: '50%', background: INFO_ICON,
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...NO_SEL,
    }} title="Info">
      <span style={{ color: '#fff', fontSize: 9, fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: 1 }}>i</span>
    </div>
  )
}

// ── Text field ────────────────────────────────────────────────────────────────
function F({ id, label, fields, setFields, labelColor, extra }) {
  const border = borderFor(id, fields)
  return (
    <div>
      <div style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: labelColor || LBL_DEF, marginBottom: 2, ...NO_SEL }}>
        {label}
      </div>
      <input
        id={id}
        value={fields[id] || ''}
        onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
        style={{
          width: '100%', height: 26, padding: '4px 8px', boxSizing: 'border-box',
          border, borderRadius: 0, fontSize: 12, fontFamily: FONT,
          color: TEXT_INPUT, background: BG_WHITE, outline: 'none',
          ...(extra || {}),
        }}
      />
    </div>
  )
}

// ── Textarea field ────────────────────────────────────────────────────────────
function TA({ id, label, fields, setFields, rows = 3 }) {
  const border = borderFor(id, fields)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: LBL_DEF, marginBottom: 2, ...NO_SEL }}>{label}</div>
      <textarea
        id={id}
        rows={rows}
        value={fields[id] || ''}
        onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
        style={{
          width: '100%', padding: '4px 8px', boxSizing: 'border-box',
          border, borderRadius: 0, fontSize: 12, fontFamily: FONT,
          color: TEXT_INPUT, background: BG_WHITE, outline: 'none', resize: 'vertical',
        }}
      />
    </div>
  )
}

// ── Date field (text input + calendar icon) ───────────────────────────────────
function FDate({ id, label, fields, setFields }) {
  const border = borderFor(id, fields)
  return (
    <div>
      <div style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: LBL_DEF, marginBottom: 2, ...NO_SEL }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <input
          id={id}
          type="text"
          value={fields[id] || ''}
          onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
          style={{
            height: 26, padding: '4px 8px', boxSizing: 'border-box',
            border, borderRight: 'none', borderRadius: 0, fontSize: 12, fontFamily: FONT,
            color: TEXT_INPUT, background: BG_WHITE, outline: 'none', flex: 1, minWidth: 0,
          }}
        />
        <div style={{
          position: 'relative', width: 22, height: 26, flexShrink: 0,
          border, borderLeft: 'none', background: '#ebebeb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 11, lineHeight: 1, pointerEvents: 'none', ...NO_SEL }}>🗓</span>
          <input
            type="date"
            onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
            tabIndex={-1}
          />
        </div>
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ children, cols, style = {} }) {
  return (
    <div style={{
      display: cols ? 'grid' : 'block',
      gridTemplateColumns: cols,
      gap: 12,
      padding: '8px 14px',
      background: BG,
      alignItems: 'start',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TerexPortalMock() {
  const [fields, setFields] = useState({
    customer_name:    'Lancashire Crushers',
    claim_id:         '5271755',
    type:             'Machine Warranty',
    dealer:           'Blue Machinery (Central) Li...',
    brand:            'Powerscreen',
    model:            'PTR450',
    currency:         'GBP',
    submitted_total:  '0.00',
    total_paid:       '0.00',
    product:          'Crushers',
    serial_no:        'PIDPR450JOMS79465',
    engine_sn:        '7458929',
    registration_date: '2025-11-21',
    failure_date:     '2026-04-21',
  })
  const [activeTab, setActiveTab] = useState('details')

  const fp = { fields, setFields }

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
    <div style={{ width: 1400, fontFamily: FONT, fontSize: 12, border: '1px solid #b0b0b0', background: BG }}>

      {/* ── SECTION B — Header banner ─────────────────────────────────── */}
      <div style={{
        background: '#2d3f5e', color: 'white', padding: '6px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        ...NO_SEL,
      }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Terex MP — Warranty Claim</span>
      </div>

      {/* ── SECTION C — Metadata row 1 (6 columns) ───────────────────── */}
      <div style={{ background: BG, padding: '8px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, alignItems: 'start' }}>
          <F id="claim_id" label="Claim ID"  {...fp} />
          <F id="type"     label="Type"      {...fp} />
          <F id="dealer"   label="Dealer"    {...fp} />
          <F id="brand"    label="Brand"     {...fp} />
          {/* Model with info icon */}
          <div>
            <div style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: LBL_DEF, marginBottom: 2, ...NO_SEL }}>Model</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                id="model"
                type="text"
                value={fields['model'] || ''}
                onChange={e => setFields(prev => ({ ...prev, model: e.target.value }))}
                style={{ ...staticInp, flex: 1, minWidth: 0 }}
              />
              <InfoIcon />
            </div>
          </div>
          {/* 6th column — empty */}
          <div />
        </div>
      </div>

      {/* ── SECTION D — Metadata row 2 (3 columns) ───────────────────── */}
      <div style={{ background: BG, padding: '4px 14px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, alignItems: 'start' }}>
          <F id="currency"        label="Currency"        {...fp} />
          <F id="submitted_total" label="Submitted Total" {...fp} />
          <F id="total_paid"      label="Total Paid"      {...fp} />
          <div /><div /><div />
        </div>
      </div>

      {/* ── White gap ─────────────────────────────────────────────────── */}
      <div style={{ height: 5, background: BG_WHITE }} />

      {/* ── SECTION E — Action bar ────────────────────────────────────── */}
      <div style={{
        padding: '8px 14px', background: BG,
        display: 'flex', alignItems: 'center', gap: 16, ...NO_SEL,
      }}>
        <span style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: LBL_DEF }}>Action</span>
        <select style={{ ...staticInp, width: 210 }} defaultValue="requestor">
          <option value="requestor">Requestor Action Needed</option>
        </select>
        <span style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: LBL_EMPH }}>Status (1)</span>
        <select style={{ ...staticInp, width: 100 }} defaultValue="draft">
          <option value="draft">Draft</option>
        </select>
        <button
          style={{
            marginLeft: 'auto', background: '#ea580c', color: '#fff',
            padding: '6px 20px', borderRadius: 4, fontWeight: 600,
            fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: FONT,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c2460a' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#ea580c' }}
        >
          ✓ Submit
        </button>
      </div>

      {/* ── White gap ─────────────────────────────────────────────────── */}
      <div style={{ height: 5, background: BG_WHITE }} />

      {/* ── SECTION F — Tab bar ───────────────────────────────────────── */}
      <div style={{ display: 'flex', background: BG_WHITE, ...NO_SEL }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            fontSize: 12, fontFamily: FONT,
            padding: '6px 22px',
            border: 'none', borderRight: '1px solid #c8c8c8',
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

          {/* ── SECTION G — Customer row (4 columns) ──────────────────── */}
          <Section cols="repeat(4, 1fr)" style={{ padding: '12px 14px' }}>
            <F id="customer_name" label="Customer Name" labelColor={LBL_EMPH} {...fp} />
            <F id="customer_no"   label="Customer No."  {...fp} />
            <F id="tax_no"        label="Tax No."       {...fp} />
            {/* Site address — textarea with info icon */}
            <div>
              <div style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: LBL_DEF, marginBottom: 2, ...NO_SEL }}>Site Address</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <textarea
                  id="site_address"
                  rows={2}
                  value={fields['site_address'] || ''}
                  onChange={e => setFields(prev => ({ ...prev, site_address: e.target.value }))}
                  style={{
                    flex: 1, minWidth: 0, padding: '4px 8px', boxSizing: 'border-box',
                    border: `1px solid ${BORDER_DEF}`, borderRadius: 0, fontSize: 12, fontFamily: FONT,
                    color: TEXT_INPUT, background: BG_WHITE, outline: 'none', resize: 'vertical',
                  }}
                />
                <InfoIcon />
              </div>
            </div>
          </Section>

          {/* ── SECTION H — Product row (5 columns) ───────────────────── */}
          <Section cols="repeat(5, 1fr)">
            <F id="product"     label="Product"     {...fp} />
            <F id="serial_no"   label="Serial No."  labelColor={LBL_EMPH} {...fp} />
            <F id="settings"    label="Settings"    {...fp} />
            <F id="application" label="Application" {...fp} />
            <F id="engine_sn"   label="Engine SN"   {...fp} />
          </Section>

          {/* ── SECTION I — References row (3 columns) ────────────────── */}
          <Section cols="repeat(3, 1fr)">
            <F id="hours_run"    label="Hours Run"    {...fp} />
            <F id="helpdesk_ref" label="HelpDesk Ref" {...fp} />
            <F id="dealer_ref"   label="Dealer Ref"   {...fp} />
          </Section>

          {/* ── SECTION J — Dates row (5 columns) ─────────────────────── */}
          <Section cols="repeat(5, 1fr)">
            <FDate id="registration_date" label="Registration Date" {...fp} />
            <FDate id="failure_date"      label="Failure Date"      {...fp} />
            <FDate id="repair_date"       label="Repair Date"       {...fp} />
            <FDate id="submitted_date"    label="Submitted Date"    {...fp} />
            <FDate id="date_closed"       label="Date Closed"       {...fp} />
          </Section>

          {/* ── SECTION K — Textareas ─────────────────────────────────── */}
          <div style={{ background: BG, padding: '8px 14px' }}>
            <TA id="description"   label="Description"   {...fp} rows={3} />
            <TA id="suspect_cause" label="Suspect Cause" {...fp} rows={3} />
            <TA id="action_taken"  label="Action Taken"  {...fp} rows={3} />
          </div>

        </div>
      )}

      {/* ── Non-details tabs ──────────────────────────────────────────── */}
      {activeTab !== 'details' && (
        <div style={{ padding: 20, color: '#9ca3af', fontSize: 12, fontFamily: FONT, background: BG_WHITE, ...NO_SEL }}>
          This section is not configured in the mock.
        </div>
      )}

    </div>
  )
}
