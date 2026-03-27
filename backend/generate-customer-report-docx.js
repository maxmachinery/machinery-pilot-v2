import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

// ── Brand colours ─────────────────────────────────────────────────────────────
const CLR = {
  red:    'CC0000',
  black:  '1A1A1A',
  white:  'FFFFFF',
  grey:   'CCCCCC',
  greyBg: 'F7F7F7',
  greyDk: '888888',
  orange: 'E85D04',
};

const PAGE_W = 9028;  // A4 usable width in DXA with standard margins

const NONE      = { style: BorderStyle.NONE, size: 0, color: CLR.white };
const THIN      = { style: BorderStyle.SINGLE, size: 4, color: CLR.grey };
const THICK_RED = { style: BorderStyle.SINGLE, size: 24, color: CLR.red };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideH: NONE, insideV: NONE };

function shade(fill) { return { type: ShadingType.CLEAR, color: 'auto', fill }; }

function txt(text, opts = {}) {
  return new TextRun({ text: String(text ?? ''), font: 'Arial', ...opts });
}

function para(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [runs];
  return new Paragraph({ children, ...opts });
}

function spacer(before = 0, after = 0) {
  return para(txt(''), { spacing: { before, after } });
}

// ── Cover page ────────────────────────────────────────────────────────────────
function buildCoverPage(machine) {
  const rows = [];

  // Brand header
  rows.push(para([
    txt('RK6', { bold: true, size: 40, color: CLR.white }),
    txt('  MACHINERY SERVICES', { bold: true, size: 24, color: CLR.red }),
  ], {
    shading: shade(CLR.black),
    border:  { bottom: THICK_RED },
    spacing: { before: 0, after: 480 },
  }));

  // Document type label
  rows.push(para(
    txt('INSPECTION REPORT', { bold: true, size: 20, color: CLR.red, allCaps: true }),
    { spacing: { before: 0, after: 120 } },
  ));

  // Machine heading
  rows.push(para(
    txt(`${machine.type || 'Machine'} — ${machine.serial || ''}`.trim(), {
      bold: true, size: 52, color: CLR.black,
    }),
    { spacing: { before: 0, after: 240 } },
  ));

  // Details grid as a borderless table
  const detailFields = [
    ['Date of Inspection', machine.inspection_date],
    ['Machine Hours',      machine.hours],
    ['Inspector',          machine.engineer],
    ['Site',               machine.site],
    ['Overall Score',      machine.score],
  ].filter(([, v]) => v);

  if (detailFields.length) {
    rows.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      borders: noBorders,
      rows: detailFields.map(([label, value]) => new TableRow({
        children: [
          new TableCell({
            children: [para(txt(label, { size: 18, color: CLR.greyDk, bold: true }))],
            width: { size: 2400, type: WidthType.DXA },
            borders: noBorders,
            margins: { top: 60, bottom: 60, left: 0, right: 120 },
          }),
          new TableCell({
            children: [para(txt(value, { size: 18, color: CLR.black }))],
            width: { size: PAGE_W - 2400, type: WidthType.DXA },
            borders: noBorders,
            margins: { top: 60, bottom: 60, left: 120, right: 0 },
          }),
        ],
      })),
    }));
  }

  // Divider + summary counts will follow on the same page; end cover with page break
  rows.push(spacer(480, 0));
  rows.push(para(txt(''), { children: [new PageBreak()] }));

  return rows;
}

// ── Status badge text ─────────────────────────────────────────────────────────
function statusBadge(status) {
  if (status === 'C-Urgent')       return ['URGENT',       CLR.red];
  if (status === 'B-Next-Service') return ['NEXT SERVICE', CLR.orange];
  return [status, CLR.greyDk];
}

// ── One section per flagged item ──────────────────────────────────────────────
function buildItemSection(item, isFirst) {
  const [badgeText, badgeColor] = statusBadge(item.status);
  const rows = [];

  if (!isFirst) rows.push(spacer(360, 0));

  // Item name + badge side by side
  rows.push(new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    borders: noBorders,
    rows: [new TableRow({
      children: [
        new TableCell({
          children: [para(txt(item.item_name || '', {
            bold: true, size: 26, color: CLR.black,
          }))],
          width: { size: PAGE_W - 1400, type: WidthType.DXA },
          borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 8, color: CLR.grey } },
          margins: { top: 60, bottom: 80, left: 0, right: 120 },
          verticalAlign: 'center',
        }),
        new TableCell({
          children: [para(txt(badgeText, {
            bold: true, size: 18, color: CLR.white,
          }), { alignment: AlignmentType.CENTER })],
          width:   { size: 1400, type: WidthType.DXA },
          shading: shade(badgeColor),
          borders: noBorders,
          margins: { top: 80, bottom: 80, left: 120, right: 0 },
          verticalAlign: 'center',
        }),
      ],
    })],
  }));

  // Finding text
  if (item.finding) {
    rows.push(para(txt(item.finding, { size: 20, color: CLR.black }), {
      spacing: { before: 160, after: 80 },
    }));
  }

  return rows;
}

// ── Section heading ───────────────────────────────────────────────────────────
function sectionHeading(text, color = CLR.red) {
  return para(txt(text, { bold: true, size: 28, color }), {
    spacing: { before: 480, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color } },
  });
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function buildCustomerReportDocx(machine, flaggedItems, additionalFindings) {
  const urgentItems      = flaggedItems.filter(i => i.status === 'C-Urgent');
  const nextServiceItems = flaggedItems.filter(i => i.status === 'B-Next-Service');
  const body = [];

  // Cover page
  body.push(...buildCoverPage(machine));

  // ── Urgent Items section ──────────────────────────────────────────────────
  if (urgentItems.length > 0) {
    body.push(sectionHeading(`Urgent Items  (${urgentItems.length})`, CLR.red));
    urgentItems.forEach((item, idx) => {
      body.push(...buildItemSection(item, idx === 0));
    });
  }

  // ── Next Service section ──────────────────────────────────────────────────
  if (nextServiceItems.length > 0) {
    body.push(sectionHeading(`Next Service Items  (${nextServiceItems.length})`, CLR.orange));
    nextServiceItems.forEach((item, idx) => {
      body.push(...buildItemSection(item, idx === 0));
    });
  }

  // ── No flagged items ──────────────────────────────────────────────────────
  if (urgentItems.length === 0 && nextServiceItems.length === 0) {
    body.push(para(txt('No flagged items found in this inspection.', {
      italics: true, size: 20, color: CLR.greyDk,
    }), { spacing: { before: 240 } }));
  }

  const footer = new Footer({
    children: [para([
      txt('Prepared by RK6 Machinery Services', { size: 16, color: CLR.greyDk }),
      txt('     |     ', { size: 16, color: CLR.grey }),
      txt(`${machine.type || ''} ${machine.serial || ''}`.trim(), { size: 16, color: CLR.greyDk }),
    ], { alignment: AlignmentType.CENTER })],
  });

  const doc = new Document({
    sections: [{
      footers: { default: footer },
      children: body,
    }],
  });

  return Packer.toBuffer(doc);
}
