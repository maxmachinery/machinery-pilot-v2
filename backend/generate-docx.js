import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import sharp from 'sharp';

// ── Brand colours (hex, no #) ───────────────────────────────────────────────
const CLR = {
  red:    'CC0000',
  black:  '1A1A1A',
  white:  'FFFFFF',
  grey:   'CCCCCC',
  greyDk: '888888',
  greyBg: 'F7F7F7',
  green:  '2d9e6b',
  orange: 'e85d04',
};

// Column widths in DXA (twentieths of a point).
// A4 with 2.54 cm margins ≈ 9028 DXA usable width.
const W = {
  // Item table  3 cols: number | content | status
  iNum:    540,
  iBody:   6600,
  iStatus: 1888,
  // Metadata table  2×(label+value)
  mLabel:  1800,
  mValue:  2700,
  // Summary table  5 equal columns
  sum:     1806,
};

const statusColor = s => s==='A'?CLR.green:s==='B'?CLR.orange:s==='C'?CLR.red:CLR.greyDk;
const statusBg    = s => s==='A'?'d8f3e8':s==='B'?'fff0eb':s==='C'?'fde8e6':'F4F4F4';
const statusLabel = s =>
  s==='A'?'A — Satisfactory':s==='B'?'B — Due Next Service':s==='C'?'C — Urgent Attention':'N/A';

const NONE = { style: BorderStyle.NONE, size: 0, color: CLR.white };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const tableNoBorders = { ...noBorders, insideH: NONE, insideV: NONE };

function shade(fill) {
  return { type: ShadingType.CLEAR, color: 'auto', fill };
}

function txt(text, opts = {}) {
  return new TextRun({ text: String(text ?? ''), font: 'Arial', ...opts });
}

function para(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [runs];
  return new Paragraph({ children, ...opts });
}

