import PDFDocument from 'pdfkit';

const RED    = '#CC0000';
const BLACK  = '#1A1A1A';
const WHITE  = '#FFFFFF';
const GREY   = '#888888';
const LIGHT  = '#F7F7F7';
const BORDER = '#CCCCCC';
const ORANGE = '#E85D04';
const GREEN  = '#2d9e6b';

function statusBg(status) {
  if (!status) return GREY;
  if (status.startsWith('C-Urgent')) return RED;
  if (status.startsWith('B-Due') || status.startsWith('B-Next')) return ORANGE;
  if (status.startsWith('A-Satisfactory')) return GREEN;
  return GREY;
}

// Ensure y + needed fits on the page; add a new page if not.
// Returns the new y position (50 on a fresh page, unchanged otherwise).
function checkPage(doc, y, needed) {
  if (y + needed > doc.page.height - 70) {
    doc.addPage();
    return 50;
  }
  return y;
}

function drawFooter(doc, dateStr) {
  const W  = doc.page.width  - 100;
  const fy = doc.page.height - 40;
  doc.save();
  doc.strokeColor(BORDER).lineWidth(0.5).moveTo(50, fy - 10).lineTo(50 + W, fy - 10).stroke();
  doc.fillColor(GREY).fontSize(8).font('Helvetica')
    .text(`Prepared by MachineryPilot  |  Generated ${dateStr}`, 50, fy, { width: W, align: 'center' });
  doc.restore();
}

function drawLabel(doc, text, x, y) {
  doc.fillColor(GREY).fontSize(7).font('Helvetica').text(text, x, y);
}

function drawValue(doc, text, x, y, opts = {}) {
  doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold').text(text || '—', x, y, opts);
}

