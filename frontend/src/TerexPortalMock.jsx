import { useState } from 'react'

// ── Tokens ────────────────────────────────────────────────────────────────────
const FONT       = "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif"
const LBL_DEF    = '#3a5a87'
const LBL_EMPH   = '#0000FF'
const BORDER_DEF = '#d1d5db'
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

// ── Fixed 5-column grid shared by ALL Details rows ────────────────────────────
// Rows with 3 or 4 fields leave the remaining column(s) naturally empty.
// DO NOT override cols per-row — every row shares this same grid.
const GRID5 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 16,
  padding: '10px 14px',
  background: BG,
  alignItems: 'center',
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

// ── Shared label ──────────────────────────────────────────────────────────────
function Lbl({ children, color, style: extraStyle }) {
  return (
    <div style={{
      fontSize: 11, fontFamily: FONT, fontWeight: 700,
      color: color || LBL_DEF,
      flexShrink: 0, whiteSpace: 'nowrap',
      ...NO_SEL,
      ...extraStyle,
    }}>
      {children}
    </div>
  )
}

// ── Text field — label LEFT of input, occupies exactly 1 grid column ──────────
function F({ id, label, fields, setFields, labelColor }) {
  const required = REQUIRED_FIELDS.has(id)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Lbl color={labelColor}>{label}</Lbl>
      <input
        id={id}
        className={required ? 'mp-required-field' : undefined}
        value={fields[id] || ''}
        onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
        style={{
          flex: 1, height: 24, padding: '2px 6px', boxSizing: 'border-box',
          border: required ? undefined : `1px solid ${BORDER_DEF}`,
          borderRadius: 2, fontSize: 12, fontFamily: FONT,
          color: TEXT_INPUT, background: BG_WHITE, outline: 'none', minWidth: 0,
        }}
      />
    </div>
  )
}

