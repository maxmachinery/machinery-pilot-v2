import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGO_URL } from './logo.js';
import SafetyCultureProcessor from './SafetyCultureProcessor.jsx';

const C = { red: '#CC0000', black: '#1A1A1A', white: '#FFFFFF', grey: '#CCCCCC', greyDk: '#888888', greyBg: '#F7F7F7', green: '#2d9e6b', orange: '#e85d04' };

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('mp_token')}`, 'Content-Type': 'application/json' };
}

function statusBadge(status) {
  const map = {
    'Open':        { bg: C.grey,   color: C.black },
    'In Progress': { bg: C.orange, color: '#fff'  },
    'Complete':    { bg: C.green,  color: '#fff'  },
  };
  const s = map[status] || map['Open'];
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 2 }}>
      {status || 'Open'}
    </span>
  );
}

function timeAgo(dt) {
  if (!dt) return '';
  const diff = (Date.now() - new Date(dt + 'Z').getTime()) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [tab,     setTab]     = useState('reports'); // 'reports' | 'safetyculture'
  const email = localStorage.getItem('mp_email') || '';

  useEffect(() => {
    fetch('/api/reports', { headers: authHeaders() })
      .then(r => { if (r.status === 401) { logout(); return null; } return r.json(); })
      .then(data => { if (data) setReports(data); })
      .catch(() => setError('Failed to load reports'))
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    localStorage.removeItem('mp_token');
    localStorage.removeItem('mp_email');
    navigate('/');
  }

  async function deleteReport(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this report?')) return;
    await fetch(`/api/reports/${id}`, { method: 'DELETE', headers: authHeaders() });
    setReports(rs => rs.filter(r => r.id !== id));
  }

  async function openOriginals(e, id) {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/reports/${id}/originals`, { headers: authHeaders() });
      const { urls } = await res.json();
      if (!urls || urls.length === 0) { alert('No original files stored for this report.'); return; }
      urls.forEach(url => window.open(url, '_blank'));
    } catch { alert('Failed to fetch original files.'); }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.greyBg, fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.black, borderBottom: `3px solid ${C.red}`, padding: '0 32px', display: 'flex', alignItems: 'center', height: 56 }}>
        <div style={{ flex: 1 }}>
          <img src={LOGO_URL} alt="RK6 Machinery Services" style={{ height: 32, width: 'auto', verticalAlign: 'middle' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: C.grey, letterSpacing: 0.5 }}>{email}</span>
          <button onClick={logout} style={{ background: 'none', border: '1px solid #555', color: '#ccc', padding: '5px 14px', fontSize: 11, cursor: 'pointer', letterSpacing: 1 }}>Logout</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: C.greyDk }}>Dashboard</div>
          {tab === 'reports' && (
            <button
              onClick={() => navigate('/report/new')}
              style={{ marginLeft: 'auto', background: C.red, color: '#fff', border: 'none', padding: '11px 22px', fontSize: 13, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase' }}
            >
              ＋ New Inspection Report
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `2px solid ${C.grey}` }}>
          {[
            { key: 'reports',        label: 'Inspection Reports' },
            { key: 'safetyculture',  label: 'SafetyCulture Processor' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none', border: 'none', borderBottom: tab === t.key ? `3px solid ${C.red}` : '3px solid transparent',
                padding: '10px 20px', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
                color: tab === t.key ? C.black : C.greyDk, cursor: 'pointer', letterSpacing: 0.5,
                marginBottom: -2, transition: 'all .15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* SafetyCulture tab */}
        {tab === 'safetyculture' && <SafetyCultureProcessor />}

        {/* Reports tab */}
        {tab === 'reports' && <>

        {/* Search */}
        {!loading && reports.length > 0 && (
          <input
            type="text"
            placeholder="Search by customer, engineer, serial no, title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', border: `1px solid ${C.grey}`,
              padding: '10px 14px', fontSize: 13, outline: 'none', marginBottom: 20,
              fontFamily: 'Arial,sans-serif', transition: 'border-color .15s',
            }}
            onFocus={e => { e.target.style.borderColor = C.red; }}
            onBlur={e => { e.target.style.borderColor = C.grey; }}
          />
        )}

        {loading && <div style={{ textAlign: 'center', padding: 60, color: C.greyDk, fontSize: 14 }}>Loading…</div>}
        {error   && <div style={{ background: '#fde8e6', border: `1px solid ${C.red}`, color: C.red, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>{error}</div>}

        {!loading && reports.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: C.greyDk, fontSize: 14, border: `2px dashed ${C.grey}`, background: '#fff' }}>
            No reports yet — click <strong>New Inspection Report</strong> to begin
          </div>
        )}

        {/* Report cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {reports.filter(r => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (
              (r.customerName || '').toLowerCase().includes(q) ||
              (r.engineer     || '').toLowerCase().includes(q) ||
              (r.serialNo     || '').toLowerCase().includes(q) ||
              (r.machineRef   || '').toLowerCase().includes(q) ||
              (r.title        || '').toLowerCase().includes(q)
            );
          }).map(r => (
            <div
              key={r.id}
              onClick={() => navigate(`/report/${r.id}`)}
              style={{ background: '#fff', border: `1px solid ${C.grey}`, borderLeft: `4px solid ${C.red}`, padding: '18px 20px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'box-shadow .15s, transform .15s', position: 'relative' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.13)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.black, letterSpacing: 0.5, lineHeight: 1.3, flex: 1, marginRight: 8 }}>{r.customerName || r.title}</div>
                {statusBadge(r.status)}
              </div>
              <div style={{ fontSize: 11, color: C.greyDk, marginBottom: 3 }}>Engineer: <strong style={{ color: C.black }}>{r.engineer || '—'}</strong></div>
              <div style={{ fontSize: 11, color: C.greyDk, marginBottom: 3 }}>Serial No: <strong style={{ color: C.black }}>{r.serialNo || '—'}</strong></div>
              <div style={{ fontSize: 11, color: C.greyDk, marginBottom: 3 }}>Date: <strong style={{ color: C.black }}>{r.date || '—'}</strong></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <span style={{ fontSize: 10, color: C.greyDk, letterSpacing: 0.5 }}>Updated {timeAgo(r.updatedAt)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {(() => { try { const keys = JSON.parse(r.originalFiles || '[]'); return keys.length > 0; } catch { return false; } })() && (
                    <button
                      onClick={e => openOriginals(e, r.id)}
                      style={{ background: 'none', border: 'none', color: C.greyDk, fontSize: 13, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}
                      title="Download original files"
                    >📎</button>
                  )}
                  <button
                    onClick={e => deleteReport(e, r.id)}
                    style={{ background: 'none', border: 'none', color: C.grey, fontSize: 14, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}
                    title="Delete report"
                  >✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        </> /* end reports tab */}
      </div>
    </div>
  );
}