export function buildReportPdf(report, items, photoBuffersMap, logoBuffer, flaggedCount, actionsCount) {
  return new Promise((resolve) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));

    const PW      = doc.page.width;
    const W       = PW - 100;
    // dateStr is only used in the footer
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // ── Header bar ────────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 62).fill(BLACK);
    doc.rect(0, 59, PW, 3).fill(RED);

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, 10, { height: 42, fit: [160, 42] });
      } catch (_) {
        doc.fillColor(WHITE).fontSize(18).font('Helvetica-Bold').text('RK6 MACHINERY SERVICES', 50, 16);
      }
    } else {
      doc.fillColor(WHITE).fontSize(18).font('Helvetica-Bold').text('RK6 MACHINERY SERVICES', 50, 16);
      doc.fillColor(RED).fontSize(9).font('Helvetica').text('INSPECTION REPORT', 50, 40);
    }

    // Top-right: use the report's "Conducted on" date, not today's date
    const conductedOn = report.inspectionDate || '—';
    doc.fillColor(GREY).fontSize(9).font('Helvetica')
      .text(conductedOn, PW - 160, 30, { align: 'right', width: 110 });

    // ── Machine details bar (3 rows) ──────────────────────────────────────────
    const detailsHeight = 106;
    doc.rect(0, 62, PW, detailsHeight).fill(LIGHT);
    doc.strokeColor(BORDER).lineWidth(0.5)
      .moveTo(0, 62 + detailsHeight).lineTo(PW, 62 + detailsHeight).stroke();

    const cw = W / 3;

    // Row 1: Machine Type | Prepared By | Score
    drawLabel(doc, 'MACHINE TYPE',  50,          72);
    drawValue(doc, report.machineType  || '—',   50,          82, { width: cw - 10 });

    drawLabel(doc, 'PREPARED BY',   50 + cw,     72);
    drawValue(doc, report.engineer  || '—',      50 + cw,     82, { width: cw - 10 });

    drawLabel(doc, 'SCORE',         50 + cw * 2, 72);
    drawValue(doc, report.score     || '—',      50 + cw * 2, 82, { width: cw - 10 });

    // Row 2: Serial | Machine HRS | Conducted On
    drawLabel(doc, 'MACHINE SERIAL NUMBER', 50,          104);
    drawValue(doc, report.machineSerial || '—',   50,          114, { width: cw - 10 });

    drawLabel(doc, 'MACHINE HRS',   50 + cw,     104);
    drawValue(doc, report.machineHours ? `${report.machineHours} hrs` : '—', 50 + cw, 114, { width: cw - 10 });

    drawLabel(doc, 'CONDUCTED ON',  50 + cw * 2, 104);
    drawValue(doc, report.inspectionDate || '—', 50 + cw * 2, 114, { width: cw - 10 });

    // Row 3: Flagged Items | Actions (two clearly separated columns)
    const fc = flaggedCount != null ? flaggedCount : 0;
    const ac = actionsCount != null ? actionsCount : 0;

    drawLabel(doc, 'FLAGGED ITEMS', 50,          136);
    drawValue(doc, String(fc),      50,          146, { width: cw - 10 });

    drawLabel(doc, 'ACTIONS',       50 + cw,     136);
    drawValue(doc, String(ac),      50 + cw,     146, { width: cw - 10 });

    // ── Items ─────────────────────────────────────────────────────────────────
    let y = 62 + detailsHeight + 16;

    if (!items || items.length === 0) {
      y = checkPage(doc, y, 40);
      doc.fillColor(GREY).fontSize(12).font('Helvetica-Oblique')
        .text('No items selected', 50, y, { width: W, align: 'center' });
      y += 30;
    }

    // Photo dimensions
    const PW_PHOTO = 240;
    const PH       = 180; // default height for landscape photos

    for (const item of (items || [])) {
      // ── Item header bar ────────────────────────────────────────────────────
      y = checkPage(doc, y, 36);
      const bg = statusBg(item.status);
      doc.rect(50, y, W, 26).fill(bg);
      doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold')
        .text(item.itemName || 'Unnamed Item', 58, y + 7, { width: W * 0.7 });
      doc.fillColor(WHITE).fontSize(8).font('Helvetica')
        .text(item.status || 'N/A', 50 + W * 0.72, y + 9, { width: W * 0.27, align: 'right' });
      y += 34;

      // ── Comments ───────────────────────────────────────────────────────────
      if (item.comments && item.comments.trim()) {
        y = checkPage(doc, y, 28);
        drawLabel(doc, 'COMMENTS', 50, y);
        y += 11;
        const ch = doc.heightOfString(item.comments, { width: W });
        y = checkPage(doc, y, ch + 6);
        doc.fillColor(BLACK).fontSize(10).font('Helvetica')
          .text(item.comments, 50, y, { width: W });
        y += ch + 12;
      }

      // ── Action Notes ───────────────────────────────────────────────────────
      if (item.actionNotes && item.actionNotes.trim()) {
        y = checkPage(doc, y, 28);
        drawLabel(doc, 'ACTION REQUIRED', 50, y);
        y += 11;
        const ah = doc.heightOfString(item.actionNotes, { width: W });
        y = checkPage(doc, y, ah + 6);
        doc.fillColor(BLACK).fontSize(10).font('Helvetica')
          .text(item.actionNotes, 50, y, { width: W });
        y += ah + 12;
      }

      // ── Customer requested estimate badge ──────────────────────────────────
      if (item.customerRequestedEstimate) {
        y = checkPage(doc, y, 24);
        doc.roundedRect(50, y, 200, 18, 3).fill(GREEN);
        doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold')
          .text('✓ Customer requested estimate', 58, y + 4, { width: 184 });
        y += 28;
      }

      // ── Photos ─────────────────────────────────────────────────────────────
      const photoBufs = (photoBuffersMap[item.id] || []).filter(Boolean);
      if (photoBufs.length > 0) {
        y += 15;

        for (const buf of photoBufs) {
          let renderH = PH;
          try {
            const img = doc.openImage(buf);
            if (img.height > img.width) {
              renderH = Math.round(PW_PHOTO * (img.height / img.width));
            }
          } catch (_) {}
          if (y + renderH > doc.page.height - 70) {
            doc.addPage();
            y = 50;
          }
          try {
            doc.image(buf, 50, y, { width: PW_PHOTO, height: renderH });
          } catch (_) { /* skip unreadable image */ }
          y += renderH + 20;
        }
      }

      // ── Divider ────────────────────────────────────────────────────────────
      y = checkPage(doc, y, 12);
      doc.strokeColor(BORDER).lineWidth(0.5).moveTo(50, y).lineTo(50 + W, y).stroke();
      y += 14;
    }

    drawFooter(doc, dateStr);
    doc.end();
  });
}
