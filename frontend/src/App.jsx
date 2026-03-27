import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from 'react-router-dom';

/* ─── Brand tokens ─────────────────────────────────────────────────── */
const C = {
  red:    '#CC0000',
  redDk:  '#AA0000',
  black:  '#1A1A1A',
  white:  '#FFFFFF',
  grey:   '#CCCCCC',
  greyDk: '#888888',
  greyBg: '#F7F7F7',
  card:   '#FFFFFF',
  border: '#CCCCCC',
  green:  '#2d9e6b',
  orange: '#e85d04',
};

import { LOGO_URL } from './logo.js';

/* ─── Styles ────────────────────────────────────────────────────────── */
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.greyBg};color:${C.black};font-family:'Barlow',sans-serif}
  .app{min-height:100vh;background:${C.greyBg}}

  /* Header */
  .hd{border-bottom:3px solid ${C.red};padding:14px 40px;display:flex;align-items:center;justify-content:space-between;background:${C.white};position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .logo{display:flex;align-items:center;height:44px}
  .logo img{height:44px;width:auto;object-fit:contain}
  .tag{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${C.greyDk};border:1px solid ${C.grey};padding:4px 12px}

  /* Main */
  .main{padding:32px 40px;max-width:1200px;margin:0 auto}

  /* Upload page */
  .upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
  .upload-zone{display:block;position:relative;border:2px dashed ${C.grey};padding:48px 28px;text-align:center;cursor:pointer;transition:all .2s;background:${C.white};border-radius:4px}
  .upload-zone:hover,.upload-zone.over{border-color:${C.red};background:rgba(204,0,0,.04)}
  .upload-zone.selected{border-color:${C.red};border-style:solid}
  .upload-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
  .uz-icon{font-size:44px;display:block;margin-bottom:16px}
  .uz-title{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;color:${C.black}}
  .uz-sub{font-size:13px;color:${C.greyDk};font-weight:300;line-height:1.6}
  .uz-chosen{margin-top:14px;font-size:13px;color:${C.red};font-weight:600}
  .uz-thumbs{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;justify-content:center}
  .uz-thumb{width:60px;height:48px;object-fit:cover;border:1px solid ${C.border}}

  .go-btn{width:100%;padding:20px;background:${C.red};color:${C.white};border:none;cursor:pointer;
    font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;letter-spacing:3px;text-transform:uppercase;
    transition:background .2s;display:flex;align-items:center;justify-content:center;gap:12px}
  .go-btn:hover:not(:disabled){background:${C.redDk}}
  .go-btn:disabled{opacity:.4;cursor:not-allowed}
  .prog{width:100%;height:3px;background:${C.border};margin-top:20px;overflow:hidden}
  .prog-fill{height:100%;background:${C.red};animation:prg 2s ease-in-out infinite}
  @keyframes prg{0%{width:0%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0%;margin-left:100%}}
  .status-line{text-align:center;font-family:'Barlow Condensed',sans-serif;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:${C.greyDk};margin-top:14px}
  .err{background:#fff5f5;border:1px solid ${C.red};padding:14px 18px;color:${C.red};margin-top:20px;font-size:14px;border-radius:3px}

  /* Report page */
  .rpt-hd{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;padding-bottom:20px;border-bottom:2px solid ${C.red}}
  .meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:${C.grey};border:1px solid ${C.grey};margin-bottom:24px;border-radius:4px;overflow:hidden}
  .meta-cell{background:${C.white};padding:10px 14px;display:flex;flex-direction:column;gap:3px}
  .meta-lbl{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.greyDk}}
  .meta-val{font-size:14px;font-weight:600;color:${C.black};font-family:'Barlow Condensed',sans-serif;letter-spacing:.5px}
  .meta-val.empty{color:${C.grey};font-weight:400;font-style:italic;font-size:13px}
  .meta-input{background:none;border:none;outline:none;width:100%;padding:0;margin:0;cursor:text;border-bottom:1px solid transparent;transition:border-color .15s}
  .meta-input:hover,.meta-input:focus{border-bottom-color:${C.grey}}
  .meta-input::placeholder{color:${C.grey};font-weight:400;font-style:italic;font-size:13px}
  .rpt-title{font-family:'Barlow Condensed',sans-serif;font-size:34px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:${C.black}}
  .rpt-meta{font-size:12px;color:${C.greyDk};margin-top:6px;font-weight:400}
  .rpt-meta strong{color:${C.black};font-weight:600}
  .hd-btns{display:flex;gap:10px;flex-shrink:0}
  .btn{padding:11px 22px;background:transparent;color:${C.red};border:2px solid ${C.red};cursor:pointer;
    font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;transition:all .2s;white-space:nowrap}
  .btn:hover{background:${C.red};color:${C.white}}
  .btn.solid{background:${C.red};color:${C.white}}
  .btn.solid:hover{background:${C.redDk}}
  .btn-row{display:flex;gap:10px}

  /* Summary stats */
  .stats{display:flex;margin-bottom:28px;border:1px solid ${C.grey};background:${C.white};border-radius:4px;overflow:hidden}
  .stat{flex:1;text-align:center;padding:18px 8px;border-right:1px solid ${C.grey};cursor:pointer;transition:background .15s;user-select:none}
  .stat:last-child{border-right:none}
  .stat:hover{background:#fafafa}
  .stat.active{background:#fff0f0;border-bottom:3px solid ${C.red};}
  .stat-check{width:14px;height:14px;accent-color:${C.red};cursor:pointer;margin-bottom:6px;display:block;margin-left:auto;margin-right:auto}
  .stat .n{font-family:'Barlow Condensed',sans-serif;font-size:38px;font-weight:900;display:block}
  .stat .n.A{color:${C.green}}
  .stat .n.B{color:${C.orange}}
  .stat .n.C{color:${C.red}}
  .stat .n.na{color:${C.greyDk}}
  .stat .n.all{color:${C.white}}
  .stat .l{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.greyDk};font-weight:700}

  /* Filter notice */
  .filter-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#fff0f0;border:1px solid rgba(204,0,0,.3);margin-bottom:16px;border-radius:3px}
  .filter-lbl{font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.red}}
  .filter-clear{font-size:12px;color:${C.greyDk};cursor:pointer;text-decoration:underline}
  .filter-clear:hover{color:${C.white}}

  /* Items */
  .items{display:flex;flex-direction:column;gap:10px}
  .cat-hd{font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;
    color:${C.red};padding:14px 0 5px;border-bottom:2px solid ${C.grey};margin-bottom:2px;margin-top:6px}
  .cat-hd:first-child{margin-top:0}

  .icard{background:${C.white};border:1px solid ${C.grey};border-left:4px solid ${C.grey};border-radius:3px}
  .icard.A{border-left-color:${C.green}}
  .icard.B{border-left-color:${C.orange}}
  .icard.C{border-left-color:${C.red}}
  .icard.na{border-left-color:#444;opacity:.55}
  .ihd{display:grid;grid-template-columns:44px 1fr auto auto;gap:14px;align-items:center;padding:13px 18px}
  .inum{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900;color:${C.grey}}
  .iname{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${C.black}}
  .ibadge{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;padding:4px 11px;text-transform:uppercase}
  .ibadge.A{background:rgba(45,158,107,.15);color:${C.green};border:1px solid ${C.green}}
  .ibadge.B{background:rgba(232,93,4,.15);color:${C.orange};border:1px solid ${C.orange}}
  .ibadge.C{background:rgba(204,0,0,.15);color:${C.red};border:1px solid ${C.red}}
  .ibadge.na{background:#2a2a2a;color:${C.greyDk};border:1px solid ${C.border}}
  .isel{background:${C.greyBg};border:1px solid ${C.grey};color:${C.black};padding:5px 9px;font-size:13px;cursor:pointer;outline:none;border-radius:3px}
  .isel:focus{border-color:${C.red}}

  .ibody{padding:0 18px 18px 74px}
  .flbl{font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${C.greyDk};margin-bottom:7px;color:#555}
  .ita{width:100%;background:${C.greyBg};border:1px solid ${C.grey};color:${C.black};padding:9px 13px;
    font-family:'Barlow',sans-serif;font-size:13px;font-weight:300;resize:vertical;min-height:52px;outline:none;transition:border-color .2s}
  .ita:focus{border-color:${C.red}}
  .drop-zone{min-height:68px;border:2px dashed ${C.grey};padding:8px;margin-top:10px;
    transition:all .2s;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
  .drop-zone.over{border-color:${C.red};background:rgba(204,0,0,.04)}
  .drop-hint{width:100%;display:flex;align-items:center;justify-content:center;color:${C.grey};font-size:12px;letter-spacing:1px;min-height:50px;cursor:pointer}
  .photo-wrap{position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:0;flex-shrink:0;border:2px solid ${C.grey};background:${C.white};border-radius:3px;overflow:visible;transition:border-color .15s}
  .photo-wrap:hover{border-color:${C.red}}
  .photo-wrap.selected{border-color:${C.red};outline:2px solid ${C.red};outline-offset:1px}
  .photo-delete{position:absolute;top:-7px;right:-7px;width:18px;height:18px;background:${C.red};color:white;border:none;border-radius:50%;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;z-index:10;padding:0}
  .photo-delete:hover{background:#AA0000}
  .photo-wrap.dragging{opacity:.35}
  .pthumb-container{width:100px;height:80px;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:grab;background:${C.greyBg}}
  .pthumb{width:100px;height:80px;object-fit:cover;display:block;transition:transform .25s ease}
  .rotate-btn{width:100%;background:${C.red};color:#fff;border:none;font-size:10px;padding:4px 0;cursor:pointer;font-family:'Barlow Condensed',sans-serif;letter-spacing:1px;text-transform:uppercase;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;line-height:1}
  .rotate-btn:hover{background:${C.redDk}}

  .footer{margin-top:28px;padding-top:20px;border-top:1px solid ${C.grey};display:flex;justify-content:flex-end;gap:10px}
  .spinner{width:17px;height:17px;border:2px solid rgba(255,255,255,.3);border-top-color:${C.white};border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
  @keyframes spin{to{transform:rotate(360deg)}}
`;

/* ─── Helpers ───────────────────────────────────────────────────────── */
// Read file via ArrayBuffer and convert to base64 manually.
// This avoids any browser recompression that readAsDataURL can apply and
// guarantees the bytes sent to the server are bit-for-bit identical to the
// original file on disk.
const toDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => {
    const uint8 = new Uint8Array(r.result);
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < uint8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK));
    }
    const base64  = btoa(binary);
    const mime    = file.type || 'image/png';
    res(`data:${mime};base64,${base64}`);
  };
  r.onerror = rej;
  r.readAsArrayBuffer(file);
});

const uid = () => Math.random().toString(36).slice(2);

const statusLabel = s => s==='A'?'A — Satisfactory':s==='B'?'B — Due Next Service':s==='C'?'C — Urgent Attention':'N/A';
const statusColor = s => s==='A'?C.green:s==='B'?C.orange:s==='C'?C.red:C.greyDk;
const statusBg    = s => s==='A'?'#d8f3e8':s==='B'?'#fff0eb':s==='C'?'#fde8e6':'#f0f0f0';

/* ─── Component ─────────────────────────────────────────────────────── */
export default function MachineryPilotInspection() {
  const { id: urlId }  = useParams();
  const navigate       = useNavigate();

  const [pdfFile,         setPdfFile]         = useState(null);
  const [photoFiles,      setPhotoFiles]      = useState([]);   // {id,file,dataURL,name}
  const [dragPdf,         setDragPdf]         = useState(false);
  const [dragPhotos,      setDragPhotos]      = useState(false);
  const [processing,      setProcessing]      = useState(false);
  const [statusMsg,       setStatusMsg]       = useState('');
  const [report,          setReport]          = useState(null);
  const [error,           setError]           = useState(null);
  const [activeFilters,   setActiveFilters]   = useState(new Set()); // empty = show all
  const [dragging,        setDragging]        = useState(null);
  const [dragOverItem,    setDragOverItem]    = useState(null);
  const [dlState,         setDlState]         = useState({ pdf: false, docx: false });
  const [selectedPhoto,   setSelectedPhoto]   = useState(null); // {photoId, itemId}
  const [dbId,            setDbId]            = useState(null);
  const [reportStatus,    setReportStatus]    = useState('Open');
  const [hasOriginals,    setHasOriginals]    = useState(false);
  const [saveIndicator,   setSaveIndicator]   = useState(false); // "Saved ✓" flash
  const saveTimer   = useRef(null);
  const initialLoad = useRef(true);

  /* ── File handlers ── */
  const addPdf = useCallback((file) => {
    if (file?.type === 'application/pdf') {
      setPdfFile(file);
      setPhotoFiles([]);   // clear photos — either/or
      setError(null);
    } else setError('Please upload a PDF file.');
  }, []);

  const addPhotos = useCallback(async (files) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    const loaded = await Promise.all(imgs.map(async f => ({ id: uid(), file: f, dataURL: await toDataURL(f), name: f.name, rotation: 0 })));
    setPdfFile(null);       // clear PDF — either/or
    setPhotoFiles(loaded);  // replace, don't append
    setError(null);
  }, []);

  /* ── Auth header helper ── */
  const authHdr = () => ({ Authorization: `Bearer ${localStorage.getItem('mp_token')}` });

  /* ── Load existing report from URL param ── */
  useEffect(() => {
    if (!urlId) return;
    fetch(`/api/reports/${urlId}`, { headers: authHdr() })
      .then(r => { if (r.status === 401) { navigate('/'); return null; } return r.json(); })
      .then(data => {
        if (!data || data.error) return;
        const parsed = typeof data.reportJson === 'string' ? JSON.parse(data.reportJson) : data.reportJson;
        setReport(parsed);
        setDbId(data.id);
        setReportStatus(data.status || 'Open');
        const keys = typeof data.originalFiles === 'string' ? JSON.parse(data.originalFiles || '[]') : (data.originalFiles || []);
        setHasOriginals(keys.length > 0);
        setActiveFilters(new Set());
        initialLoad.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId]);

  /* ── Auto-save (debounced 2 s) ── */
  const doSave = useCallback(async (currentReport, currentStatus, currentDbId) => {
    if (!currentDbId || !currentReport) return;
    try {
      const res = await fetch(`/api/reports/${currentDbId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHdr() },
        body: JSON.stringify({
          title:          currentReport.title || 'Untitled',
          serialNo:       currentReport.serialNo || '',
          engineSerialNo: currentReport.engineSerialNo || '',
          date:           currentReport.date || '',
          machineHours:   currentReport.machineHours || '',
          customerName:   currentReport.customerName || '',
          engineer:       currentReport.engineer || '',
          status:         currentStatus,
          reportJson:     currentReport,
        }),
      });
      if (res.ok) { setSaveIndicator(true); setTimeout(() => setSaveIndicator(false), 2000); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!report || !dbId) return;
    if (initialLoad.current) { initialLoad.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(report, reportStatus, dbId), 2000);
    return () => clearTimeout(saveTimer.current);
  }, [report, reportStatus, dbId, doSave]);

  /* ── Process — sends files to Express backend ── */
  const process = async () => {
    if (!pdfFile && photoFiles.length === 0) {
      setError('Please upload an inspection PDF or photos of the form.');
      return;
    }

    setProcessing(true); setError(null); setReport(null);

    try {
      const formData = new FormData();
      if (pdfFile) {
        setStatusMsg('Uploading PDF — server will render pages at 300 DPI…');
        formData.append('files', pdfFile);
      } else {
        setStatusMsg(`Uploading ${photoFiles.length} photo${photoFiles.length > 1 ? 's' : ''}…`);
        photoFiles.forEach(p => formData.append('files', p.file));
      }

      const resp = await fetch('/api/process', {
        method: 'POST',
        headers: authHdr(),
        body: formData,
      });

      setStatusMsg('Extracting inspection data…');

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(errData.error || `Server error: ${resp.status}`);
      }

      const parsed = await resp.json();
      if (parsed.error) throw new Error(parsed.error);

      const newReport = {
        title:          (parsed.reportTitle || 'Inspection Report').replace(/\s*[-–—]+\s*SafetyCulture\s*/i, '').trim(),
        engineer:       parsed.engineer || '',
        serialNo:       parsed.serialNo || '',
        engineSerialNo: parsed.engineSerialNo || '',
        date:           parsed.date || '',
        machineHours:   parsed.machineHours || '',
        customerName:   parsed.customerName || '',
        items:          (parsed.items || []).map(item => ({
          ...item,
          category: item.category || '',
          photos:   [],
          comment:  item.comment || '',
        })),
      };
      setReport(newReport);
      setActiveFilters(new Set());
      // Create DB record and navigate to /report/:id
      try {
        const r2Keys = parsed._r2Keys || [];
        const saved = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHdr() },
          body: JSON.stringify({
            title: newReport.title, engineer: newReport.engineer,
            serialNo: newReport.serialNo, engineSerialNo: newReport.engineSerialNo,
            date: newReport.date, machineHours: newReport.machineHours,
            customerName: newReport.customerName, status: 'Open', reportJson: newReport,
            originalFiles: r2Keys,
          }),
        });
        if (saved.ok) {
          const row = await saved.json();
          setDbId(row.id);
          setReportStatus('Open');
          setHasOriginals(r2Keys.length > 0);
          initialLoad.current = false;
          navigate(`/report/${row.id}`, { replace: true });
        }
      } catch { /* continue without DB — not fatal */ }
    } catch (err) {
      setError(`Processing failed: ${err.message}`);
    } finally {
      setProcessing(false); setStatusMsg('');
    }
  };

  /* ── Item edits ── */
  const updateItem = (id, field, val) =>
    setReport(prev => ({ ...prev, items: prev.items.map(i => i.id === id ? { ...i, [field]: val } : i) }));

  /* ── Photo drag between items ── */
  const movePhoto = useCallback((photoId, srcId, tgtId) => {
    if (srcId === tgtId) return;
    setReport(prev => {
      let photo = null;
      const items = prev.items.map(item => {
        if (item.id === srcId) { photo = item.photos.find(p => p.id === photoId); return { ...item, photos: item.photos.filter(p => p.id !== photoId) }; }
        return item;
      });
      return { ...prev, items: items.map(item => item.id === tgtId && photo ? { ...item, photos: [...item.photos, photo] } : item) };
    });
  }, []);

  const rotatePhoto = useCallback((photoId, itemId) => {
    setReport(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId
          ? { ...item, photos: item.photos.map(p => p.id === photoId ? { ...p, rotation: ((p.rotation || 0) + 90) % 360 } : p) }
          : item
      )
    }));
  }, []);

  const deletePhoto = useCallback((photoId, itemId) => {
    setReport(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId
          ? { ...item, photos: item.photos.filter(p => p.id !== photoId) }
          : item
      )
    }));
    setSelectedPhoto(sel => sel?.photoId === photoId ? null : sel);
  }, []);

  // Keyboard delete for selected photo
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPhoto) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        deletePhoto(selectedPhoto.photoId, selectedPhoto.itemId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPhoto, deletePhoto]);

  const handleItemDrop = useCallback((e, tgtId) => {
    e.preventDefault(); setDragOverItem(null);
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) {
      Promise.all(files.map(async f => ({ id: uid(), url: await toDataURL(f), name: f.name, rotation: 0 }))).then(photos => {
        setReport(prev => ({ ...prev, items: prev.items.map(i => i.id === tgtId ? { ...i, photos: [...i.photos, ...photos] } : i) }));
      });
    } else if (dragging) {
      movePhoto(dragging.photoId, dragging.srcId, tgtId);
    }
    setDragging(null);
  }, [dragging, movePhoto]);

  /* ── Filtered items ── */
  const filteredItems = report
    ? (activeFilters.size === 0 ? report.items : report.items.filter(i => activeFilters.has(i.status)))
    : [];

  /* ── Download as HTML (→ PDF via browser print) ── */
  /* ── Download helpers ── */
  async function triggerDownload(endpoint, key, ext, mime) {
    const itemsToExport = activeFilters.size === 0 ? report.items : report.items.filter(i => activeFilters.has(i.status));
    const reportPayload = { ...report, activeFilters: [...activeFilters] };
    setDlState(s => ({ ...s, [key]: true }));
    try {
      const res = await fetch(`/api/download/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHdr() },
        body: JSON.stringify({ report: reportPayload, items: itemsToExport }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (report.title || 'Inspection-Report').replace(/\s+/g, '-') +
        (activeFilters.size > 0 ? '-filtered' : '') + ext;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert('Download failed: ' + err.message);
    } finally {
      setDlState(s => ({ ...s, [key]: false }));
    }
  }

  const downloadPDF  = () => triggerDownload('pdf',  'pdf',  '.pdf',  'application/pdf');
  const downloadDocx = () => triggerDownload('docx', 'docx', '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  async function downloadOriginals() {
    if (!dbId) return;
    try {
      const res = await fetch(`/api/reports/${dbId}/originals`, { headers: authHdr() });
      const { urls } = await res.json();
      if (!urls || urls.length === 0) { alert('No original files stored for this report.'); return; }
      urls.forEach(url => window.open(url, '_blank'));
    } catch { alert('Failed to fetch original files.'); }
  }


  /* ── Counts ── */
  const counts = report ? {
    all: report.items.length,
    A:   report.items.filter(i=>i.status==='A').length,
    B:   report.items.filter(i=>i.status==='B').length,
    C:   report.items.filter(i=>i.status==='C').length,
    na:  report.items.filter(i=>i.status==='na').length,
  } : {};

  /* ── Render ── */
  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* Header */}
        <div className="hd">
          <div className="logo"><img src={LOGO_URL} alt="RK6" /></div>
          <button className="btn" onClick={()=>navigate('/dashboard')}>← Dashboard</button>
        </div>

        <div className="main">

          {/* ══ UPLOAD SCREEN ══ */}
          {!report && (
            <>
              <div className="upload-grid">
                {/* PDF upload */}
                <label
                  className={`upload-zone${dragPdf?' over':''}${pdfFile?' selected':''}`}
                  onDragOver={e=>{e.preventDefault();setDragPdf(true)}}
                  onDragLeave={()=>setDragPdf(false)}
                  onDrop={e=>{e.preventDefault();setDragPdf(false);addPdf(e.dataTransfer.files[0])}}
                >
                  <input type="file" accept=".pdf" onChange={e=>addPdf(e.target.files[0])} />
                  <span className="uz-icon">📋</span>
                  <div className="uz-title">Inspection Sheet PDF</div>
                  <div className="uz-sub">
                    Drop or upload a PDF · <em style={{color:'#CC0000'}}>clears any photos</em><br/>
                    <span style={{fontSize:11,color:'#888'}}>Pages rendered server-side at 300 DPI so circles are visible</span>
                  </div>
                  {pdfFile && <div className="uz-chosen">✓ {pdfFile.name}</div>}
                </label>

                {/* Photos upload */}
                <label
                  className={`upload-zone${dragPhotos?' over':''}${photoFiles.length>0?' selected':''}`}
                  onDragOver={e=>{e.preventDefault();setDragPhotos(true)}}
                  onDragLeave={()=>setDragPhotos(false)}
                  onDrop={e=>{e.preventDefault();setDragPhotos(false);addPhotos(e.dataTransfer.files)}}
                >
                  <input type="file" accept="image/*" multiple onChange={e=>addPhotos(e.target.files)} />
                  <span className="uz-icon">📸</span>
                  <div className="uz-title">Inspection Sheet Photos</div>
                  <div className="uz-sub">
                    Drop or upload photos of a physical inspection sheet · <em style={{color:'#CC0000'}}>clears any PDF</em>
                  </div>
                  {photoFiles.length > 0 && (
                    <>
                      <div className="uz-chosen">✓ {photoFiles.length} photo{photoFiles.length!==1?'s':''} ready</div>
                      <div className="uz-thumbs">
                        {photoFiles.slice(0,8).map(p=>(
                          <img key={p.id} src={p.dataURL} className="uz-thumb" alt={p.name} />
                        ))}
                        {photoFiles.length > 8 && <span style={{fontSize:12,color:C.greyDk,alignSelf:'center'}}>+{photoFiles.length-8} more</span>}
                      </div>
                    </>
                  )}
                </label>
              </div>

              {error && <div className="err">⚠ {error}</div>}

              <button
                className="go-btn"
                onClick={process}
                disabled={(!pdfFile && photoFiles.length===0) || processing}
              >
                {processing
                  ? <><span className="spinner"/> {statusMsg||'Processing…'}</>
                  : (!pdfFile && photoFiles.length===0)
                    ? '⚠ Upload a PDF or Photos First'
                    : '→ Generate Inspection Report'}
              </button>
              {processing && (
                <>
                  <div className="prog"><div className="prog-fill"/></div>
                  <div className="status-line">{statusMsg}</div>
                </>
              )}
            </>
          )}

          {/* ══ REPORT SCREEN ══ */}
          {report && (
            <>
              {/* Report header */}
              <div className="rpt-hd">
                <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                  <div className="rpt-title">{report.title}</div>
                  <select
                    value={reportStatus}
                    onChange={e => setReportStatus(e.target.value)}
                    style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',border:'1px solid #CCCCCC',padding:'4px 10px',background:'#fff',cursor:'pointer',outline:'none'}}
                  >
                    <option>Open</option>
                    <option>In Progress</option>
                    <option>Complete</option>
                  </select>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:10,alignItems:'flex-end'}}>
                  <div className="btn-row">
                    {hasOriginals && <button className="btn" onClick={downloadOriginals}>📎 Originals</button>}
                    <button className="btn" onClick={downloadPDF} disabled={dlState.pdf}>{dlState.pdf ? 'Generating…' : '↓ PDF'}</button>
                    <button className="btn solid" onClick={downloadDocx} disabled={dlState.docx}>{dlState.docx ? 'Generating…' : '↓ Word (.docx)'}</button>
                  </div>
                  {saveIndicator && <div style={{fontSize:11,color:'#2d9e6b',fontWeight:700,letterSpacing:1,textAlign:'right'}}>Saved ✓</div>}
                </div>
              </div>

              {/* Structured metadata grid — editable fields */}
              <div className="meta-grid">
                {[
                  ['Engineer',         'engineer'],
                  ['Serial No',        'serialNo'],
                  ['Engine Serial No', 'engineSerialNo'],
                  ['Date',             'date'],
                  ['Machine Hours',    'machineHours'],
                  ['Customer Name',    'customerName'],
                ].map(([lbl, key]) => (
                  <div key={key} className="meta-cell">
                    <span className="meta-lbl">{lbl}</span>
                    <input
                      className={`meta-val meta-input${!report[key]?' empty':''}`}
                      value={report[key] || ''}
                      placeholder="—"
                      onChange={e => setReport(r => ({ ...r, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              {/* Multi-select summary stats */}
              <div className="stats">
                <div
                  className={`stat${activeFilters.size===0?' active':''}`}
                  onClick={()=>setActiveFilters(new Set())}
                  title="Show all items"
                >
                  <input type="checkbox" className="stat-check" readOnly checked={activeFilters.size===0} onChange={()=>setActiveFilters(new Set())} />
                  <span className="n all" style={{color:'#1A1A1A'}}>{counts.all}</span>
                  <span className="l">Total Items</span>
                </div>
                {[
                  ['A',  counts.A,  'A — Satisfactory'],
                  ['B',  counts.B,  'B — Due Next Service'],
                  ['C',  counts.C,  'C — Urgent Attention'],
                  ['na', counts.na, 'N/A'],
                ].map(([filter, count, lbl]) => {
                  const checked = activeFilters.has(filter);
                  const toggle = () => {
                    const next = new Set(activeFilters);
                    checked ? next.delete(filter) : next.add(filter);
                    setActiveFilters(next);
                  };
                  return (
                    <div key={filter} className={`stat${checked?' active':''}`} onClick={toggle} title={checked?`Remove ${lbl} from view`:`Add ${lbl} to view`}>
                      <input type="checkbox" className="stat-check" readOnly checked={checked} onChange={toggle} />
                      <span className={`n ${filter}`}>{count}</span>
                      <span className="l">{lbl}</span>
                    </div>
                  );
                })}
              </div>

              {/* Active filter notice */}
              {activeFilters.size > 0 && (
                <div className="filter-bar">
                  <span className="filter-lbl">
                    Showing: {[...activeFilters].map(s=>statusLabel(s)).join(' + ')} · {filteredItems.length} item{filteredItems.length!==1?'s':''} · Downloads match this view
                  </span>
                  <span className="filter-clear" onClick={()=>setActiveFilters(new Set())}>Show all ×</span>
                </div>
              )}

              {/* Items list */}
              <div className="items">
                {filteredItems.length === 0
                  ? <div style={{textAlign:'center',padding:'40px',color:C.greyDk,fontSize:14}}>No items match the current filter.</div>
                  : filteredItems.reduce((acc, item, idx, arr) => {
                      const prevCat = idx > 0 ? arr[idx-1].category : null;
                      if (item.category && item.category !== prevCat)
                        acc.push(<div key={'cat-'+item.id} className="cat-hd">{item.category}</div>);
                      acc.push(
                        <div key={item.id} className={`icard ${item.status}`}>
                          <div className="ihd">
                            <div className="inum">{item.number}</div>
                            <div className="iname">{item.name}</div>
                            <div className={`ibadge ${item.status}`}>{statusLabel(item.status)}</div>
                            <select className="isel" value={item.status} onChange={e=>updateItem(item.id,'status',e.target.value)}>
                              <option value="A">A — Satisfactory</option>
                              <option value="B">B — Due Next Service</option>
                              <option value="C">C — Urgent Attention</option>
                              <option value="na">N/A</option>
                            </select>
                          </div>
                          {item.status !== 'na' && (
                            <div className="ibody">
                              <div className="flbl">Engineer Notes</div>
                              <textarea className="ita" value={item.comment} onChange={e=>updateItem(item.id,'comment',e.target.value)} placeholder="Add notes…" rows={2}/>
                              <div className="flbl" style={{marginTop:12}}>Photos</div>
                              <div
                                className={`drop-zone${dragOverItem===item.id?' over':''}`}
                                onDragOver={e=>{e.preventDefault();setDragOverItem(item.id)}}
                                onDragLeave={()=>setDragOverItem(null)}
                                onDrop={e=>handleItemDrop(e,item.id)}
                              >
                                {item.photos.length===0
                                  ? <label className="drop-hint">
                                      Drag &amp; drop or click to upload photos
                                      <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>{handleItemDrop({preventDefault:()=>{},dataTransfer:{files:e.target.files}},item.id);e.target.value='';}} />
                                    </label>
                                  : item.photos.map(p=>(
                                      <div
                                        key={p.id}
                                        className={`photo-wrap${dragging?.photoId===p.id?' dragging':''}${selectedPhoto?.photoId===p.id?' selected':''}`}
                                        onClick={e=>{e.stopPropagation();setSelectedPhoto({photoId:p.id,itemId:item.id});}}
                                      >
                                        <button
                                          className="photo-delete"
                                          title="Delete photo"
                                          onClick={e=>{e.stopPropagation();deletePhoto(p.id,item.id);}}
                                        >✕</button>
                                        <div
                                          className="pthumb-container"
                                          draggable
                                          onDragStart={()=>setDragging({photoId:p.id,srcId:item.id})}
                                          onDragEnd={()=>setDragging(null)}
                                        >
                                          <img
                                            src={p.url}
                                            className="pthumb"
                                            title={p.name}
                                            style={{transform:`rotate(${p.rotation||0}deg)`,transition:'transform .3s ease'}}
                                          />
                                        </div>
                                        <button
                                          className="rotate-btn"
                                          onClick={e=>{e.stopPropagation();rotatePhoto(p.id,item.id);}}
                                        >↻ Rotate</button>
                                      </div>
                                    ))
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      );
                      return acc;
                    }, [])
                }
              </div>

              <div className="footer">
                <button className="btn" onClick={()=>navigate('/dashboard')} style={{marginRight:'auto'}}>← Dashboard</button>
                {hasOriginals && <button className="btn" onClick={downloadOriginals}>📎 Download Originals</button>}
                <button className="btn" onClick={downloadPDF} disabled={dlState.pdf}>{dlState.pdf ? 'Generating PDF…' : '↓ Download PDF'}</button>
                <button className="btn solid" onClick={downloadDocx} disabled={dlState.docx}>{dlState.docx ? 'Generating…' : '↓ Download Word (.docx)'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