function cell(children, { width, bg, leftColor, align } = {}) {
  return new TableCell({
    children,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: bg ? shade(bg) : undefined,
    borders: {
      ...noBorders,
      left: leftColor ? { style: BorderStyle.SINGLE, size: 24, color: leftColor } : NONE,
    },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function tableRow(cells) {
  return new TableRow({ children: cells });
}

function simpleTable(rows, totalWidth = 9028) {
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    borders: tableNoBorders,
    rows,
  });
}

// Resize a photo data-URL to ≤150 px wide, applying rotation, output PNG Buffer.
async function processPhoto(photo) {
  try {
    const m = (photo.url || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!m) return null;
    let buf = Buffer.from(m[2], 'base64');
    if (photo.rotation) buf = await sharp(buf).rotate(photo.rotation).toBuffer();
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    const w = 150;
    const h = Math.round((meta.height / meta.width) * w);
    const data = await sharp(buf).resize(w, h).png().toBuffer();
    return { data, width: w, height: h };
  } catch {
    return null;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function buildDocxBuffer(report, items) {
  const body = [];

  // ── Brand header ────────────────────────────────────────────────────────────
  body.push(para([
    txt('RK6',                    { bold: true, size: 40, color: CLR.white }),
    txt('  MACHINERY SERVICES',   { bold: true, size: 24, color: CLR.red }),
    txt('     INSPECTION REPORT', { size: 18, color: CLR.greyDk }),
  ], {
    shading: shade(CLR.black),
    border:  { bottom: { style: BorderStyle.SINGLE, size: 24, color: CLR.red } },
    spacing: { before: 0, after: 240 },
  }));

  // ── Report title ────────────────────────────────────────────────────────────
  body.push(para(
    txt((report.title || 'Inspection Report').toUpperCase(), { bold: true, size: 40, color: CLR.black }),
    { spacing: { before: 0, after: 240 } },
  ));

  // ── Metadata table ──────────────────────────────────────────────────────────
  const META = [
    ['Engineer',        report.engineer],
    ['Serial No',       report.serialNo],
    ['Engine Serial No',report.engineSerialNo],
    ['Date',            report.date],
    ['Machine Hours',   report.machineHours],
    ['Customer Name',   report.customerName],
  ];
  const metaRows = [];
  for (let i = 0; i < META.length; i += 2) {
    const pair = META.slice(i, i + 2);
    metaRows.push(tableRow(
      pair.flatMap(([lbl, val]) => [
        cell([para(txt(lbl.toUpperCase(), { size: 15, bold: true, color: CLR.greyDk }))],
          { width: W.mLabel, bg: CLR.greyBg }),
        cell([para(txt(val || '—', { size: 18, bold: true, color: CLR.black }))],
          { width: W.mValue }),
      ]),
    ));
  }
  body.push(simpleTable(metaRows, 9000));
  body.push(para(txt(''), { spacing: { before: 200, after: 0 } }));

  // ── Summary counts ──────────────────────────────────────────────────────────
  const all = report.items || [];
  const STATS = [
    { n: all.filter(i=>i.status==='A').length,  lbl:'A — Satisfactory',    bg:'d8f3e8', color:CLR.green  },
    { n: all.filter(i=>i.status==='B').length,  lbl:'B — Due Next Service', bg:'fff0eb', color:CLR.orange },
    { n: all.filter(i=>i.status==='C').length,  lbl:'C — Urgent Attention', bg:'fde8e6', color:CLR.red    },
    { n: all.filter(i=>i.status==='na').length, lbl:'N/A',                  bg:'F4F4F4', color:CLR.greyDk },
    { n: all.length,                             lbl:'Total Items',          bg:CLR.white,color:CLR.black  },
  ];
  body.push(new Table({
    width: { size: 9030, type: WidthType.DXA },
    borders: tableNoBorders,
    rows: [tableRow(
      STATS.map(({ n, lbl, bg, color }) => new TableCell({
        width:   { size: W.sum, type: WidthType.DXA },
        shading: shade(bg),
        borders: noBorders,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
        children: [
          para(txt(String(n), { bold: true, size: 52, color }), { alignment: AlignmentType.CENTER }),
          para(txt(lbl,       { size: 14, color: CLR.greyDk }), { alignment: AlignmentType.CENTER }),
        ],
      }))
    )],
  }));
  body.push(para(txt(''), { spacing: { before: 300, after: 0 } }));

  // ── Inspection items ────────────────────────────────────────────────────────
  let lastCat = null;
  for (const item of items) {
    // Category heading
    if (item.category && item.category !== lastCat) {
      lastCat = item.category;
      body.push(para(
        txt(item.category.toUpperCase(), { bold: true, size: 20, color: CLR.red }),
        {
          border:  { bottom: { style: BorderStyle.SINGLE, size: 6, color: CLR.grey } },
          spacing: { before: 280, after: 80 },
        },
      ));
    }

    const bc = statusColor(item.status);
    const bg = statusBg(item.status);

    // Content cell: name + optional comment + optional photos
    const contentChildren = [
      para(txt((item.name || '').toUpperCase(), { bold: true, size: 20, color: CLR.black })),
    ];
    if (item.comment) {
      contentChildren.push(
        para(txt(item.comment, { size: 18, color: '555555', italics: true })),
      );
    }
    // Photos
    const photoRuns = [];
    for (const photo of (item.photos || []).slice(0, 4)) {
      const img = await processPhoto(photo);
      if (img) {
        photoRuns.push(new ImageRun({ data: img.data, transformation: { width: img.width, height: img.height } }));
      }
    }
    if (photoRuns.length) {
      contentChildren.push(para(photoRuns, { spacing: { before: 80 } }));
    }

    body.push(new Table({
      width:   { size: 9028, type: WidthType.DXA },
      borders: tableNoBorders,
      rows: [tableRow([
        cell(
          [para(txt(String(item.number), { size: 22, color: CLR.grey, bold: true }))],
          { width: W.iNum, leftColor: bc },
        ),
        cell(contentChildren, { width: W.iBody }),
        cell(
          [para(txt(statusLabel(item.status), { bold: true, size: 16, color: bc }),
            { alignment: AlignmentType.CENTER })],
          { width: W.iStatus, bg },
        ),
      ])],
    }));
    body.push(para(txt(''), { spacing: { before: 80, after: 0 } }));
  }

  const doc = new Document({
    creator: 'MachineryPilot Inspection Tool',
    title:    report.title || 'Inspection Report',
    sections: [{ children: body }],
  });

  return Packer.toBuffer(doc);
}
