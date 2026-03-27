import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

// ── Brand colours (no #) ────────────────────────────────────────────────────
const CLR = {
  red:    'CC0000',
  black:  '1A1A1A',
  white:  'FFFFFF',
  grey:   'CCCCCC',
  greyBg: 'F7F7F7',
  greyDk: '888888',
  orange: 'E85D04',
};

// A4 usable width ≈ 9028 DXA with standard margins
const PAGE_W = 9028;

const NONE      = { style: BorderStyle.NONE, size: 0, color: CLR.white };
const THIN      = { style: BorderStyle.SINGLE, size: 4, color: CLR.grey };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideH: NONE, insideV: NONE };

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

// ── Quote table helpers ──────────────────────────────────────────────────────

const ITEM_COLS = [
  { label: 'Item',           w: 2000 },
  { label: 'Finding',        w: 2800 },
  { label: 'Priority',       w: 900  },
  { label: 'Est. Labour',    w: 800  },
  { label: 'Parts Required', w: 1200 },
  { label: 'Notes',          w: 1328 },
];

const ADDITIONAL_COLS = [
  { label: '#',               w: 400  },
  { label: 'Finding',         w: 5828 },
  { label: 'Action Required', w: 2800 },
];

function qCell(text, { bg, bold = false, color, width, align } = {}) {
  return new TableCell({
    children: [para(txt(text ?? '', { bold, size: 18, color: color || CLR.black }), {
      alignment: align || AlignmentType.LEFT,
    })],
    width:   width ? { size: width, type: WidthType.DXA } : undefined,
    shading: bg    ? shade(bg)                            : undefined,
    borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

function headerRow(cols, bg) {
  return new TableRow({
    tableHeader: true,
    children: cols.map(c => qCell(c.label, { bg, bold: true, color: CLR.white, width: c.w })),
  });
}

function itemRow(item, priority, cols) {
  const values = [
    item.item_name || item.finding || '',
    item.finding   || '',
    priority,
    '',
    '',
    '',
  ];
  return new TableRow({
    children: cols.map((c, i) => qCell(values[i] ?? '', { width: c.w })),
  });
}

function emptyRow(message, cols) {
  const cells = cols.map((c, i) =>
    i === 0
      ? new TableCell({
          children: [para(txt(message, { italics: true, size: 18, color: CLR.greyDk }))],
          columnSpan: cols.length,
          width: { size: cols.reduce((s, cc) => s + cc.w, 0), type: WidthType.DXA },
          borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
        })
      : null,
  ).filter(Boolean);
  // Build a single-cell spanning row
  return new TableRow({ children: [
    new TableCell({
      children: [para(txt(message, { italics: true, size: 18, color: CLR.greyDk }))],
      columnSpan: cols.length,
      borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
    }),
  ]});
}

function sectionHeading(text, color = CLR.red) {
  return para(txt(text, { bold: true, size: 26, color }), {
    spacing: { before: 320, after: 100 },
  });
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function buildSafetyCultureDocx(machine, flaggedItems, additionalFindings) {
  const urgentItems      = flaggedItems.filter(i => i.status === 'C-Urgent attention' || i.status === 'C-Urgent');
  const nextServiceItems = flaggedItems.filter(i => i.status === 'B-Due next Service' || i.status === 'B-Next Service' || i.status === 'B-Next-Service');
  const body = [];

  // ── Brand header bar ────────────────────────────────────────────────────────
  body.push(para([
    txt('RK6', { bold: true, size: 40, color: CLR.white }),
    txt('  MACHINERY SERVICES', { bold: true, size: 24, color: CLR.red }),
    txt('     CATALYST QUOTE', { size: 18, color: CLR.greyDk }),
  ], {
    shading: shade(CLR.black),
    border:  { bottom: { style: BorderStyle.SINGLE, size: 24, color: CLR.red } },
    spacing: { before: 0, after: 240 },
  }));

  // ── Document title ───────────────────────────────────────────────────────────
  body.push(para(
    txt(`Inspection Quote — ${machine.type || ''} ${machine.serial || ''}`.trim(), {
      bold: true, size: 44, color: CLR.black,
    }),
    { spacing: { before: 0, after: 120 } },
  ));

  // ── Machine details line ─────────────────────────────────────────────────────
  const detailParts = [
    machine.inspection_date && `Date: ${machine.inspection_date}`,
    machine.engineer        && `Engineer: ${machine.engineer}`,
    machine.site            && `Site: ${machine.site}`,
    machine.hours           && `Machine Hours: ${machine.hours}`,
    machine.score           && `Score: ${machine.score}`,
    machine.flagged_count !== undefined && `Flagged Items: ${machine.flagged_count}`,
  ].filter(Boolean);

  body.push(para(
    txt(detailParts.join('   |   '), { size: 20, color: CLR.greyDk }),
    { spacing: { before: 0, after: 360 } },
  ));

  // ── Urgent Items ─────────────────────────────────────────────────────────────
  body.push(sectionHeading('Urgent Items (C — Immediate Attention Required)', CLR.red));
  body.push(new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    borders: noBorders,
    rows: [
      headerRow(ITEM_COLS, CLR.red),
      ...(urgentItems.length > 0
        ? urgentItems.map(i => itemRow(i, 'Urgent', ITEM_COLS))
        : [emptyRow('No urgent items', ITEM_COLS)]),
    ],
  }));

  // ── Next Service Items ───────────────────────────────────────────────────────
  body.push(sectionHeading('Next Service Items (B — Address at Next Service)', CLR.orange));
  body.push(new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    borders: noBorders,
    rows: [
      headerRow(ITEM_COLS, CLR.orange),
      ...(nextServiceItems.length > 0
        ? nextServiceItems.map(i => itemRow(i, 'Next Service', ITEM_COLS))
        : [emptyRow('No next service items', ITEM_COLS)]),
    ],
  }));

  // ── Additional Findings ──────────────────────────────────────────────────────
  if (additionalFindings && additionalFindings.length > 0) {
    body.push(sectionHeading('Additional Findings', CLR.black));
    body.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      borders: noBorders,
      rows: [
        headerRow(ADDITIONAL_COLS, CLR.black),
        ...additionalFindings.map(f => new TableRow({
          children: [
            qCell(String(f.number ?? ''), { width: ADDITIONAL_COLS[0].w }),
            qCell(f.finding || '',         { width: ADDITIONAL_COLS[1].w }),
            qCell('',                      { width: ADDITIONAL_COLS[2].w }),
          ],
        })),
      ],
    }));
  }

  // ── Footer note ──────────────────────────────────────────────────────────────
  body.push(para(
    txt('Photographic evidence is provided in Flagged_Items_Summary.pdf, included in the same ZIP package.', {
      italics: true, size: 16, color: CLR.greyDk,
    }),
    { spacing: { before: 480 } },
  ));

  const doc = new Document({ sections: [{ children: body }] });
  return Packer.toBuffer(doc);
}