// ── Date field — label LEFT, calendar icon right, occupies 1 grid column ──────
function FDate({ id, label, fields, setFields }) {
  const required = REQUIRED_FIELDS.has(id)
  const bdr = required ? '2px solid #c53030' : `1px solid ${BORDER_DEF}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Lbl>{label}</Lbl>
      <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, minWidth: 0 }}>
        <input
          id={id}
          type="text"
          value={fields[id] || ''}
          onChange={e => setFields(prev => ({ ...prev, [id]: e.target.value }))}
          style={{
            flex: 1, height: 24, padding: '2px 6px', boxSizing: 'border-box',
            border: bdr, borderRight: 'none', borderRadius: 0,
            fontSize: 12, fontFamily: FONT, color: TEXT_INPUT,
            background: BG_WHITE, outline: 'none', minWidth: 0,
          }}
        />
        <div style={{
          position: 'relative', width: 20, height: 24, flexShrink: 0,
          border: bdr, borderLeft: 'none', background: '#ebebeb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 10, lineHeight: 1, pointerEvents: 'none', ...NO_SEL }}>🗓</span>
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

// ── Section wrapper (top metadata rows only — 6 cols) ─────────────────────────
function Section({ children, cols, style = {} }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols,
      gap: 12,
      padding: '8px 14px',
      background: BG,
      alignItems: 'center',
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
    height: 24, padding: '2px 6px', boxSizing: 'border-box',
    border: `1px solid ${BORDER_DEF}`, borderRadius: 2,
    fontSize: 12, fontFamily: FONT, color: TEXT_INPUT,
    background: BG_WHITE, outline: 'none',
  }

  return (
    <div style={{ width: 1400, fontFamily: FONT, fontSize: 12, border: '1px solid #b0b0b0', background: BG }}>

      {/* ── SECTION B — Header banner ─────────────────────────────────── */}
      <div style={{
        background: '#2d3f5e', color: 'white', padding: '6px 14px',
        display: 'flex', alignItems: 'center',
        ...NO_SEL,
      }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Terex Warranty Portal</span>
      </div>

      {/* ── SECTION C — Metadata row 1 (6 equal columns) ─────────────── */}
      <Section cols="repeat(6, 1fr)" style={{ padding: '8px 14px' }}>
        <F id="claim_id" label="Claim ID" {...fp} />
        <F id="type"     label="Type"     {...fp} />
        <F id="dealer"   label="Dealer"   {...fp} />
        <F id="brand"    label="Brand"    {...fp} />
        {/* Model with info icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Lbl>Model</Lbl>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
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
        <div />
      </Section>

      {/* ── SECTION D — Metadata row 2 (6 equal columns) ─────────────── */}
      <Section cols="repeat(6, 1fr)" style={{ padding: '4px 14px 8px' }}>
        <F id="currency"        label="Currency"        {...fp} />
        <F id="submitted_total" label="Submitted Total" {...fp} />
        <F id="total_paid"      label="Total Paid"      {...fp} />
        <div /><div /><div />
      </Section>

      {/* ── White gap ─────────────────────────────────────────────────── */}
      <div style={{ height: 5, background: BG_WHITE }} />

      {/* ── SECTION E — Action bar ────────────────────────────────────── */}
      <div style={{
        padding: '8px 14px', background: BG,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        ...NO_SEL,
      }}>
        {/* Left: Action and Status dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
          <Lbl>Action</Lbl>
          <select style={{ ...staticInp, width: 210 }}>
            <option value="">— Select —</option>
            <option value="requestor">Requestor Action Needed</option>
          </select>
          <Lbl color={LBL_EMPH}>Status (1)</Lbl>
          <select style={{ ...staticInp, width: 100 }}>
            <option value="">— Select —</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        {/* Centre: Submit button */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button
            style={{
              background: '#ea580c', color: '#fff',
              padding: '6px 24px', borderRadius: 4, fontWeight: 600,
              fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: FONT,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c2460a' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#ea580c' }}
          >
            ✓ Submit
          </button>
        </div>
        {/* Right: empty equal-weight spacer */}
        <div style={{ flex: 1 }} />
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

          {/* ── SECTION G — Customer: 4 fields, col 5 stays empty ─────── */}
          <div style={{ ...GRID5, padding: '12px 14px' }}>
            <F id="customer_name" label="Customer Name" labelColor={LBL_EMPH} {...fp} />
            <F id="customer_no"   label="Customer No."  {...fp} />
            <F id="tax_no"        label="Tax No."       {...fp} />
            <F id="site_address"  label="Site Address"  {...fp} />
            {/* col 5 empty — grid leaves it blank, no spacer element */}
          </div>

          {/* ── SECTION H — Product: 5 fields, all columns filled ─────── */}
          <div style={GRID5}>
            <F id="product"     label="Product"     {...fp} />
            <F id="serial_no"   label="Serial No."  labelColor={LBL_EMPH} {...fp} />
            <F id="settings"    label="Settings"    {...fp} />
            <F id="application" label="Application" {...fp} />
            <F id="engine_sn"   label="Engine SN"   {...fp} />
          </div>

          {/* ── SECTION I — References: 3 fields, cols 4+5 stay empty ─── */}
          <div style={GRID5}>
            <F id="hours_run"    label="Hours Run"    {...fp} />
            <F id="helpdesk_ref" label="HelpDesk Ref" {...fp} />
            <F id="dealer_ref"   label="Dealer Ref"   {...fp} />
            {/* cols 4+5 empty — grid leaves them blank, no spacer elements */}
          </div>

          {/* ── SECTION J — Dates: 5 fields, all columns filled ──────── */}
          <div style={GRID5}>
            <FDate id="registration_date" label="Registration Date" {...fp} />
            <FDate id="failure_date"      label="Failure Date"      {...fp} />
            <FDate id="repair_date"       label="Repair Date"       {...fp} />
            <FDate id="submitted_date"    label="Submitted Date"    {...fp} />
            <FDate id="date_closed"       label="Date Closed"       {...fp} />
          </div>

          {/* ── SECTION K — Textareas: label in col 1, textarea spans 2–5 */}
          {/* Each label+textarea pair occupies one implicit grid row.     */}
          {/* CSS auto-placement: label → col 1; textarea(gridColumn 2/-1) */}
          {/* → cols 2-5 of the same row. No spacers needed.              */}
          <div style={{
            ...GRID5,
            alignItems: 'start',
            rowGap: 10,
          }}>
            <Lbl style={{ paddingTop: 6 }}>Description</Lbl>
            <textarea
              id="description"
              rows={6}
              className="mp-required-field"
              value={fields['description'] || ''}
              onChange={e => setFields(prev => ({ ...prev, description: e.target.value }))}
              style={{
                gridColumn: '2 / -1', padding: '4px 8px', boxSizing: 'border-box',
                borderRadius: 0, fontSize: 12, fontFamily: FONT,
                color: TEXT_INPUT, background: BG_WHITE, outline: 'none', resize: 'vertical',
              }}
            />

            <Lbl style={{ paddingTop: 6 }}>Suspect Cause</Lbl>
            <textarea
              id="suspect_cause"
              rows={6}
              className="mp-required-field"
              value={fields['suspect_cause'] || ''}
              onChange={e => setFields(prev => ({ ...prev, suspect_cause: e.target.value }))}
              style={{
                gridColumn: '2 / -1', padding: '4px 8px', boxSizing: 'border-box',
                borderRadius: 0, fontSize: 12, fontFamily: FONT,
                color: TEXT_INPUT, background: BG_WHITE, outline: 'none', resize: 'vertical',
              }}
            />

            <Lbl style={{ paddingTop: 6 }}>Action Taken</Lbl>
            <textarea
              id="action_taken"
              rows={6}
              className="mp-required-field"
              value={fields['action_taken'] || ''}
              onChange={e => setFields(prev => ({ ...prev, action_taken: e.target.value }))}
              style={{
                gridColumn: '2 / -1', padding: '4px 8px', boxSizing: 'border-box',
                borderRadius: 0, fontSize: 12, fontFamily: FONT,
                color: TEXT_INPUT, background: BG_WHITE, outline: 'none', resize: 'vertical',
              }}
            />
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
