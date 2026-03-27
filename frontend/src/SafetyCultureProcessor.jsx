import { useState, useRef, useEffect } from 'react';

const C = {
  red:    '#CC0000',
  black:  '#1A1A1A',
  white:  '#FFFFFF',
  grey:   '#CCCCCC',
  greyDk: '#888888',
  greyBg: '#F7F7F7',
  green:  '#2d9e6b',
  orange: '#e85d04',
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('mp_token')}` };
}

const STATUS_STEPS = [
  'Extracting PDF text…',
  'Identifying flagged items…',
  'Extracting and renaming photos…',
  'Generating Catalyst quote document…',
  'Packaging files into ZIP…',
  'Uploading to storage…',
];

function Badge({ count, label, color, bg }) {
  return (
    <div style={{ textAlign: 'center', background: bg, border: `1px solid ${color}`, borderRadius: 3, padding: '12px 20px', minWidth: 110 }}>
      <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function DownloadBtn({ href, label, solid }) {
  if (!href) return null;
  return (
    <a
      href={href}
      download
      style={{
        background: solid ? C.red : 'none',
        color: solid ? C.white : C.red,
        border: `1px solid ${C.red}`,
        padding: '7px 14px',
        fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
        textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block',
        borderRadius: 2,
      }}
    >
      {label}
    </a>
  );
}

function JobHistory({ jobs, loading }) {
  if (loading) return (
    <div style={{ fontSize: 12, color: C.greyDk, padding: '12px 0' }}>Loading previous jobs…</div>
  );
  if (!jobs.length) return (
    <div style={{ fontSize: 12, color: C.greyDk, padding: '12px 0' }}>No previous jobs found.</div>
  );
  return (
    <div>
      {jobs.map(job => (
        <div
          key={job.id}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 0', borderBottom: `1px solid ${C.grey}`, flexWrap: 'wrap', gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.black }}>
              {job.machineName || '—'}{job.machineSerial ? ` — ${job.machineSerial}` : ''}
            </div>
            <div style={{ fontSize: 11, color: C.greyDk, marginTop: 2 }}>
              {job.createdAt?.slice(0, 16).replace('T', ' ')}
              {' · '}{job.flaggedCount} flagged
              {' · '}{job.flaggedCount} flagged items
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <DownloadBtn href={job.zipUrl} label="↓ Download ZIP" solid />
            <DownloadBtn href={job.pdfUrl} label="↓ Original PDF" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SafetyCultureProcessor() {
  const [dragging,    setDragging]    = useState(false);
  const [file,        setFile]        = useState(null);
  const [processing,  setProcessing]  = useState(false);
  const [statusIdx,   setStatusIdx]   = useState(0);
  const [result,      setResult]      = useState(null);
  const [error,       setError]       = useState('');
  const [jobs,        setJobs]        = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const inputRef   = useRef();
  const statusTimer = useRef(null);

  useEffect(() => {
    fetch('/api/safetyculture-jobs', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setJobs(data); })
      .catch(() => {})
      .finally(() => setJobsLoading(false));
  }, [result]); // refetch after a new result comes in

  function startStatusCycle() {
    let i = 0;
    setStatusIdx(0);
    statusTimer.current = setInterval(() => {
      i = Math.min(i + 1, STATUS_STEPS.length - 1);
      setStatusIdx(i);
    }, 3000);
  }

  function stopStatusCycle() {
    clearInterval(statusTimer.current);
  }

  function pickFile(f) {
    if (!f) return;
    if (f.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    setFile(f);
    setResult(null);
    setError('');
  }

  async function process() {
    if (!file || processing) return;
    setProcessing(true);
    setError('');
    setResult(null);
    startStatusCycle();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/process-safetyculture', {
        method:  'POST',
        headers: authHeaders(),
        body:    formData,
      });

      stopStatusCycle();

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Processing failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      stopStatusCycle();
      setProcessing(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError('');
    setProcessing(false);
    stopStatusCycle();
  }

  const m = result?.machine || {};

  return (
    <div>
      {/* Processor card */}
      <div style={{ background: C.white, border: `1px solid ${C.grey}`, borderLeft: `4px solid ${C.red}`, padding: '24px 28px', marginBottom: 24 }}>
        {/* Section title */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: C.greyDk, marginBottom: 4 }}>SafetyCulture</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.black, letterSpacing: 0.5 }}>Report Processor</div>
          <div style={{ fontSize: 12, color: C.greyDk, marginTop: 4 }}>
            Upload a SafetyCulture inspection PDF to extract flagged items, rename photos, and generate a Catalyst quote.
          </div>
        </div>

        {/* Result view */}
        {result && (
          <div>
            <div style={{ background: C.greyBg, border: `1px solid ${C.grey}`, padding: '16px 20px', marginBottom: 16, borderRadius: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: C.greyDk, marginBottom: 8 }}>Machine Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px 24px' }}>
                {[
                  ['Type / Model',    m.type],
                  ['Serial Number',   m.serial],
                  ['Machine Hours',   m.hours],
                  ['Inspection Date', m.inspection_date],
                  ['Engineer',        m.engineer],
                  ['Site',            m.site],
                  ['Score',           m.score],
                ].map(([lbl, val]) => val ? (
                  <div key={lbl}>
                    <span style={{ fontSize: 10, color: C.greyDk, textTransform: 'uppercase', letterSpacing: 1 }}>{lbl}: </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.black }}>{val}</span>
                  </div>
                ) : null)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <Badge count={result.urgentCount}      label="Urgent Items"        color={C.red}    bg="#fde8e6" />
              <Badge count={result.nextServiceCount} label="Next Service"        color={C.orange} bg="#fff0eb" />
              <Badge count={result.additionalCount}  label="Additional Findings" color={C.greyDk} bg={C.greyBg} />
              {result.photoCount > 0 && <Badge count={result.photoCount} label="Photos Extracted" color={C.black} bg={C.greyBg} />}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {result.downloadUrl ? (
                <a
                  href={result.downloadUrl}
                  download
                  style={{
                    background: C.red, color: C.white, border: 'none', padding: '11px 22px',
                    fontSize: 13, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
                    textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block',
                  }}
                >
                  ↓ Download ZIP (Quote + Photos)
                </a>
              ) : (
                <div style={{ fontSize: 12, color: C.greyDk, padding: '11px 0' }}>ZIP generated but R2 not configured.</div>
              )}
              <button
                onClick={reset}
                style={{ background: 'none', border: `1px solid ${C.grey}`, color: C.greyDk, padding: '11px 18px', fontSize: 12, cursor: 'pointer', letterSpacing: 1 }}
              >
                Process Another
              </button>
            </div>
          </div>
        )}

        {/* Processing state */}
        {processing && (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: C.greyDk, marginBottom: 16 }}>{STATUS_STEPS[statusIdx]}</div>
            <div style={{ height: 3, background: C.greyBg, borderRadius: 2, overflow: 'hidden', maxWidth: 400, margin: '0 auto' }}>
              <div style={{
                height: '100%', background: C.red,
                width: `${((statusIdx + 1) / STATUS_STEPS.length) * 100}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Upload zone */}
        {!result && !processing && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? C.red : C.grey}`,
                background: dragging ? 'rgba(204,0,0,.04)' : C.greyBg,
                padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
                borderRadius: 3, transition: 'all .15s', marginBottom: file ? 12 : 0,
              }}
            >
              <input ref={inputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => pickFile(e.target.files[0])} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                Upload SafetyCulture Inspection PDF
              </div>
              <div style={{ fontSize: 12, color: C.greyDk }}>Drag and drop or click to select</div>
              {file && (
                <div style={{ marginTop: 10, fontSize: 12, color: C.red, fontWeight: 600 }}>
                  ✓ {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>

            {file && (
              <button
                onClick={process}
                style={{
                  width: '100%', background: C.red, color: C.white, border: 'none',
                  padding: '13px', fontSize: 13, fontWeight: 700, letterSpacing: 1,
                  cursor: 'pointer', textTransform: 'uppercase', marginTop: 8,
                }}
              >
                Process Report
              </button>
            )}
          </>
        )}

        {error && (
          <div style={{ background: '#fde8e6', border: `1px solid ${C.red}`, color: C.red, padding: '10px 14px', fontSize: 12, marginTop: 12, borderRadius: 2 }}>
            {error}
            <button onClick={reset} style={{ marginLeft: 12, background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontWeight: 700 }}>
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Previous jobs */}
      <div style={{ background: C.white, border: `1px solid ${C.grey}`, borderLeft: `4px solid ${C.grey}`, padding: '20px 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: C.greyDk, marginBottom: 12 }}>
          Previous Jobs
        </div>
        <JobHistory jobs={jobs} loading={jobsLoading} />
      </div>
    </div>
  );
}
