import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LOGO_URL } from './logo.js';

const C = {
  red: '#CC0000', redDk: '#AA0000', black: '#1A1A1A', white: '#FFFFFF',
  grey: '#CCCCCC', greyDk: '#888888', greyBg: '#F7F7F7', green: '#2d9e6b', orange: '#e85d04'
};

const FILTER_OPTIONS = [
  { label: 'A-Satisfactory',     bg: '#2d9e6b', match: (item) => item.status && item.status.startsWith('A-Satisfactory') },
  { label: 'B-Due next Service', bg: '#e85d04', match: (item) => item.status && (item.status.startsWith('B-Due') || item.status.startsWith('B-Next')) },
  { label: 'C-Urgent attention', bg: '#CC0000', match: (item) => item.status && item.status.startsWith('C-Urgent') },
  { label: 'N/A',                bg: '#888888', match: (item) => !item.status || item.status === 'N/A' },
];

function authHeaders(contentType) {
  const h = { Authorization: `Bearer ${localStorage.getItem('mp_token')}` };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status) {
  if (!status) return C.grey;
  if (status.startsWith('C-Urgent')) return C.red;
  if (status.startsWith('B-Due') || status.startsWith('B-Next')) return C.orange;
  if (status.startsWith('A-Satisfactory')) return C.greyDk;
  return C.grey;
}

function statusBadgeStyle(status) {
  const base = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  };
  if (!status) return { ...base, background: C.grey, color: C.white };
  if (status.startsWith('C-Urgent')) return { ...base, background: C.red, color: C.white };
  if (status.startsWith('B-Due') || status.startsWith('B-Next')) return { ...base, background: C.orange, color: C.white };
  if (status.startsWith('A-Satisfactory')) return { ...base, background: C.grey, color: C.black };
  return { ...base, background: '#e0e0e0', color: C.greyDk };
}

function borderLeftColor(item) {
  if (item.customerRequestedEstimate) return C.green;
  return statusColor(item.status);
}

