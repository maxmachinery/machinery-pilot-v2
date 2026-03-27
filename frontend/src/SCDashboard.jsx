import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGO_URL } from './logo.js';

const C = {
  red: '#CC0000', redDk: '#AA0000', black: '#1A1A1A', white: '#FFFFFF',
  grey: '#CCCCCC', greyDk: '#888888', greyBg: '#F7F7F7', green: '#2d9e6b', orange: '#e85d04'
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('mp_token')}` };
}


// ── Header ────────────────────────────────────────────────────────────────────

function Header({ navigate }) {
  const email = localStorage.getItem('mp_email') || '';

  function handleLogout() {
    localStorage.removeItem('mp_token');
    localStorage.removeItem('mp_email');
    navigate('/');
  }

  return (
    <header style={{
      background: C.black,
      borderBottom: `3px solid ${C.red}`,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <img src={LOGO_URL} alt="Logo" style={{ height: 32, objectFit: 'contain' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: C.greyDk, fontSize: 13 }}>{email}</span>
        <button
          onClick={handleLogout}
          style={{
            background: 'transparent',
            border: `1px solid ${C.greyDk}`,
            color: C.grey,
            padding: '4px 12px',
            cursor: 'pointer',
            borderRadius: 2,
            fontSize: 12,
            fontFamily: 'Arial, sans-serif',
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}

// ── Upload Card ───────────────────────────────────────────────────────────────

function UploadCard({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const stepTimerRef = useRef(null);
  const navigate = useNavigate();

  function handleFileChange(e) {
    const selected = e.target.files[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setError(null);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
      setError(null);
    } else {
      setError('Please drop a PDF file.');
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleSubmit() {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setStatusMessage('Uploading…');
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/sc-upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }

      const { jobId } = await res.json();

      await new Promise((resolve, reject) => {
        stepTimerRef.current = setInterval(async () => {
          try {
            const data = await fetch(`/api/sc-upload/progress/${jobId}`, { headers: authHeaders() }).then(r => r.json());
            setProgress(data.progress || 0);
            if (data.message) setStatusMessage(data.message);
            if (data.status === 'complete') {
              clearInterval(stepTimerRef.current);
              resolve(data.reportId);
            } else if (data.status === 'error') {
              clearInterval(stepTimerRef.current);
              reject(new Error(data.error || 'Processing failed'));
            }
          } catch (e) {
            clearInterval(stepTimerRef.current);
            reject(e);
          }
        }, 1000);
      }).then((reportId) => {
        setProcessing(false);
        onUploadSuccess();
        navigate(`/sc-reports/${reportId}`);
      });
    } catch (err) {
      clearInterval(stepTimerRef.current);
      setProcessing(false);
      setError(err.message || 'Upload failed.');
    }
  }

  return (
    <div style={{
      background: C.white,
      borderLeft: `4px solid ${C.red}`,
      borderRadius: 2,
      padding: '24px 28px',
      marginBottom: 24,
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    }}>
      {/* Title row */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, color: C.greyDk, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          SafetyCulture Converter
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.black }}>
          Upload Inspection Report
        </div>
      </div>

      {/* Drag-drop zone */}
      {!processing && (
        <div
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? C.red : C.grey}`,
            background: dragOver ? '#FFF5F5' : C.greyBg,
            borderRadius: 2,
            padding: '32px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.15s, background 0.15s',
            marginBottom: 16,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {file ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>{file.name}</div>
              <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{formatSize(file.size)}</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, color: C.greyDk }}>Drag & drop SafetyCulture PDF here or click to select</div>
              <div style={{ fontSize: 11, color: C.grey, marginTop: 6 }}>PDF files only</div>
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      {processing && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: C.greyDk, marginBottom: 8 }}>
            {statusMessage} {progress > 0 ? `${progress}%` : ''}
          </div>
          <div style={{ background: C.greyBg, borderRadius: 2, height: 6, overflow: 'hidden' }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: C.red,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: '#FFF0F0',
          border: `1px solid ${C.red}`,
          color: C.red,
          borderRadius: 2,
          padding: '8px 12px',
          fontSize: 13,
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* Submit button */}
      {file && !processing && (
        <button
          onClick={handleSubmit}
          style={{
            width: '100%',
            background: C.red,
            color: C.white,
            border: 'none',
            padding: '12px 0',
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1,
            cursor: 'pointer',
            borderRadius: 2,
            fontFamily: 'Arial, sans-serif',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = C.redDk)}
          onMouseOut={(e) => (e.currentTarget.style.background = C.red)}
        >
          Process Report
        </button>
      )}
    </div>
  );
}

// ── Report Card ───────────────────────────────────────────────────────────────

