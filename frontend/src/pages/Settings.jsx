export default function Settings() {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Settings</h2>
          <p className="card-subtitle">Application configuration — more options coming soon</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SettingRow
            icon="🔑"
            title="Anthropic API"
            desc="API key is configured server-side via environment variable ANTHROPIC_API_KEY. Never exposed to the browser."
            tag="Server-side only"
            tagColor="var(--ok)"
          />
          <SettingRow
            icon="☁"
            title="Cloudflare R2 Storage"
            desc="Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME as environment variables to enable file storage."
            tag="Optional"
            tagColor="var(--grey-muted)"
          />
          <SettingRow
            icon="🗄"
            title="SQLite Database"
            desc="Data is stored locally in backend/warranty.db. Includes OEM configs, document content, enrichment sessions, and claim history."
            tag="Local file"
            tagColor="var(--navy)"
          />
          <SettingRow
            icon="🧠"
            title="AI Model"
            desc="Enrichment and document parsing uses claude-sonnet-4-6. Vision transcription is used automatically for scanned or handwritten PDFs (< 100 chars of extractable text)."
            tag="claude-sonnet-4-6"
            tagColor="var(--cyan-dark)"
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title" style={{ fontSize: 16 }}>About</h2>
        </div>
        <div style={{ fontSize: 13, color: 'var(--grey-muted)', lineHeight: 1.7 }}>
          <p><strong style={{ color: 'var(--navy)' }}>Warranty Enrichment Engine</strong> — Blue Group</p>
          <p>Version 2.0 · Built with React + Vite + Express + SQLite + Anthropic</p>
          <p style={{ marginTop: 8 }}>
            Process engineer job card PDFs against OEM warranty policies to produce enriched,
            policy-compliant claims ready for portal submission.
          </p>
        </div>
      </div>
    </>
  )
}

function SettingRow({ icon, title, desc, tag, tagColor }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 16px',
      border: '1px solid var(--grey-border)', borderRadius: 8, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 14, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--grey-muted)', lineHeight: 1.5 }}>{desc}</div>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
        background: 'var(--grey-bg)', color: tagColor, border: '1px solid var(--grey-border)',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {tag}
      </span>
    </div>
  )
}