function isActionable(status) {
  if (!status) return false;
  return status.startsWith('C-Urgent') || status.startsWith('B-Due') || status.startsWith('B-Next');
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ photos, startIndex, rotations = {}, onClose }) {
  const [idx, setIdx] = useState(startIndex);

  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % photos.length);
    if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + photos.length) % photos.length);
  }, [photos.length, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!photos || photos.length === 0) return null;

  const navBtnStyle = {
    position: 'fixed',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: C.white,
    fontSize: 28,
    cursor: 'pointer',
    padding: '12px 16px',
    borderRadius: 2,
    lineHeight: 1,
    fontFamily: 'Arial, sans-serif',
    zIndex: 1001,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photos.length > 1 && (
        <button
          style={{ ...navBtnStyle, left: 16 }}
          onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + photos.length) % photos.length); }}
        >
          ‹
        </button>
      )}

      <img
        src={photos[idx]}
        alt={`Photo ${idx + 1}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          display: 'block',
          transform: `rotate(${rotations[idx] || 0}deg)`,
          transition: 'transform 0.2s',
        }}
      />

      {photos.length > 1 && (
        <button
          style={{ ...navBtnStyle, right: 16 }}
          onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % photos.length); }}
        >
          ›
        </button>
      )}

      <div style={{
        position: 'fixed',
        bottom: 24,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: C.white,
        fontSize: 13,
        pointerEvents: 'none',
      }}>
        Photo {idx + 1}{photos.length > 1 ? ` of ${photos.length}` : ''}
      </div>
    </div>
  );
}

// ── Photo Gallery ─────────────────────────────────────────────────────────────

function PhotoGallery({ item, onUpdate }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const photos    = item.photos         || [];
  const rotations = item.photoRotations || {};

  const handlePhotoDownload = async (r2Key, filename) => {
    try {
      const token = localStorage.getItem('mp_token');
      const response = await fetch(
        `/api/sc-photos/download?key=${encodeURIComponent(r2Key)}&filename=${encodeURIComponent(filename)}`,
        {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${token}` },
        }
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
      console.error('[Download] Failed:', err);
      alert('Download failed: ' + err.message);
    }
  };

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`/api/sc-items/${item.id}/photos`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(item.id, { photos: data.photos || [] });
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleRotate(idx) {
    const current  = rotations[idx] || 0;
    const next     = (current + 90) % 360;
    const newRots  = { ...rotations, [idx]: next };
    onUpdate(item.id, { photoRotations: newRots });
    await fetch(`/api/sc-items/${item.id}/photos/${idx}/rotate`, {
      method: 'PATCH',
      headers: authHeaders('application/json'),
      body: JSON.stringify({ rotation: next }),
    });
  }

  async function handleDelete(idx) {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    const res = await fetch(`/api/sc-items/${item.id}/photos/${idx}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      onUpdate(item.id, { photos: data.photos || [], photoRotations: data.photoRotations || {} });
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 8 }}>
          {photos.map((photo, i) => (
            <div key={i} style={{ position: 'relative', width: 225, flexShrink: 0 }}>
              {/* Delete button — top right */}
              <button
                onClick={() => handleDelete(i)}
                title="Delete photo"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 28,
                  height: 28,
                  background: C.red,
                  border: 'none',
                  borderRadius: '50%',
                  color: C.white,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  padding: 0,
                  lineHeight: 1,
                  fontFamily: 'Arial, sans-serif',
                }}
              >
                ×
              </button>

              {/* Download button — top left */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!photo.r2Key) return;
                  const safeName = (item.itemName || 'photo').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                  const ext = photo.r2Key.split('.').pop().toLowerCase() || 'jpg';
                  handlePhotoDownload(photo.r2Key, `${safeName}_${i + 1}.${ext}`);
                }}
                title="Download photo"
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  width: 28,
                  height: 28,
                  background: C.green,
                  border: 'none',
                  borderRadius: '50%',
                  color: C.white,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  padding: 0,
                  lineHeight: 1,
                  fontFamily: 'Arial, sans-serif',
                }}
              >
                ↓
              </button>

              {/* Thumbnail */}
              <div style={{ overflow: 'hidden', borderRadius: '2px 2px 0 0', border: `1px solid ${C.grey}`, borderBottom: 'none' }}>
                <img
                  src={photo.signedUrl}
                  alt={`Photo ${i + 1}`}
                  onClick={() => window.open(photo.signedUrl, '_blank')}
                  style={{
                    width: 225,
                    height: 180,
                    objectFit: 'cover',
                    cursor: 'pointer',
                    display: 'block',
                    transform: `rotate(${rotations[i] || 0}deg)`,
                    transition: 'transform 0.2s',
                  }}
                />
              </div>

              {/* Rotate bar */}
              <div
                onClick={() => handleRotate(i)}
                style={{
                  background: C.red,
                  color: C.white,
                  fontSize: 10,
                  fontWeight: 700,
                  textAlign: 'center',
                  padding: '3px 0',
                  cursor: 'pointer',
                  borderRadius: '0 0 2px 2px',
                  userSelect: 'none',
                  border: `1px solid ${C.red}`,
                }}
              >
                ↻ Rotate
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => !uploading && fileInputRef.current && fileInputRef.current.click()}
        disabled={uploading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#F4F4F4',
          border: `1px solid ${C.grey}`,
          borderRadius: 3,
          padding: '5px 12px',
          fontSize: 12,
          fontWeight: 700,
          color: uploading ? C.greyDk : C.black,
          cursor: uploading ? 'wait' : 'pointer',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 400 }}>+</span>
        {uploading ? 'Uploading…' : 'Add Photo'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          rotations={rotations}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

// ── Item Card ─────────────────────────────────────────────────────────────────

function ItemCard({ item, onUpdate }) {
  const saveTimers = useRef({});
  const [savedFlash, setSavedFlash] = useState(false);

  function scheduleItemSave(itemId, patch) {
    clearTimeout(saveTimers.current[itemId]);
    saveTimers.current[itemId] = setTimeout(async () => {
      try {
        await fetch(`/api/sc-items/${itemId}`, {
          method: 'PATCH',
          headers: authHeaders('application/json'),
          body: JSON.stringify(patch),
        });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      } catch (_) {}
    }, 1500);
  }

  function handleActionNotes(e) {
    const val = e.target.value;
    onUpdate(item.id, { actionNotes: val });
    scheduleItemSave(item.id, { actionNotes: val, comments: item.comments });
  }

  function handleComments(e) {
    const val = e.target.value;
    onUpdate(item.id, { comments: val });
    scheduleItemSave(item.id, { actionNotes: item.actionNotes, comments: val });
  }

  async function handleApproved(e) {
    const checked = e.target.checked;
    const val = checked ? 1 : 0;
    onUpdate(item.id, { customerRequestedEstimate: val });
    await fetch(`/api/sc-items/${item.id}`, {
      method: 'PATCH',
      headers: authHeaders('application/json'),
      body: JSON.stringify({ customerRequestedEstimate: val }),
    });
  }

  async function handleStatusChange(e) {
    const status = e.target.value;
    onUpdate(item.id, { status });
    await fetch(`/api/sc-items/${item.id}`, {
      method: 'PATCH',
      headers: authHeaders('application/json'),
      body: JSON.stringify({ status }),
    });
  }

  const isFlagged = isActionable(item.status);

  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.grey}`,
      borderLeft: `4px solid ${borderLeftColor(item)}`,
      borderRadius: 2,
      padding: '20px 24px',
      marginBottom: 12,
      position: 'relative',
    }}>
      {/* Top row: name + status badge + recategorise dropdown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.black, lineHeight: 1.3, flex: 1 }}>
          {item.itemName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={statusBadgeStyle(item.status)}>{item.status || 'N/A'}</span>
          <select
            value={item.status || 'N/A'}
            onChange={handleStatusChange}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: `1px solid ${C.grey}`,
              borderRadius: 3,
              padding: '2px 4px',
              fontSize: 10,
              fontFamily: 'Arial, sans-serif',
              color: C.greyDk,
              background: C.white,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="C-Urgent attention">C-Urgent attention</option>
            <option value="B-Due next Service">B-Due next Service</option>
            <option value="A-Satisfactory">A-Satisfactory</option>
            <option value="N/A">N/A</option>
          </select>
        </div>
      </div>

      {/* Finding — only shown for non-flagged items (flagged items show it pre-populated in Comments) */}
      {!isFlagged && (
        item.finding ? (
          <div style={{ fontSize: 13, color: C.greyDk, fontStyle: 'italic', marginTop: 8, lineHeight: 1.5 }}>
            {item.finding}
          </div>
        ) : item.status && item.status.startsWith('A-Satisfactory') ? (
          <div style={{ fontSize: 13, color: C.grey, marginTop: 8 }}>No issues noted</div>
        ) : null
      )}

      {/* Photos */}
      <PhotoGallery item={item} onUpdate={onUpdate} />

      {/* Action fields */}
      {isFlagged && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 10, color: C.greyDk, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Comments
              </div>
              <textarea
                rows={2}
                value={item.comments || ''}
                onChange={handleComments}
                placeholder="Add comments…"
                style={{
                  width: '100%',
                  border: `1px solid ${C.grey}`,
                  borderRadius: 2,
                  padding: '6px 8px',
                  fontSize: 12,
                  fontFamily: 'Arial, sans-serif',
                  resize: 'vertical',
                  color: C.black,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 10, color: C.greyDk, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Action Required
              </div>
              <textarea
                rows={2}
                value={item.actionNotes || ''}
                onChange={handleActionNotes}
                placeholder="Add action notes…"
                style={{
                  width: '100%',
                  border: `1px solid ${C.grey}`,
                  borderRadius: 2,
                  padding: '6px 8px',
                  fontSize: 12,
                  fontFamily: 'Arial, sans-serif',
                  resize: 'vertical',
                  color: C.black,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Customer requested estimate checkbox */}
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: C.black }}>
              <input
                type="checkbox"
                checked={!!item.customerRequestedEstimate}
                onChange={handleApproved}
                style={{ accentColor: C.green, width: 14, height: 14 }}
              />
              {item.customerRequestedEstimate
                ? <span style={{ color: C.green, fontWeight: 700 }}>✓ Customer requested estimate</span>
                : <span>Customer requested estimate</span>
              }
            </label>
          </div>

          {/* Saved indicator */}
          {savedFlash && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: C.greyDk, fontStyle: 'italic' }}>Saved</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section Group ─────────────────────────────────────────────────────────────

function SectionGroup({ sectionName, items, onUpdate }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10,
        color: C.greyDk,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        fontWeight: 700,
        borderLeft: `3px solid ${C.red}`,
        paddingLeft: 10,
        marginBottom: 8,
      }}>
        {sectionName}
      </div>
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