function ReportCard({ report, onDelete, navigate }) {
  const [hovered, setHovered] = useState(false);

  function handleDeleteClick(e) {
    e.stopPropagation();
    if (!window.confirm(`Delete report for ${report.machineType} (${report.machineSerial})?`)) return;
    fetch(`/api/sc-reports/${report.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then((res) => {
      if (res.ok) onDelete(report.id);
    });
  }

  async function handleOriginalDownload(e) {
    e.stopPropagation();
    if (!report.pdfKey) return;
    const site = (report.site || report.machineType || 'Report').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `SC_${site}_${(report.inspectionDate || String(report.id)).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    try {
      const token = localStorage.getItem('mp_token');
      const response = await fetch(
        `/api/sc-photos/download?key=${encodeURIComponent(report.pdfKey)}&filename=${encodeURIComponent(filename)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return dateStr;
  }

  function formatUploadTime(isoStr) {
    if (!isoStr) return null;
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }) + ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch { return null; }
  }

  return (
    <div
      onClick={() => navigate(`/sc-reports/${report.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.white,
        border: `1px solid ${C.grey}`,
        borderLeft: `4px solid ${C.red}`,
        borderRadius: 2,
        padding: '16px 18px',
        cursor: 'pointer',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s',
        position: 'relative',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.black, lineHeight: 1.3 }}>
          {report.site || report.machineType || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {report.pdfKey && (
            <button
              onClick={handleOriginalDownload}
              style={{
                background: 'transparent',
                border: 'none',
                color: C.greyDk,
                cursor: 'pointer',
                padding: '0 2px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Download original SafetyCulture PDF"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
          )}
          <button
            onClick={handleDeleteClick}
            style={{
              background: 'transparent',
              border: 'none',
              color: C.greyDk,
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '0 2px',
              fontFamily: 'Arial, sans-serif',
            }}
            title="Delete report"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Detail rows */}
      <div style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.9 }}>
        <FieldRow label="Date" value={formatDate(report.inspectionDate)} />
        <FieldRow label="Engineer" value={report.engineer} />
        <FieldRow label="Machine" value={[report.machineType, report.machineSerial ? `#${report.machineSerial}` : null].filter(Boolean).join(' ')} />
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {report.score && (
          <span style={{
            background: C.greyBg,
            border: `1px solid ${C.grey}`,
            borderRadius: 2,
            padding: '2px 8px',
            fontSize: 11,
            color: C.greyDk,
            fontWeight: 600,
          }}>
            Score: {report.score}
          </span>
        )}
        {report.flaggedCount > 0 && (
          <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>
            {report.flaggedCount} flagged
          </span>
        )}
      </div>

      {/* Upload timestamp */}
      {formatUploadTime(report.createdAt) && (
        <div style={{ fontSize: 11, color: C.greyDk }}>
          Uploaded: {formatUploadTime(report.createdAt)}
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, value }) {
  return (
    <div>
      <span style={{ fontSize: 11, color: C.greyDk, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}: </span>
      <span style={{ fontWeight: 700, color: C.black }}>{value || '—'}</span>
    </div>
  );
}

// ── Saved Reports Section ─────────────────────────────────────────────────────

function SavedReports({ refreshKey, navigate }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/sc-reports', { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        setReports(Array.isArray(data) ? data : (data.reports || []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refreshKey]);

  function handleDelete(id) {
    setReports((prev) => prev.filter((r) => r.id !== id));
  }

  const filtered = reports.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.machineType || '').toLowerCase().includes(q) ||
      (r.machineSerial || '').toLowerCase().includes(q) ||
      (r.engineer || '').toLowerCase().includes(q) ||
      (r.site || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Section title + search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.greyDk, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
          Previous Reports
        </div>
        <input
          type="text"
          placeholder="Search machine, engineer, site…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: `1px solid ${C.grey}`,
            borderRadius: 2,
            padding: '6px 10px',
            fontSize: 12,
            fontFamily: 'Arial, sans-serif',
            color: C.black,
            outline: 'none',
            width: 220,
          }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: C.greyDk, padding: 32, fontSize: 13 }}>
          Loading reports…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          border: `2px dashed ${C.grey}`,
          borderRadius: 2,
          padding: '40px 24px',
          textAlign: 'center',
          color: C.greyDk,
          fontSize: 13,
        }}>
          {reports.length === 0 ? 'No reports yet' : 'No reports match your search'}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {filtered.map((r) => (
            <ReportCard key={r.id} report={r} onDelete={handleDelete} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SCDashboard() {
  const navigate = useNavigate();
  const [uploadRefreshKey, setUploadRefreshKey] = useState(0);

  function handleUploadSuccess() {
    setUploadRefreshKey((k) => k + 1);
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: C.greyBg, minHeight: '100vh' }}>
      <Header navigate={navigate} />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        <UploadCard onUploadSuccess={handleUploadSuccess} />
        <SavedReports refreshKey={uploadRefreshKey} navigate={navigate} />
      </main>
    </div>
  );
}
