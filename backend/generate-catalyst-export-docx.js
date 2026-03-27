import { Document, Packer, Paragraph, TextRun } from 'docx';

// All fields available in sc_reports, mapped to Catalyst labels
const FIELD_MAP = [
  ['machineType',    'Machine:'],
  ['machineSerial',  'Serial No:'],
  ['machineHours',   'Hours:'],
  ['inspectionDate', 'Inspection Date:'],
  ['engineer',       'Inspector:'],
  ['site',           'Site:'],
  ['score',          'Score:'],
  ['flaggedCount',   'Flagged Items:'],
];

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 36, font: 'Arial' })],
    spacing: { before: 480, after: 200 },
  });
}

function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: 'Arial' })],
    spacing: { before: 280, after: 100 },
    indent: { left: 360 },
  });
}

// Bold label + plain value on same line, for Description fields
function fieldLine(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}  `, bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: value, size: 20, font: 'Arial' }),
    ],
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
  });
}

// Bold label + plain value on same line, for Comment/Action under each item
function labeledLine(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}  `, bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: value, size: 20, font: 'Arial' }),
    ],
    spacing: { before: 60, after: 60 },
    indent: { left: 720 },
  });
}

export async function buildCatalystExportDocx(report, items) {
  console.log('[Catalyst Export] Report data:', JSON.stringify(report, null, 2));

  const paragraphs = [];

  // ── Section 1: Description ────────────────────────────────────────────────
  paragraphs.push(h1('Description'));

  for (const [field, label] of FIELD_MAP) {
    const val = report[field];
    if (val != null && String(val).trim()) {
      paragraphs.push(fieldLine(label, String(val).trim()));
    }
  }

  // ── Section 2: Estimate Items ─────────────────────────────────────────────
  paragraphs.push(h1('Estimate Items'));

  for (const item of items) {
    const comment = (item.comments    || '').trim();
    const action  = (item.actionNotes || '').trim();
    if (!comment && !action) continue;

    paragraphs.push(h2(item.itemName || 'Item'));
    if (comment) paragraphs.push(labeledLine('Comment:', comment));
    if (action)  paragraphs.push(labeledLine('Action:',  action));
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBuffer(doc);
}
