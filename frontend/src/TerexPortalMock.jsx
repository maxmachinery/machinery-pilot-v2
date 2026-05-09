import { useState } from 'react'

// ── Tokens ────────────────────────────────────────────────────────────────────
const FONT       = "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif"
const LBL_DEF    = '#3a5a87'
const LBL_EMPH   = '#0000FF'
const BORDER_DEF = '#cbd5e0'
const BORDER_RED = '#c53030'
const BG         = '#F5F5F5'
const BG_WHITE   = '#ffffff'
const TAB_INACT  = '#5b7d9d'
const INFO_ICON  = '#3182ce'
const TEXT_INPUT = '#2d3748'
const NO_SEL     = { userSelect: 'none', WebkitUserSelect: 'none' }

const RED_FIELDS = new Set([
  'customer_name', 'serial_no',
  'application', 'hours_run', 'helpdesk_ref', 'dealer_ref',
  'repair_date', 'description', 'suspect_cause', 'action_taken',
])
const EMPH_FIELDS = new Set(['customer_name', 'serial_no'])
const DATE_FIELDS = new Set(['registration_date', 'failure_date', 'repair_date', 'submitted_date', 'date_closed'])

// ── Style helpers ─────────────────────────────────────────────────────────────
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

// ── White separator ───────────────────────────────────────────────────────────
const WhiteGap = () => <div style={{ height: 5, background: BG_WHITE }} />

// ── Text field ────────────────────────────────────────────────────────────────
function F({ id, label, fields, setFields }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={lblSty(id)}>{label}</label>
      <input
        id={id}
        type="text"
        value={fields[id] || ''}
        onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
        style={{ ...inpSty(id), flex: 1, minWidth: 0 }}
      />
    </div>
  )
}

// ── Date field ────────────────────────────────────────────────────────────────
function FDate({ id, label, fields, setFields }) {
  const border = `1px solid ${RED_FIELDS.has(id) ? BORDER_RED : BORDER_DEF}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <label htmlFor={id} style={lblSty(id)}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <input
          id={id}
          type="text"
          value={fields[id] || ''}
          onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
          style={{ ...inpSty(id), width: 96, borderRight: 'none' }}
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

// ── Multiline textarea ────────────────────────────────────────────────────────
function FM({ id, label, fields, setFields }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%' }}>
      <label htmlFor={id} style={{ ...lblSty(id), paddingTop: 4, lineHeight: '18px' }}>{label}</label>
      <textarea
        id={id}
        value={fields[id] || ''}
        onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
        style={{
          flex: 1, height: 52, minWidth: 0,
          border: `1px solid ${RED_FIELDS.has(id) ? BORDER_RED : BORDER_DEF}`,
          borderRadius: 0, fontSize: 12, fontFamily: FONT,
          color: TEXT_INPUT, background: BG_WHITE,
          padding: '4px 8px', resize: 'vertical',
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
export default function TerexPortalMock() {
  const [fields, setFields] = useState({})
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

      {/* ── Title bar ────────────────────────────────────────────────── */}
      <div style={{
        background: '#1e6091', color: '#fff', padding: '5px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        ...NO_SEL,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT }}>Terex MP — Warranty Claim</span>
        </div>
      </div>

      {/* ── Metadata block ───────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px', background: BG }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '6px 24px', marginBottom: 6, alignItems: 'center',
        }}>
          <F id="claim_id" label="Claim ID" {...fp} />
          <F id="type"     label="Type"     {...fp} />
          <F id="dealer"   label="Dealer"   {...fp} />
          <F id="brand"    label="Brand"    {...fp} />
          {/* Model with info icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <label htmlFor="model" style={lblSty('model')}>Model</label>
            <input
              id="model"
              type="text"
              value={fields['model'] || ''}
              onChange={e => setFields(prev => ({ ...prev, model: e.target.value }))}
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
          <F id="currency"        label="Currency"        {...fp} />
          <F id="submitted_total" label="Submitted Total" {...fp} />
          <F id="total_paid"      label="Total Paid"      {...fp} />
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

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
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
            <F id="customer_name" label="Customer Name" {...fp} />
            <F id="customer_no"   label="Customer No."  {...fp} />
            <F id="tax_no"        label="Tax No."       {...fp} />
            <F id="site_address"  label="Site Address"  {...fp} />
          </Row>
          <Row cols="repeat(5, 1fr)">
            <F id="product"     label="Product"     {...fp} />
            <F id="serial_no"   label="Serial No."  {...fp} />
            <F id="settings"    label="Settings"    {...fp} />
            <F id="application" label="Application" {...fp} />
            <F id="engine_sn"   label="Engine SN"   {...fp} />
          </Row>
          <Row>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="hours_run" style={lblSty('hours_run')}>Hours Run</label>
              <input
                id="hours_run"
                type="text"
                value={fields['hours_run'] || ''}
                onChange={e => setFields(prev => ({ ...prev, hours_run: e.target.value }))}
                style={{ ...inpSty('hours_run'), width: 90 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <label htmlFor="helpdesk_ref" style={lblSty('helpdesk_ref')}>HelpDesk Ref</label>
              <input
                id="helpdesk_ref"
                type="text"
                value={fields['helpdesk_ref'] || ''}
                onChange={e => setFields(prev => ({ ...prev, helpdesk_ref: e.target.value }))}
                style={{ ...inpSty('helpdesk_ref'), width: 280 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <label htmlFor="dealer_ref" style={lblSty('dealer_ref')}>Dealer Ref</label>
              <input
                id="dealer_ref"
                type="text"
                value={fields['dealer_ref'] || ''}
                onChange={e => setFields(prev => ({ ...prev, dealer_ref: e.target.value }))}
                style={{ ...inpSty('dealer_ref'), width: 280 }}
              />
            </div>
          </Row>
          <Row>
            <FDate id="registration_date" label="Registration Date" {...fp} />
            <FDate id="failure_date"      label="Failure Date"      {...fp} />
            <FDate id="repair_date"       label="Repair Date"       {...fp} />
            <FDate id="submitted_date"    label="Submitted Date"    {...fp} />
            <FDate id="date_closed"       label="Date Closed"       {...fp} />
          </Row>
          <Row><FM id="description"   label="Description"   {...fp} /></Row>
          <Row><FM id="suspect_cause" label="Suspect Cause" {...fp} /></Row>
          <Row><FM id="action_taken"  label="Action Taken"  {...fp} /></Row>
        </div>
      )}

      {/* ── Non-details tabs ──────────────────────────────────────────── */}
      {activeTab !== 'details' && (
        <div style={{ padding: 20, color: '#9ca3af', fontSize: 12, fontFamily: FONT, background: BG_WHITE, ...NO_SEL }}>
          This section is not configured in the mock.
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{
        background: BG_WHITE, padding: '10px 12px',
        borderTop: '1px solid #d0d0d0',
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
        ...NO_SEL,
      }}>
        <button
          style={{
            background: '#1e6091', color: '#fff', border: 'none',
            padding: '12px 24px', fontSize: 14, fontFamily: FONT, fontWeight: 700,
            letterSpacing: '0.05em', cursor: 'pointer', borderRadius: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#174e73' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1e6091' }}
        >
          Submit Claim
        </button>
      </div>

    </div>
  )
}