function FilterBar({ activeFilters, onToggleFilter, allItems, reportId, filteredItems, report }) {
  const [downloading, setDownloading] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [catalystWarning, setCatalystWarning] = useState(false);

  async function handleDownload() {
    const tickedItems = allItems.filter((i) => i.customerRequestedEstimate);
    if (tickedItems.length === 0) {
      setCatalystWarning(true);
      return;
    }
    setCatalystWarning(false);
    const itemIds = tickedItems.map((i) => i.id);
    setDownloading(true);
    try {
      const res = await fetch(`/api/sc-reports/${reportId}/export-catalyst`, {
        method: 'POST',
        headers: authHeaders('application/json'),
        body: JSON.stringify({ itemIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeSite = (report?.site || report?.machineType || 'Site').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const today = new Date().toISOString().slice(0, 10);
      a.download = `Catalyst_Import_${safeSite}_${today}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function handlePdfDownload() {
    setPdfDownloading(true);
    // If no filters active and no items individually selected, send empty array → header-only PDF
    const itemIds = activeFilters.size === 0 ? [] : filteredItems.map((i) => i.id);
    try {
      const res = await fetch(`/api/sc-reports/${reportId}/download-pdf`, {
        method: 'POST',
        headers: authHeaders('application/json'),
        body: JSON.stringify({ itemIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'PDF generation failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sitePdf = (report?.site || report?.machineType || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const today = new Date().toISOString().slice(0, 10);
      a.download = `Report_${sitePdf}_${today}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfDownloading(false);
    }
  }

  return (
    <div style={{
      background: C.white,
      borderBottom: `1px solid ${C.grey}`,
      padding: '10px 32px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      {FILTER_OPTIONS.map((opt) => {
        const count = allItems.filter((i) => opt.match(i)).length;
        const active = activeFilters.has(opt.label);
        return (
          <button
            key={opt.label}
            onClick={() => onToggleFilter(opt.label)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              userSelect: 'none',
              background: active ? opt.bg : '#F4F4F4',
              color: active ? C.white : C.black,
              border: 'none',
              borderLeft: `4px solid ${opt.bg}`,
              borderRadius: 3,
              padding: '6px 12px 6px 10px',
              fontFamily: 'Arial, sans-serif',
              fontWeight: 700,
              fontSize: 12,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {opt.label}
            <span style={{
              background: active ? 'rgba(255,255,255,0.25)' : C.grey,
              color: active ? C.white : C.greyDk,
              borderRadius: 10,
              padding: '1px 6px',
              fontSize: 10,
              fontWeight: 600,
              transition: 'background 0.12s, color 0.12s',
            }}>
              {count}
            </span>
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      <button
        onClick={handlePdfDownload}
        disabled={pdfDownloading}
        style={{
          background: pdfDownloading ? C.greyBg : C.white,
          color: pdfDownloading ? C.greyDk : C.black,
          border: `1px solid ${C.grey}`,
          borderRadius: 2,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 700,
          cursor: pdfDownloading ? 'default' : 'pointer',
          fontFamily: 'Arial, sans-serif',
          whiteSpace: 'nowrap',
        }}
      >
        {pdfDownloading ? 'Generating…' : 'Download Selected as PDF'}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            background: downloading ? C.greyBg : C.black,
            color: downloading ? C.greyDk : C.white,
            border: `1px solid ${C.grey}`,
            borderRadius: 2,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: downloading ? 'default' : 'pointer',
            fontFamily: 'Arial, sans-serif',
            whiteSpace: 'nowrap',
          }}
        >
          {downloading ? 'Exporting…' : 'Generate Catalyst Import'}
        </button>
        {catalystWarning && (
          <div style={{ fontSize: 11, color: C.red, maxWidth: 260, textAlign: 'right', lineHeight: 1.4 }}>
            No items selected — please tick 'Customer requested estimate' on the items to include
          </div>
        )}
      </div>
    </div>
  );
}

// ── Machine Details Panel ─────────────────────────────────────────────────────

function MachinePanel({ report, allItems, onReportUpdate }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue,    setEditValue]    = useState('');

  if (!report) return null;

  function scoreDisplay(score) {
    if (!score) return '—';
    const m = score.match(/(\d+)\/(\d+)/);
    if (m) {
      const pct = (parseInt(m[1]) / parseInt(m[2]) * 100).toFixed(2);
      return `${score} (${pct}%)`;
    }
    return score;
  }

  function startEdit(field, current) {
    setEditingField(field);
    setEditValue(current || '');
  }

  async function commitEdit(field) {
    setEditingField(null);
    const patch = { [field]: editValue };
    onReportUpdate(patch);
    await fetch(`/api/sc-reports/${report.id}`, {
      method: 'PATCH',
      headers: authHeaders('application/json'),
      body: JSON.stringify(patch),
    });
  }

  const labelStyle = { fontSize: 9, color: C.greyDk, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 3 };
  const valueStyle = { fontSize: 14, fontWeight: 700, color: C.black };
  const cellStyle  = { flex: 1, padding: '10px 20px', borderRight: `1px solid ${C.grey}` };
  const cellLast   = { flex: 1, padding: '10px 20px' };

  const editableInputStyle = {
    fontSize: 14,
    fontWeight: 700,
    color: C.black,
    border: 'none',
    borderBottom: `2px solid ${C.red}`,
    background: 'transparent',
    outline: 'none',
    fontFamily: 'Arial, sans-serif',
    width: '100%',
    padding: 0,
  };

  function EditableCell({ field, label, value, cellS, displayValue }) {
    return (
      <div style={cellS} title="Click to edit">
        <div style={labelStyle}>{label} ✎</div>
        {editingField === field ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit(field)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(field); if (e.key === 'Escape') setEditingField(null); }}
            style={editableInputStyle}
          />
        ) : (
          <div
            style={{ ...valueStyle, cursor: 'text', borderBottom: `1px dashed ${C.grey}` }}
            onClick={() => startEdit(field, value)}
          >
            {displayValue || value || '—'}
          </div>
        )}
      </div>
    );
  }

  const flaggedCount = allItems.filter(i => i.status && (i.status.startsWith('C-Urgent') || i.status.startsWith('B-Due') || i.status.startsWith('B-Next'))).length;
  const actionsCount = allItems.filter(i => i.actionNotes && i.actionNotes.trim()).length;

  return (
    <div style={{ background: C.greyBg, borderBottom: `1px solid ${C.grey}` }}>
      {/* Main row — editable fields */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.grey}` }}>
        <EditableCell field="score"        label="Score"                 value={report.score}        cellS={cellStyle} displayValue={scoreDisplay(report.score)} />
        <EditableCell field="engineer"     label="Prepared by"           value={report.engineer}     cellS={cellStyle} />
        <EditableCell field="machineType"  label="Machine Type"          value={report.machineType}  cellS={cellStyle} />
        <EditableCell field="machineHours" label="Machine HRS"           value={report.machineHours} cellS={cellStyle}
          displayValue={report.machineHours ? `${report.machineHours} hrs` : '—'} />
        <EditableCell field="machineSerial" label="Machine Serial Number" value={report.machineSerial} cellS={cellStyle} />
        <EditableCell field="inspectionDate" label="Conducted on"        value={report.inspectionDate} cellS={cellLast} />
      </div>
      {/* Stats row — live counts */}
      <div style={{ display: 'flex', padding: '6px 20px', gap: 24 }}>
        <span style={{ fontSize: 11, color: flaggedCount > 0 ? C.red : C.greyDk, fontWeight: flaggedCount > 0 ? 700 : 400 }}>
          Flagged Items: {flaggedCount}
        </span>
        <span style={{ fontSize: 11, color: actionsCount > 0 ? C.orange : C.greyDk, fontWeight: actionsCount > 0 ? 700 : 400 }}>
          Actions: {actionsCount}
        </span>
      </div>
    </div>
  );
}

// ── Main Header ───────────────────────────────────────────────────────────────

function Header({ report, navigate, onReportUpdate }) {
  const [editingSite, setEditingSite] = useState(false);
  const [siteValue,   setSiteValue]   = useState('');

  function startSiteEdit() {
    setSiteValue(report?.site || '');
    setEditingSite(true);
  }

  async function commitSiteEdit() {
    setEditingSite(false);
    if (!report) return;
    onReportUpdate({ site: siteValue });
    await fetch(`/api/sc-reports/${report.id}`, {
      method: 'PATCH',
      headers: authHeaders('application/json'),
      body: JSON.stringify({ site: siteValue }),
    });
  }

  return (
    <header style={{
      background: C.black,
      borderBottom: `3px solid ${C.red}`,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 200,
    }}>
      <img src={LOGO_URL} alt="Logo" style={{ height: 32, objectFit: 'contain', flexShrink: 0 }} />

      {report && (
        <div style={{ flex: 1, textAlign: 'center' }}>
          {editingSite ? (
            <input
              autoFocus
              value={siteValue}
              onChange={(e) => setSiteValue(e.target.value)}
              onBlur={commitSiteEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSiteEdit(); if (e.key === 'Escape') setEditingSite(false); }}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${C.red}`,
                color: C.white,
                fontWeight: 700,
                fontSize: 15,
                fontFamily: 'Arial, sans-serif',
                textAlign: 'center',
                outline: 'none',
                minWidth: 200,
                padding: 0,
              }}
            />
          ) : (
            <span
              onClick={startSiteEdit}
              title="Click to edit"
              style={{ color: C.white, fontWeight: 700, fontSize: 15, cursor: 'text', borderBottom: '1px dashed rgba(255,255,255,0.3)' }}
            >
              {report.site || report.machineType || '—'}
            </span>
          )}
        </div>
      )}

      <div style={{ flexShrink: 0 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: C.red,
            border: 'none',
            color: C.white,
            padding: '8px 20px',
            cursor: 'pointer',
            borderRadius: 2,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'Arial, sans-serif',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = C.redDk)}
          onMouseOut={(e) => (e.currentTarget.style.background = C.red)}
        >
          ← Return to Dashboard
        </button>
      </div>
    </header>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SCReportViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [itemMap, setItemMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/sc-reports/${id}`, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load report (${r.status})`);
        return r.json();
      })
      .then((data) => {
        setReport(data.report);
        const map = {};
        (data.items || []).forEach((item) => { map[item.id] = item; });
        setItemMap(map);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  function handleUpdateItem(itemId, patch) {
    setItemMap((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  }

  function handleUpdateReport(patch) {
    setReport((prev) => ({ ...prev, ...patch }));
  }

  if (loading) {
    return (
      <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: C.greyBg }}>
        <Header report={null} navigate={navigate} />
        <div style={{ textAlign: 'center', padding: 80, color: C.greyDk, fontSize: 14 }}>
          Loading report…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: C.greyBg }}>
        <Header report={null} navigate={navigate} />
        <div style={{ maxWidth: 600, margin: '48px auto', padding: '0 24px' }}>
          <div style={{
            background: '#FFF0F0',
            border: `1px solid ${C.red}`,
            color: C.red,
            borderRadius: 2,
            padding: '16px 20px',
            fontSize: 14,
          }}>
            {error} —{' '}
            <span
              onClick={() => navigate('/dashboard')}
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
            >
              Go back
            </span>
          </div>
        </div>
      </div>
    );
  }

  const allItems = Object.values(itemMap);

  function toggleFilter(label) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  // If no filters active, show all; otherwise show items matching any active filter
  const filteredItems = activeFilters.size === 0
    ? allItems
    : allItems.filter((item) =>
        FILTER_OPTIONS.some((opt) => activeFilters.has(opt.label) && opt.match(item))
      );

  // Group by section (preserving insertion order)
  const sectionMap = {};
  const sectionOrder = [];
  allItems.forEach((item) => {
    const sec = item.section || 'General';
    if (!sectionMap[sec]) {
      sectionMap[sec] = [];
      sectionOrder.push(sec);
    }
  });

  filteredItems.forEach((item) => {
    const sec = item.section || 'General';
    if (!sectionMap[sec]) {
      sectionMap[sec] = [];
      sectionOrder.push(sec);
    }
    sectionMap[sec].push(item);
  });

  // Reset section arrays and re-populate with filtered
  sectionOrder.forEach((sec) => { sectionMap[sec] = []; });
  filteredItems.forEach((item) => {
    const sec = item.section || 'General';
    sectionMap[sec].push(item);
  });

  function handleLogout() {
    localStorage.removeItem('mp_token');
    localStorage.removeItem('mp_email');
    navigate('/');
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: C.greyBg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header report={report} navigate={navigate} onReportUpdate={handleUpdateReport} />

      <div style={{ position: 'sticky', top: 56, zIndex: 150 }}>
        <MachinePanel report={report} allItems={allItems} onReportUpdate={handleUpdateReport} />
        <FilterBar
          activeFilters={activeFilters}
          onToggleFilter={toggleFilter}
          allItems={allItems}
          reportId={id}
          filteredItems={filteredItems}
          report={report}
        />
      </div>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px', flex: 1, width: '100%', boxSizing: 'border-box' }}>
        {sectionOrder.map((sec) =>
          sectionMap[sec].length > 0 ? (
            <SectionGroup
              key={sec}
              sectionName={sec}
              items={sectionMap[sec]}
              onUpdate={handleUpdateItem}
            />
          ) : null
        )}

        {filteredItems.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: C.greyDk,
            padding: 48,
            fontSize: 13,
            border: `2px dashed ${C.grey}`,
            borderRadius: 2,
          }}>
            No items match this filter
          </div>
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '16px 24px', borderTop: `1px solid ${C.grey}` }}>
        <button
          onClick={handleLogout}
          style={{
            background: 'none',
            border: 'none',
            color: C.greyDk,
            fontSize: 11,
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          Logout
        </button>
      </footer>
    </div>
  );
}
