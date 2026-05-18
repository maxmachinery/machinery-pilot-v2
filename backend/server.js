import 'dotenv/config';
import express from 'express';
import multer  from 'multer';
import cors    from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import { createRequire } from 'module';
import { db } from './db.js';
import crypto  from 'crypto';
import path    from 'path';
import { fileURLToPath } from 'url';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const require    = createRequire(import.meta.url);
const pdfParse   = require('pdf-parse');
const mammoth    = require('mammoth');
const __dirname  = path.dirname(fileURLToPath(import.meta.url));

const LOCAL_UPLOADS_DIR = path.join(__dirname, 'uploads');
try { fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true }); } catch {}

// ── R2 ────────────────────────────────────────────────────────────────────
const R2_CONFIGURED = !!(
  process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME
);
let r2 = null;
if (R2_CONFIGURED) {
  r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  console.log('[R2] bucket:', process.env.R2_BUCKET_NAME);
} else {
  console.log('[R2] not configured');
}
async function uploadToR2(key, buf, ct) {
  if (!r2) return null;
  try { await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: buf, ContentType: ct })); return key; }
  catch (e) { console.error('[R2]', e.message); return null; }
}

// ── Anthropic ─────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Express ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const distPath   = path.join(__dirname, '..', 'frontend', 'dist');
const publicPath = path.join(__dirname, 'public');
// Serve /inspect.js and /inspect-help.html before the SPA catch-all
app.use(express.static(publicPath));
app.use(express.static(distPath));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, f.mimetype === 'application/pdf'),
});

// Multer for claim uploads — allows PDF + DOCX
const claimUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => {
    const ext = path.extname(f.originalname || '').toLowerCase();
    cb(null, ['.pdf', '.doc', '.docx'].includes(ext) || f.mimetype === 'application/pdf');
  },
});

// Multer for OEM library doc uploads — accepts any file type
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ── Helpers ───────────────────────────────────────────────────────────────
function extractJson(text, arr = false) {
  const s = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const m = s.match(arr ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in model response');
  return JSON.parse(m[0]);
}

function parseOemRow(row) {
  return {
    ...row,
    policy_rules:    JSON.parse(row.policy_rules    || '[]'),
    portal_fields:   JSON.parse(row.portal_fields   || '[]'),
    job_card_fields: JSON.parse(row.job_card_fields || '[]'),
  };
}

async function extractPdfText(buf) {
  try { return ((await pdfParse(buf)).text || '').trim(); }
  catch { return ''; }
}

async function extractDocContent(buf, filename, b64) {
  const ext = path.extname(filename || '').toLowerCase();

  if (ext === '.pdf') {
    let content = await extractPdfText(buf);
    if (content.length < 100) {
      const vr = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 8192,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: 'Transcribe all text from this document. Return transcribed text only.' },
        ]}],
      });
      content = vr.content[0].text;
      return { content, method: 'vision' };
    }
    return { content, method: 'text' };
  }

  if (['.doc', '.docx'].includes(ext)) {
    const r = await mammoth.extractRawText({ buffer: buf });
    return { content: (r.value || '').trim(), method: 'mammoth' };
  }

  if (['.txt', '.md', '.csv'].includes(ext)) {
    return { content: buf.toString('utf-8'), method: 'text' };
  }

  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (imageExts.includes(ext)) {
    const mimeMap = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.webp':'image/webp' };
    const mediaType = mimeMap[ext] || 'image/jpeg';
    try {
      const vr = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 4096,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: 'Transcribe and describe all text and content visible in this image in detail.' },
        ]}],
      });
      return { content: vr.content[0].text, method: 'vision' };
    } catch (imgErr) {
      console.error('[extractDocContent] image vision failed:', imgErr.message);
      return { content: `[Image file: ${filename} — vision extraction failed: ${imgErr.message}. File is stored and accessible.]`, method: 'vision-failed' };
    }
  }

  return { content: `[File: ${filename} — content extraction not supported for this file type. File is stored and accessible.]`, method: 'unsupported' };
}

// Build enrichment context from docs for a specific machine
function buildMachineContext(machineId) {
  const LABELS = {
    warranty_policy:   'WARRANTY POLICY',
    portal_structure:  'PORTAL FIELD STRUCTURE',
    technical_manual:  'TECHNICAL MANUAL',
    warranty_schedule: 'WARRANTY SCHEDULE (per-time operations & rates)',
    historic_claims:   'HISTORIC APPROVED CLAIMS (match this tone/detail)',
  };
  const docs = db.prepare(
    'SELECT * FROM oem_documents WHERE machine_id = ? ORDER BY doc_type'
  ).all(machineId);
  return docs
    .filter(d => d.extracted_content)
    .map(d => `[${LABELS[d.doc_type] || d.doc_type.toUpperCase()}]\n${d.extracted_content.slice(0, 4000)}`)
    .join('\n\n');
}

// Find or create OEM + machine, return both
function findOrCreateMachine(oemName, machineName) {
  const normalName = oemName.trim();
  const normalModel = machineName.trim();

  let oem = db.prepare('SELECT * FROM oem_configs WHERE name = ? COLLATE NOCASE').get(normalName);
  if (!oem) {
    const r = db.prepare('INSERT INTO oem_configs (name, brand) VALUES (?, ?)').run(normalName, normalName);
    oem = db.prepare('SELECT * FROM oem_configs WHERE id = ?').get(r.lastInsertRowid);
  }

  let machine = db.prepare(
    'SELECT * FROM oem_machines WHERE oem_config_id = ? AND machine_model = ? COLLATE NOCASE'
  ).get(oem.id, normalModel);
  if (!machine) {
    const r = db.prepare('INSERT INTO oem_machines (oem_config_id, machine_model) VALUES (?, ?)').run(oem.id, normalModel);
    machine = db.prepare('SELECT * FROM oem_machines WHERE id = ?').get(r.lastInsertRowid);
  }

  return { oem, machine };
}

// Convert pasted plain text to a .docx buffer
async function pastedTextToDocxBuffer(text) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: text.split('\n').map(line => new Paragraph({ children: [new TextRun(line || '')] })),
    }],
  });
  return await Packer.toBuffer(doc);
}

// Fetch uploaded file as Buffer from R2 or local disk
async function getFileBuffer(r2Key) {
  if (r2Key && r2Key.startsWith('local:')) {
    return fs.readFileSync(path.join(LOCAL_UPLOADS_DIR, r2Key.slice(6)));
  }
  if (R2_CONFIGURED && r2Key) {
    const resp = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: r2Key }));
    return Buffer.from(await resp.Body.transformToByteArray());
  }
  throw new Error('File not accessible: R2 not configured and no local copy');
}

// ────────────────────────────────────────────────────────────────────────────
// LIBRARY — OEM × Machine flat table
// ────────────────────────────────────────────────────────────────────────────

// GET /api/library — flat table including OEM-wide rows (machine_id IS NULL)
app.get('/api/library', (_req, res) => {
  // 1. Machine-specific rows
  const machines = db.prepare(`
    SELECT m.id AS machine_id, m.machine_model,
           c.id AS oem_id, c.name AS oem_name, c.brand AS oem_brand,
           c.policy_rules, c.portal_fields, c.job_card_fields
    FROM oem_machines m
    JOIN oem_configs c ON c.id = m.oem_config_id
    ORDER BY c.name COLLATE NOCASE, m.machine_model COLLATE NOCASE
  `).all();

  const machineRows = machines.map(m => {
    const docs = db.prepare(
      'SELECT id, doc_type, filename, uploaded_at FROM oem_documents WHERE machine_id = ?'
    ).all(m.machine_id);
    return {
      rowKey:       String(m.machine_id),
      machineId:    m.machine_id,
      machineModel: m.machine_model,
      oemId:        m.oem_id,
      oemName:      m.oem_name,
      oemBrand:     m.oem_brand,
      isOemWide:    false,
      policy_rules:    JSON.parse(m.policy_rules    || '[]'),
      portal_fields:   JSON.parse(m.portal_fields   || '[]'),
      job_card_fields: JSON.parse(m.job_card_fields || '[]'),
      documents:    docs,
    };
  });

  // 2. OEM-wide rows (documents with machine_id IS NULL)
  const oemsWithWideDocs = db.prepare(`
    SELECT DISTINCT c.id AS oem_id, c.name AS oem_name, c.brand AS oem_brand,
           c.policy_rules, c.portal_fields, c.job_card_fields
    FROM oem_documents d
    JOIN oem_configs c ON c.id = d.oem_config_id
    WHERE d.machine_id IS NULL
    ORDER BY c.name COLLATE NOCASE
  `).all();

  const oemWideRows = oemsWithWideDocs.map(c => {
    const docs = db.prepare(
      'SELECT id, doc_type, filename, uploaded_at FROM oem_documents WHERE oem_config_id = ? AND machine_id IS NULL'
    ).all(c.oem_id);
    return {
      rowKey:       `oem-${c.oem_id}`,
      machineId:    null,
      machineModel: null,
      oemId:        c.oem_id,
      oemName:      c.oem_name,
      oemBrand:     c.oem_brand,
      isOemWide:    true,
      policy_rules:    JSON.parse(c.policy_rules    || '[]'),
      portal_fields:   JSON.parse(c.portal_fields   || '[]'),
      job_card_fields: JSON.parse(c.job_card_fields || '[]'),
      documents:    docs,
    };
  });

  // 3. Merge & sort: by OEM name, OEM-wide first within each OEM, then by machine model
  const allRows = [...machineRows, ...oemWideRows].sort((a, b) => {
    const oemCmp = a.oemName.localeCompare(b.oemName, undefined, { sensitivity: 'base' });
    if (oemCmp !== 0) return oemCmp;
    if (a.isOemWide && !b.isOemWide) return -1;
    if (!a.isOemWide && b.isOemWide) return 1;
    return (a.machineModel || '').localeCompare(b.machineModel || '', undefined, { sensitivity: 'base' });
  });

  res.json(allRows);
});

// GET /api/machine/:id — single machine with full config
app.get('/api/machine/:id', (req, res) => {
  const m = db.prepare(`
    SELECT m.id AS machine_id, m.machine_model,
           c.id AS oem_id, c.name AS oem_name, c.brand AS oem_brand,
           c.policy_rules, c.portal_fields, c.job_card_fields
    FROM oem_machines m
    JOIN oem_configs c ON c.id = m.oem_config_id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Machine not found' });

  const docs = db.prepare('SELECT * FROM oem_documents WHERE machine_id = ?').all(req.params.id);
  res.json({
    machineId:    m.machine_id,
    machineModel: m.machine_model,
    oemId:        m.oem_id,
    oemName:      m.oem_name,
    oemBrand:     m.oem_brand,
    policy_rules:    JSON.parse(m.policy_rules    || '[]'),
    portal_fields:   JSON.parse(m.portal_fields   || '[]'),
    job_card_fields: JSON.parse(m.job_card_fields || '[]'),
    documents: docs,
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DOCUMENT UPLOAD — unified endpoint
// POST /api/documents/upload
//   body fields: oemName, machineName (optional), docType
//   file: any file type (field name: file)
// ────────────────────────────────────────────────────────────────────────────
app.post('/api/documents/upload', docUpload.single('file'), async (req, res) => {
  let stage = 'init';
  try {
    stage = 'validate-file';
    console.log('[Upload] STAGE 1 — file received:', req.file?.originalname, 'mimetype:', req.file?.mimetype, 'size:', req.file?.size);
    console.log('[Upload] STAGE 2 — body:', req.body);
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const { oemName, machineName, docType } = req.body;
    if (!oemName || !docType) {
      return res.status(400).json({ error: 'oemName and docType are required' });
    }
    const VALID_TYPES = ['warranty_policy', 'portal_structure', 'technical_manual', 'warranty_schedule', 'historic_claims'];
    if (!VALID_TYPES.includes(docType)) {
      return res.status(400).json({ error: `docType must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const buf      = req.file.buffer;
    const filename = req.file.originalname;
    const b64      = buf.toString('base64');
    const ext      = path.extname(filename).toLowerCase();

    // ── Find or create OEM ────────────────────────────────────
    stage = 'find-or-create-oem';
    const normalName = oemName.trim();
    let oem = db.prepare('SELECT * FROM oem_configs WHERE name = ? COLLATE NOCASE').get(normalName);
    if (!oem) {
      const r = db.prepare('INSERT INTO oem_configs (name, brand) VALUES (?, ?)').run(normalName, normalName);
      oem = db.prepare('SELECT * FROM oem_configs WHERE id = ?').get(r.lastInsertRowid);
    }
    console.log('[Upload] STAGE 5 — OEM config id:', oem.id, 'name:', oem.name);

    // ── Find or create machine (optional) ────────────────────
    stage = 'find-or-create-machine';
    let machine = null;
    const trimmedMach = (machineName || '').trim();
    if (trimmedMach) {
      let m = db.prepare('SELECT * FROM oem_machines WHERE oem_config_id = ? AND machine_model = ? COLLATE NOCASE').get(oem.id, trimmedMach);
      if (!m) {
        const r = db.prepare('INSERT INTO oem_machines (oem_config_id, machine_model) VALUES (?, ?)').run(oem.id, trimmedMach);
        m = db.prepare('SELECT * FROM oem_machines WHERE id = ?').get(r.lastInsertRowid);
      }
      machine = m;
    }
    console.log('[Upload] STAGE 6 — machine id:', machine?.id ?? 'null (OEM-wide)');

    // ── Content extraction ────────────────────────────────────
    stage = 'extract-content';
    const { content, method } = await extractDocContent(buf, filename, b64);
    console.log('[Upload] STAGE 4 — content extraction done, method:', method, 'length:', content?.length);

    // ── Re-extract structured config for policy/portal docs ───
    const policyPrompt = `Extract from this warranty policy. Return ONLY valid JSON:\n{"policyRules":["each rule as a statement"],"jobCardFields":[{"fieldId":"snake_case","name":"label","description":"what goes here","required":true,"type":"text"}]}`;
    const portalPrompt = `Extract portal field structure. Return ONLY valid JSON:\n{"portalFields":[{"fieldId":"id","name":"label","required":true,"maxChars":null,"description":"what maps here"}]}`;

    if (docType === 'warranty_policy') {
      try {
        const msgs = ext === '.pdf'
          ? [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: policyPrompt }] }]
          : [{ role: 'user', content: `${content.slice(0, 8000)}\n\n${policyPrompt}` }];
        const sr = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 8192, messages: msgs });
        const ex = extractJson(sr.content[0].text);
        db.prepare('UPDATE oem_configs SET policy_rules=?, job_card_fields=? WHERE id=?')
          .run(JSON.stringify(ex.policyRules || []), JSON.stringify(ex.jobCardFields || []), oem.id);
      } catch { /* keep existing */ }
    }

    if (docType === 'portal_structure') {
      try {
        const msgs = ext === '.pdf'
          ? [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: portalPrompt }] }]
          : [{ role: 'user', content: `${content.slice(0, 8000)}\n\n${portalPrompt}` }];
        const sr = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: msgs });
        const ex = extractJson(sr.content[0].text);
        db.prepare('UPDATE oem_configs SET portal_fields=? WHERE id=?')
          .run(JSON.stringify(ex.portalFields || []), oem.id);
      } catch { /* keep existing */ }
    }

    // ── R2 upload ──────────────────────────────────────────────
    stage = 'r2-upload';
    let r2Key = null;
    if (R2_CONFIGURED) {
      const machSegment = machine ? machine.id : 'oem';
      r2Key = `docs/${oem.id}/${machSegment}/${docType}-${Date.now()}${ext || '.bin'}`;
      await uploadToR2(r2Key, buf, req.file.mimetype || 'application/octet-stream');
    }
    console.log('[Upload] STAGE 3 — R2 upload result:', r2Key ?? 'skipped (R2 not configured)');

    // ── Replace existing doc of same type ─────────────────────
    stage = 'insert-document';
    if (machine) {
      db.prepare('DELETE FROM oem_documents WHERE machine_id=? AND doc_type=?').run(machine.id, docType);
    } else {
      db.prepare('DELETE FROM oem_documents WHERE machine_id IS NULL AND oem_config_id=? AND doc_type=?').run(oem.id, docType);
    }
    console.log('[Upload] STAGE 7 — about to insert document row');

    const ins = db.prepare(`
      INSERT INTO oem_documents (oem_config_id, machine_id, doc_type, filename, r2_key, extracted_content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(oem.id, machine ? machine.id : null, docType, filename, r2Key, content.slice(0, 60000));
    console.log('[Upload] STAGE 8 — document inserted, id:', ins.lastInsertRowid);

    stage = 'respond';
    const doc = db.prepare('SELECT * FROM oem_documents WHERE id=?').get(ins.lastInsertRowid);
    console.log('[Upload] STAGE 9 — sending response');
    res.json({ ...doc, machineId: machine?.id || null, oemId: oem.id, transcriptionMethod: method });
  } catch (err) {
    console.error(`[Doc Upload Error at stage: ${stage}]`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err.message || err), failedAt: stage });
    }
  }
});

// DELETE /api/documents/:docId
app.delete('/api/documents/:docId', (req, res) => {
  db.prepare('DELETE FROM oem_documents WHERE id=?').run(req.params.docId);
  res.json({ ok: true });
});

// ────────────────────────────────────────────────────────────────────────────
// LEGACY: keep /api/oem/upload and /api/oem/configs working
// ────────────────────────────────────────────────────────────────────────────

// POST /api/oem/upload — kept for backward compat; creates OEM + "Default" machine
app.post('/api/oem/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF received' });
    const b64 = req.file.buffer.toString('base64');

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 8192,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: `Analyse this OEM warranty policy. Return ONLY valid JSON:
{
  "oemName": "manufacturer name",
  "brand": "brand name",
  "policyRules": ["each rule"],
  "jobCardFields": [{"fieldId":"id","name":"label","description":"desc","required":true,"type":"text"}],
  "portalFields": [{"fieldId":"id","name":"label","required":true,"maxChars":null,"description":"desc"}]
}` },
      ]}],
    });

    const parsed = extractJson(resp.content[0].text);

    let oem = db.prepare('SELECT * FROM oem_configs WHERE name=? COLLATE NOCASE').get(parsed.oemName);
    if (!oem) {
      const r = db.prepare('INSERT INTO oem_configs (name,brand,policy_rules,portal_fields,job_card_fields) VALUES (?,?,?,?,?)')
        .run(parsed.oemName, parsed.brand || parsed.oemName,
          JSON.stringify(parsed.policyRules || []),
          JSON.stringify(parsed.portalFields || []),
          JSON.stringify(parsed.jobCardFields || []));
      oem = db.prepare('SELECT * FROM oem_configs WHERE id=?').get(r.lastInsertRowid);
    }

    res.json(parseOemRow(oem));
  } catch (err) {
    console.error('[OEM Upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oem/configs — kept for sidebar & legacy selectors
app.get('/api/oem/configs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM oem_configs ORDER BY created_at DESC').all();
  res.json(rows.map(parseOemRow));
});

// GET /api/oem/:id — single OEM
app.get('/api/oem/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM oem_configs WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'OEM not found' });
  res.json(parseOemRow(row));
});

// Multer for screenshot uploads — accepts PNG/JPEG
const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// POST /api/oem/:oemId/generate-portal-schema — generate portal field schema from screenshot
app.post('/api/oem/:oemId/generate-portal-schema', screenshotUpload.single('screenshot'), async (req, res) => {
  try {
    const { oemId } = req.params;
    const notes = req.body?.notes || '';

    if (!req.file) return res.status(400).json({ error: 'No screenshot file received' });

    const oemRow = db.prepare('SELECT * FROM oem_configs WHERE id=?').get(oemId);
    if (!oemRow) return res.status(404).json({ error: 'OEM not found' });

    // Look up Portal Definition Generator prompt
    const portalDefPrompt = db.prepare(
      "SELECT * FROM custom_prompts WHERE category='Portal Definition' AND is_default=1 LIMIT 1"
    ).get();
    if (!portalDefPrompt) return res.status(500).json({ error: 'Portal Definition Generator prompt not found in DB' });

    const buf = req.file.buffer;
    const b64 = buf.toString('base64');
    const mimeType = req.file.mimetype === 'image/png' ? 'image/png' : 'image/jpeg';

    const definePortalFieldsSchema = {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fieldId:  { type: 'string' },
              name:     { type: 'string' },
              section:  { type: 'string' },
              required: { type: 'boolean' },
              type:     { type: 'string', enum: ['text', 'date', 'number', 'textarea'] },
            },
            required: ['fieldId', 'name', 'section', 'required', 'type'],
          },
        },
      },
      required: ['fields'],
    };

    const userContent = [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
      { type: 'text', text: portalDefPrompt.prompt_text + (notes ? `\n\nAdditional instructions: ${notes}` : '') },
    ];

    const toolResp = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      tools: [{
        name: 'define_portal_fields',
        description: 'Return the structured list of portal fields identified from the screenshot',
        input_schema: definePortalFieldsSchema,
      }],
      tool_choice: { type: 'tool', name: 'define_portal_fields' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUse = toolResp.content.find(b => b.type === 'tool_use');
    if (!toolUse) return res.status(500).json({ error: 'Model did not return a tool_use block' });

    const fields = toolUse.input.fields || [];

    // Save to oem_configs.portal_fields
    db.prepare('UPDATE oem_configs SET portal_fields=? WHERE id=?')
      .run(JSON.stringify(fields), oemId);

    console.log('[GeneratePortalSchema] OEM', oemId, '— saved', fields.length, 'fields');
    res.json({ fields, oemId });
  } catch (err) {
    console.error('[GeneratePortalSchema]', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// JOB CARD — upload + enrich (now machine-aware)
// ────────────────────────────────────────────────────────────────────────────

// POST /api/jobcard/upload
app.post('/api/jobcard/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF received' });
    const { machineId, oemConfigId, jobRef, machine: machineLabel, engineer, repair_date } = req.body;
    if (!repair_date) return res.status(400).json({ error: 'repair_date is required' });

    // Resolve oemConfig from machineId or oemConfigId
    let oemConfig, resolvedMachineId;

    if (machineId) {
      const m = db.prepare(`
        SELECT m.id, m.machine_model, c.id AS oem_id, c.name, c.brand,
               c.policy_rules, c.portal_fields, c.job_card_fields
        FROM oem_machines m JOIN oem_configs c ON c.id=m.oem_config_id
        WHERE m.id=?`).get(machineId);
      if (!m) return res.status(404).json({ error: 'Machine not found' });
      resolvedMachineId = m.id;
      oemConfig = {
        id: m.oem_id, name: m.name, brand: m.brand,
        job_card_fields: JSON.parse(m.job_card_fields || '[]'),
        portal_fields:   JSON.parse(m.portal_fields   || '[]'),
        policy_rules:    JSON.parse(m.policy_rules    || '[]'),
      };
    } else if (oemConfigId) {
      const row = db.prepare('SELECT * FROM oem_configs WHERE id=?').get(oemConfigId);
      if (!row) return res.status(404).json({ error: 'OEM not found' });
      oemConfig = parseOemRow(row);
    } else {
      return res.status(400).json({ error: 'machineId or oemConfigId required' });
    }

    const buf = req.file.buffer;
    const b64 = buf.toString('base64');
    const txt = await extractPdfText(buf);
    const method = txt.length >= 100 ? 'text' : 'vision';
    const fieldsJson = JSON.stringify(oemConfig.job_card_fields, null, 2);

    let content;
    if (method === 'vision') {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: `Scanned/handwritten ${oemConfig.name} job card. Transcribe all text.

Expected fields:
${fieldsJson}

Return ONLY JSON:
{
  "fields": [{"fieldId":"exact_id","name":"name","value":"value"}],
  "images": [{"id":"img_1","description":"describe what you see"}]
}` },
      ];
    } else {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: `Digital ${oemConfig.name} job card. Extract field values.

Fields:
${fieldsJson}

Return ONLY a JSON array:
[{"fieldId":"exact_id","name":"name","value":"extracted value"}]` },
      ];
    }

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 8192,
      messages: [{ role: 'user', content }],
    });

    let extractedFields = [], extractedImages = [];
    const rt = resp.content[0].text;
    if (method === 'vision') {
      try { const p = extractJson(rt); extractedFields = p.fields || []; extractedImages = p.images || []; }
      catch { extractedFields = extractJson(rt, true); }
    } else {
      extractedFields = extractJson(rt, true);
    }

    if (R2_CONFIGURED) await uploadToR2(`job-cards/${Date.now()}.pdf`, buf, 'application/pdf');

    const sessionId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO enrichment_sessions
        (id, oem_config_id, machine_id, original_fields, enrichments, review_decisions,
         status, job_ref, machine, engineer, enriched_field_count, claim_status,
         extracted_images, transcription_method, repair_date)
      VALUES (?,?,?, ?, '[]','{}', 'pending', ?,?,?, ?, 'draft', ?,?,?)
    `).run(
      sessionId, oemConfig.id, resolvedMachineId || null,
      JSON.stringify(extractedFields),
      jobRef || null, machineLabel || oemConfig.name, engineer || null,
      extractedFields.length,
      JSON.stringify(extractedImages), method, repair_date,
    );

    res.json({ sessionId, fields: extractedFields, images: extractedImages, transcriptionMethod: method, oemConfig });
  } catch (err) {
    console.error('[Job Card Upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobcard/enrich/:sessionId
app.post('/api/jobcard/enrich/:sessionId', async (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM enrichment_sessions WHERE id=?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const oemRow = db.prepare('SELECT * FROM oem_configs WHERE id=?').get(session.oem_config_id);
    const oem    = parseOemRow(oemRow);

    const fields  = JSON.parse(session.original_fields || '[]');
    let context = session.machine_id ? buildMachineContext(session.machine_id) : '';
    if (!context && oem.policy_rules.length) {
      context = oem.policy_rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
    }

    const enrichments = [];
    for (const field of fields) {
      const def = oem.job_card_fields.find(f => f.fieldId === field.fieldId) || {};
      const r = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 512,
        messages: [{ role: 'user', content: `You are a warranty gap analyst for ${oem.name}.

Reference documents:
${context || 'No additional documents.'}

Field: ${field.name}
Description: ${def.description || 'N/A'}
Engineer value: "${field.value || '(empty)'}"

Identify SPECIFIC documentation gaps between what the engineer wrote and what the OEM needs for a full warranty claim.
Be concise — each bullet max 12 words, plain workshop language, specific (e.g. "Missing torque spec for housing bolts").
Split into:
- diagnosticGaps: what's missing about the FAILURE (root cause, failure code, culprit part, symptoms, evidence)
- repairGaps: what's missing about the WORK DONE (disassembly sequence, torques, fluids, post-fit checks)
Only include genuinely missing or unclear items. If nothing is missing, return empty arrays.

Return ONLY JSON:
{"diagnosticGaps":["bullet"],"repairGaps":["bullet"]}` }],
      });
      let e;
      try { e = extractJson(r.content[0].text); }
      catch { e = { diagnosticGaps: [], repairGaps: [] }; }
      enrichments.push({ fieldId: field.fieldId, label: field.name, original: field.value, ...e });
    }

    db.prepare('UPDATE enrichment_sessions SET enrichments=?, status=? WHERE id=?')
      .run(JSON.stringify(enrichments), 'enriched', req.params.sessionId);

    res.json({ enrichments });
  } catch (err) {
    console.error('[Enrich]', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// SESSIONS
// ────────────────────────────────────────────────────────────────────────────

app.get('/api/session/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM enrichment_sessions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  const oem = db.prepare('SELECT id,name,brand FROM oem_configs WHERE id=?').get(s.oem_config_id);
  const mac = s.machine_id
    ? db.prepare('SELECT id,machine_model FROM oem_machines WHERE id=?').get(s.machine_id)
    : null;
  res.json({
    ...s,
    original_fields:   JSON.parse(s.original_fields   || '[]'),
    enrichments:       JSON.parse(s.enrichments       || '[]'),
    review_decisions:  JSON.parse(s.review_decisions  || '{}'),
    extracted_images:  JSON.parse(s.extracted_images  || '[]'),
    oem_config: oem,
    machine:    mac,
  });
});

app.put('/api/session/:id/review', (req, res) => {
  const s = db.prepare('SELECT * FROM enrichment_sessions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  const { decisions } = req.body;
  if (!decisions) return res.status(400).json({ error: 'decisions required' });

  const merged = { ...JSON.parse(s.review_decisions || '{}'), ...decisions };
  const enr    = JSON.parse(s.enrichments || '[]');
  // New gap format (has diagnosticGaps key): always complete — no decisions needed
  // Legacy severity format: check all non-ok fields have decisions
  const isGapFormat = enr.length === 0 || enr[0]?.diagnosticGaps !== undefined;
  const complete = isGapFormat ? true : enr.filter(e => e.severity !== 'ok').every(e => merged[e.fieldId]);

  db.prepare('UPDATE enrichment_sessions SET review_decisions=?, status=? WHERE id=?')
    .run(JSON.stringify(merged), complete ? 'reviewed' : 'enriched', req.params.id);
  res.json({ decisions: merged, complete });
});

app.put('/api/session/:id/export', (req, res) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE enrichment_sessions SET exported_at=?, claim_status=? WHERE id=?')
    .run(now, 'exported', req.params.id);
  res.json({ ok: true, exported_at: now });
});

// ────────────────────────────────────────────────────────────────────────────
// CLAIM UPLOAD + PROCESS (new 3-step flow)
// ────────────────────────────────────────────────────────────────────────────

// POST /api/claim/upload-files — upload single file, return {filename,size,type,r2_key}
app.post('/api/claim/upload-files', claimUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const { originalname, size, buffer, mimetype } = req.file;
    const ext = path.extname(originalname).toLowerCase().replace('.', '') || 'pdf';
    let r2Key;
    if (R2_CONFIGURED) {
      r2Key = `claim-uploads/${Date.now()}-${originalname}`;
      await uploadToR2(r2Key, buffer, mimetype);
    } else {
      const localName = `${Date.now()}-${originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      fs.writeFileSync(path.join(LOCAL_UPLOADS_DIR, localName), buffer);
      r2Key = `local:${localName}`;
    }
    res.json({ filename: originalname, size, type: ext, r2_key: r2Key });
  } catch(err) {
    console.error('[Claim File Upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Identify job card (fast, no-persist, no-hallucination) ────────────────
const IDENTIFY_SYSTEM_PROMPT = `You are a warranty claim document reader. Your only job is to extract three pieces of identifying information from a job card document: the OEM brand, the machine model, and the job number.

CRITICAL RULES — read carefully:

1. Only return values that are LITERALLY WRITTEN in the document. Do not infer, guess, complete, or extend partial text.

2. If you cannot find a field clearly written in the document, return an empty string for that field. Do NOT guess based on other fields, serial number patterns, or prior knowledge.

3. Return the brand exactly as it appears. Common OEM brand names include Terex, Powerscreen, Fuchs, Doppstadt, Develon (formerly Doosan), JCB, Volvo, Caterpillar, Komatsu, Hyundai. Note: Terex, Fuchs, and Powerscreen are all manufactured by the Terex group and share the same warranty submission portal — but you must still return the brand exactly as written in the document. Do not consolidate or normalise to "Terex". Do NOT substitute or normalise the brand — return it as written. If the document says "TEREX MPS" return "TEREX MPS", not "Terex".

4. The job number may be labelled "Job No.", "Work Order", "WO", "Job Card #", or similar. Return the value, not the label.

5. The machine model is typically a product name + identifier (e.g. "Trakker MP-3000", "Powerscreen Premiertrak 400"). Return what is written.

6. Set confidence based on the LOWEST-confidence field:
   - 'high': all three fields are unambiguously written in clear, legible text
   - 'medium': at least one field is partially obscured, abbreviated, or slightly ambiguous but still readable
   - 'low': any field is missing, illegible, or you had to guess

Use the identify_job_card tool to return your findings.

Do NOT add any commentary, reasoning, or explanation outside the tool call. Do NOT continue extraction beyond these three fields.`;

const identifyTool = {
  name: 'identify_job_card',
  description: 'Extract ONLY the brand, machine model, and job number that are LITERALLY VISIBLE in the warranty job card text. Do not infer, guess, or use prior knowledge.',
  input_schema: {
    type: 'object',
    properties: {
      brand: {
        type: 'string',
        description: 'OEM brand name AS WRITTEN in the document. If not literally visible, return empty string. Do not infer from serial number patterns or model names.'
      },
      machine: {
        type: 'string',
        description: 'Machine model AS WRITTEN in the document. If not literally visible, return empty string.'
      },
      jobNumber: {
        type: 'string',
        description: 'Job card or work order number AS WRITTEN in the document. If not literally visible, return empty string.'
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: "high: all three fields clearly visible and unambiguous. medium: at least one field present but slightly ambiguous. low: any field missing or guessed."
      }
    },
    required: ['brand', 'machine', 'jobNumber', 'confidence']
  }
};

app.post('/api/claim/identify', async (req, res) => {
  try {
    const { files, pastedText } = req.body;

    const contentBlocks = [];

    if (files && files.length > 0) {
      for (const f of files) {
        const buf = await getFileBuffer(f.r2_key);
        const isDocx = ['doc', 'docx'].includes((f.type || '').toLowerCase());
        if (isDocx) {
          try {
            const { value: text } = await mammoth.extractRawText({ buffer: buf });
            contentBlocks.push({ type: 'text', text: `[Document: ${f.filename}]\n${text}` });
          } catch {
            contentBlocks.push({ type: 'text', text: `[Document: ${f.filename} — text extraction failed]` });
          }
        } else {
          contentBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
          });
        }
      }
    }

    if (pastedText && pastedText.trim()) {
      contentBlocks.push({ type: 'text', text: pastedText.trim() });
    }

    if (contentBlocks.length === 0) {
      return res.status(400).json({ error: 'No input provided' });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: IDENTIFY_SYSTEM_PROMPT,
      tools: [identifyTool],
      tool_choice: { type: 'tool', name: 'identify_job_card' },
      messages: [{ role: 'user', content: contentBlocks }],
    });

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse) {
      return res.json({ brand: '', machine: '', jobNumber: '', confidence: 'low', error: 'No tool_use in response' });
    }

    res.json(toolUse.input);
  } catch (err) {
    console.error('[identify] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/claim/process — analyse with Claude Opus, save claim
app.post('/api/claim/process', async (req, res) => {
  try {
    const { oemConfigId, prompt: promptOverride, files, promptId, repairDate, pastedText } = req.body;

    const hasFiles  = Array.isArray(files) && files.length > 0;
    const hasPasted = typeof pastedText === 'string' && pastedText.trim().length > 0;

    console.log('[Process] STAGE A — files received:', files?.length, '| pastedText length:', pastedText?.length);
    console.log('[Process] STAGE B — promptId:', promptId, 'promptOverride length:', promptOverride?.length);

    if (!hasFiles && !hasPasted) return res.status(400).json({ error: 'Provide either files or pasted text' });
    if (hasFiles  && hasPasted)  return res.status(400).json({ error: 'Provide either files or pasted text, not both' });

    const oemRow = oemConfigId ? db.prepare('SELECT * FROM oem_configs WHERE id=?').get(oemConfigId) : null;
    const oem    = oemRow ? parseOemRow(oemRow) : null;

    // Resolve prompt: explicit id → explicit text → db default for brand → db default all → error
    let resolvedPrompt    = promptOverride || null;
    let resolvedPromptId  = null;
    let resolvedPromptName = 'Custom';

    if (promptId) {
      const cp = db.prepare('SELECT * FROM custom_prompts WHERE id=?').get(promptId);
      if (cp) { resolvedPrompt = cp.prompt_text; resolvedPromptId = cp.id; resolvedPromptName = cp.name; }
    }
    if (!resolvedPrompt) {
      const oemBrand = oem?.brand || oem?.name || null;
      let dp = null;
      if (oemBrand) {
        dp = db.prepare('SELECT * FROM custom_prompts WHERE category=? AND brand=? AND is_default=1 LIMIT 1').get('New Claim', oemBrand);
      }
      if (!dp) dp = db.prepare('SELECT * FROM custom_prompts WHERE category=? AND brand IS NULL AND is_default=1 LIMIT 1').get('New Claim');
      if (dp) { resolvedPrompt = dp.prompt_text; resolvedPromptId = dp.id; resolvedPromptName = dp.name; }
    }
    if (!resolvedPrompt) return res.status(400).json({ error: 'No prompt found — add a default prompt in Custom Prompts' });

    // (isTerex and TEREX_BRANDS/TEREX_FIELD_IDS removed — portal schema is now OEM-driven)

    // Build message content blocks — from files or pasted text
    const contentBlocks = [];
    if (hasPasted) {
      contentBlocks.push({ type: 'text', text: `[Pasted Job Card Content]\n${pastedText.trim()}` });
    } else {
      for (const f of files) {
        const buf = await getFileBuffer(f.r2_key);
        const isDocx = ['doc','docx'].includes((f.type||'').toLowerCase());
        if (isDocx) {
          try {
            const { value: text } = await mammoth.extractRawText({ buffer: buf });
            contentBlocks.push({ type: 'text', text: `[Document: ${f.filename}]\n${text}` });
          } catch {
            contentBlocks.push({ type: 'text', text: `[Document: ${f.filename} — text extraction failed]` });
          }
        } else {
          contentBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
          });
        }
      }
    }

    // Upload pasted text as .docx to R2 (best-effort — won't fail the request)
    let pastedDocxR2Key = null;
    if (hasPasted) {
      try {
        const docxBuf = await pastedTextToDocxBuffer(pastedText.trim());
        const key = `claims/pasted-${Date.now()}.docx`;
        const uploaded = await uploadToR2(key, docxBuf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        if (uploaded) pastedDocxR2Key = key;
      } catch (e) {
        console.error('[Process] pastedText docx upload failed:', e.message);
      }
    }

    console.log('[Process] STAGE C — Anthropic call starting, OEM:', oem?.name || 'none');

    // Robust JSON extractor — never throws, always returns an object
    function robustExtractJson(text) {
      if (!text) return {};
      const cleaned = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace  = cleaned.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return {};
      const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
      try { return JSON.parse(jsonStr); }
      catch (err) {
        console.error('[Process] JSON parse failed:', err.message, '— raw snippet:', jsonStr.slice(0, 300));
        return {};
      }
    }

    // Robust array extractor — finds outermost [...], never throws
    function robustExtractArray(text) {
      if (!text) return null;
      const cleaned = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
      const firstBracket = cleaned.indexOf('[');
      const lastBracket  = cleaned.lastIndexOf(']');
      if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) return null;
      const jsonStr = cleaned.slice(firstBracket, lastBracket + 1);
      try {
        const arr = JSON.parse(jsonStr);
        return Array.isArray(arr) ? arr : null;
      } catch (err) {
        console.error('[Process] Array parse failed:', err.message, '— raw snippet:', jsonStr.slice(0, 300));
        return null;
      }
    }

    // When input is pasted prompt-result text, use the fixed 8-field schema
    // (the user is pasting an extraction result; postcode is not mapped to the portal)
    const PROMPT_RESULT_FIELDS = hasPasted ? [
      { fieldId: 'application',   name: 'Application',   description: 'Machine application context if present in narrative' },
      { fieldId: 'hours_run',     name: 'Hours Run',      description: 'machine_hours from the prompt result' },
      { fieldId: 'helpdesk_ref',  name: 'Help Desk Ref',  description: 'Leave empty unless explicitly present' },
      { fieldId: 'dealer_ref',    name: 'Dealer Ref',     description: 'job_number from the prompt result' },
      { fieldId: 'repair_date',   name: 'Repair Date',    description: 'date_of_repair from the prompt result (DD/MM/YYYY)' },
      { fieldId: 'description',   name: 'Description',    description: 'reason from the prompt result' },
      { fieldId: 'suspect_cause', name: 'Suspect Cause',  description: 'cause from the prompt result' },
      { fieldId: 'action_taken',  name: 'Action Taken',   description: 'resolution from the prompt result' },
    ] : null;

    // Build JSON schema from OEM's portal_fields (or prompt-result override)
    const portalFields = PROMPT_RESULT_FIELDS || oem?.portal_fields || [];
    const hasSchema = portalFields.length > 0;

    let portalOutput = {};
    let aiRawResponse = '';

    if (hasSchema) {
      // Build tool input schema from portal_fields
      const inputSchema = {
        type: 'object',
        properties: portalFields.reduce((acc, f) => {
          acc[f.fieldId] = { type: 'string', description: f.description || f.name };
          return acc;
        }, {}),
        required: portalFields.map(f => f.fieldId),
      };

      // For pasted prompt-result input, prepend explicit mapping instructions
      const pastedMappingPrefix = hasPasted
        ? `You are mapping a warranty prompt result to a Terex portal.\n` +
          `The prompt result may contain fields: job_number, machine_serial, model, date_of_failure, date_of_repair, machine_hours, part_numbers, reason, cause, resolution, engineer_narrative.\n\n` +
          `Map them to these 8 Terex portal fields ONLY:\n` +
          `  application  ← machine application context from engineer_narrative if present\n` +
          `  hours_run    ← machine_hours\n` +
          `  helpdesk_ref ← leave empty unless explicitly present\n` +
          `  dealer_ref   ← job_number\n` +
          `  repair_date  ← date_of_repair\n` +
          `  description  ← reason\n` +
          `  suspect_cause ← cause\n` +
          `  action_taken ← resolution\n\n` +
          `Do NOT fabricate values. If a source field is missing or empty, return an empty string. Do NOT infer.\n\n`
        : '';

      const toolResp = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        tools: [{
          name: 'submit_warranty_claim',
          description: 'Submit the extracted warranty claim data matching the OEM portal structure',
          input_schema: inputSchema,
        }],
        tool_choice: { type: 'tool', name: 'submit_warranty_claim' },
        messages: [{
          role: 'user',
          content: [
            ...contentBlocks,
            {
              type: 'text',
              text: pastedMappingPrefix + resolvedPrompt + '\n\nUse the submit_warranty_claim tool to return the extracted fields.',
            },
          ],
        }],
      });

      const toolUse = toolResp.content.find(b => b.type === 'tool_use');
      if (toolUse) {
        portalOutput = toolUse.input;
        aiRawResponse = JSON.stringify(portalOutput);
      } else {
        // Fallback: Haiku extraction using OEM field IDs
        console.warn('[Process] No tool_use in response, running Haiku fallback');
        const rawText = toolResp.content.find(b => b.type === 'text')?.text || '';
        aiRawResponse = rawText;
        try {
          const hr = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            messages: [{
              role: 'user',
              content: `Extract warranty portal field values from this text.\n\nText:\n${rawText.slice(0, 6000)}\n\nRequired field IDs: ${portalFields.map(f => f.fieldId).join(', ')}\n\nReturn ONLY valid JSON with these exact field IDs as keys. Empty string for any field not found.`
            }],
          });
          portalOutput = robustExtractJson(hr.content[0].text);
        } catch (he) {
          console.error('[Process] Haiku fallback failed:', he.message);
          portalOutput = { analysis_notes: rawText };
        }
      }
    } else {
      // No portal schema defined — use free-form extraction
      const resp = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [...contentBlocks, { type: 'text', text: resolvedPrompt }] }],
      });
      const aiRawText = resp.content[0]?.text || '';
      aiRawResponse = aiRawText;
      const arr = robustExtractArray(aiRawText);
      if (arr && arr.length > 0) {
        portalOutput = arr[0];
      } else {
        portalOutput = robustExtractJson(aiRawText) || { analysis_notes: aiRawText };
      }
    }

    console.log('[Process] STAGE D — AI response received, portal_output keys:', Object.keys(portalOutput));

    const insertClaim = db.prepare(`
      INSERT INTO claims (oem_config_id, oem_name, uploaded_documents, prompt, ai_model, ai_raw_response, portal_output, custom_prompt_id, repair_date, status)
      VALUES (?,?,?,?,?,?,?,?,?,'ready')
    `);

    const docJson = hasPasted
      ? JSON.stringify([{
          type: 'pasted_text_docx',
          filename: 'pasted-job-card.docx',
          size: pastedText.trim().length,
          ...(pastedDocxR2Key ? { r2_key: pastedDocxR2Key } : { content: pastedText.trim() }),
        }])
      : JSON.stringify(files.map(f => ({ filename: f.filename, size: f.size || 0, type: f.type, r2_key: f.r2_key })));

    console.log('[Process] STAGE G — portal_output before save:', JSON.stringify(portalOutput).slice(0, 1000));

    const ins = insertClaim.run(
      oemConfigId || null, oem?.name || null,
      docJson, resolvedPrompt, 'claude-opus-4-6', aiRawResponse, JSON.stringify(portalOutput),
      resolvedPromptId, repairDate || null,
    );
    const claimId = ins.lastInsertRowid;
    console.log('[Process] STAGE H — saved claim id:', claimId);
    const responsePayload = { claimId, claimIds: [claimId], portalOutput, aiRawResponse, promptId: resolvedPromptId, promptName: resolvedPromptName };
    console.log('[Process] STAGE I — response sent to frontend:', JSON.stringify(responsePayload).slice(0, 500));
    res.json(responsePayload);
  } catch(err) {
    console.error('[Claim Process]', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// CLAIM HISTORY
// ────────────────────────────────────────────────────────────────────────────

app.get('/api/claims', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, cp.name AS prompt_name
    FROM claims c
    LEFT JOIN custom_prompts cp ON c.custom_prompt_id = cp.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows.map(r => ({
    ...r,
    uploaded_documents: JSON.parse(r.uploaded_documents || '[]'),
    portal_output:      JSON.parse(r.portal_output      || '{}'),
    promptPreview:      r.prompt_name || '',
  })));
});

app.put('/api/claims/:id/status', (req, res) => {
  const VALID = ['ready', 'copied_to_oem_portal', 'submitted'];
  const { status } = req.body;
  if (!VALID.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
  const existing = db.prepare('SELECT id FROM claims WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE claims SET status=? WHERE id=?").run(status, req.params.id);
  res.json({ ok: true, status });
});

app.put('/api/claims/:id/portal-output', (req, res) => {
  try {
    const { id } = req.params;
    const { portal_output } = req.body;
    if (!portal_output || typeof portal_output !== 'object') {
      return res.status(400).json({ error: 'Invalid portal_output' });
    }
    const result = db.prepare(`
      UPDATE claims SET portal_output = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(JSON.stringify(portal_output), id);
    if (result.changes === 0) return res.status(404).json({ error: 'Claim not found' });
    console.log('[Autosave] claim', id, 'updated');
    res.json({ success: true });
  } catch (err) {
    console.error('[Autosave Error]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/claims/:id', (req, res) => {
  const claim = db.prepare('SELECT * FROM claims WHERE id=?').get(req.params.id);
  if (!claim) return res.status(404).json({ error: 'Not found' });
  const oemRow = claim.oem_config_id ? db.prepare('SELECT * FROM oem_configs WHERE id=?').get(claim.oem_config_id) : null;
  res.json({
    ...claim,
    uploaded_documents: JSON.parse(claim.uploaded_documents || '[]'),
    portal_output:      JSON.parse(claim.portal_output      || '{}'),
    oem_config: oemRow ? parseOemRow(oemRow) : null,
  });
});

app.get('/api/claims/:id/document/:docIndex', async (req, res) => {
  try {
    const claim = db.prepare('SELECT * FROM claims WHERE id=?').get(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });
    const docs = JSON.parse(claim.uploaded_documents || '[]');
    const doc  = docs[parseInt(req.params.docIndex, 10)];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const buf = await getFileBuffer(doc.r2_key);
    const ct  = doc.type === 'pdf' ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
    res.send(buf);
  } catch(err) {
    console.error('[Claim Doc Download]', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/claims/:id', async (req, res) => {
  const claim = db.prepare('SELECT * FROM claims WHERE id=?').get(req.params.id);
  if (!claim) return res.status(404).json({ error: 'Not found' });
  // Best-effort R2 deletion — don't fail if R2 errors
  if (r2) {
    try {
      const docs = JSON.parse(claim.uploaded_documents || '[]');
      for (const doc of docs) {
        if (doc.r2_key) {
          await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: doc.r2_key })).catch(() => {});
        }
      }
    } catch {}
  }
  db.prepare('DELETE FROM claims WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

function resolve(fieldId, fields, enrichments, decisions) {
  const f = fields.find(f => f.fieldId === fieldId);
  if (!f) return '';
  const e = enrichments.find(e => e.fieldId === fieldId);
  const d = decisions[fieldId];
  if (d) {
    if (d.action === 'accept') return e?.suggestion ?? f.value;
    if (d.action === 'edit')   return d.value ?? '';
    return f.value;
  }
  if (e?.severity === 'ok') return e.suggestion ?? f.value;
  return f.value;
}

app.get('/api/export/:id/txt', (req, res) => {
  const s = db.prepare('SELECT * FROM enrichment_sessions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const fields = JSON.parse(s.original_fields || '[]');
  const enr    = JSON.parse(s.enrichments     || '[]');
  const dec    = JSON.parse(s.review_decisions|| '{}');
  const oem    = db.prepare('SELECT name FROM oem_configs WHERE id=?').get(s.oem_config_id);
  const mac    = s.machine_id ? db.prepare('SELECT machine_model FROM oem_machines WHERE id=?').get(s.machine_id) : null;

  const lines = [
    '='.repeat(56), ' ENRICHED JOB CARD', '='.repeat(56),
    `Generated : ${new Date().toUTCString()}`,
    `OEM       : ${oem?.name || '—'}`,
    `Machine   : ${mac?.machine_model || s.machine || '—'}`,
    `Job Ref   : ${s.job_ref || '—'}`,
    `Engineer  : ${s.engineer || '—'}`, '',
    ...fields.flatMap(f => [`--- ${f.name.toUpperCase()} ---`, resolve(f.fieldId, fields, enr, dec) || '(no value)', '']),
  ];
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="job-card-${req.params.id.slice(0,8)}.txt"`);
  res.send(lines.join('\n'));
});

app.get('/api/export/:id/docx', async (req, res) => {
  try {
    const s = db.prepare('SELECT * FROM enrichment_sessions WHERE id=?').get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const fields = JSON.parse(s.original_fields || '[]');
    const enr    = JSON.parse(s.enrichments     || '[]');
    const oem    = db.prepare('SELECT name FROM oem_configs WHERE id=?').get(s.oem_config_id);
    const mac    = s.machine_id ? db.prepare('SELECT machine_model FROM oem_machines WHERE id=?').get(s.machine_id) : null;

    const NAVY = '0D1F3C';
    const GREY = '666666';

    const children = [
      new Paragraph({
        children: [new TextRun({ text: 'JOB CARD & COMMENTS', bold: true, size: 36, color: NAVY })],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'OEM: ',     bold: true, size: 22, color: NAVY }),
          new TextRun({ text: `${oem?.name || '—'}    `, size: 22 }),
          new TextRun({ text: 'Machine: ', bold: true, size: 22, color: NAVY }),
          new TextRun({ text: mac?.machine_model || s.machine || '—', size: 22 }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Job Ref: ',    bold: true, size: 22, color: NAVY }),
          new TextRun({ text: `${s.job_ref || '—'}    `, size: 22 }),
          new TextRun({ text: 'Repair Date: ', bold: true, size: 22, color: NAVY }),
          new TextRun({ text: s.repair_date || '—', size: 22 }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Generated: ', bold: true, size: 18, color: GREY }),
          new TextRun({ text: new Date().toUTCString(), size: 18, color: GREY }),
        ],
        spacing: { after: 280 },
      }),
    ];

    for (const field of fields) {
      const gaps     = enr.find(e => e.fieldId === field.fieldId);
      const hasDiag  = gaps?.diagnosticGaps?.length > 0;
      const hasRepair= gaps?.repairGaps?.length > 0;

      children.push(new Paragraph({
        children: [new TextRun({ text: field.name, bold: true, size: 24, color: NAVY })],
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: 'single', size: 4, color: 'D0D0D0', space: 4 } },
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: field.value || '(no value)', size: 22, italics: !field.value, color: field.value ? '000000' : GREY })],
        spacing: { after: 100 },
      }));

      if (hasDiag || hasRepair) {
        children.push(new Paragraph({
          children: [new TextRun({ text: 'Comments / Identified Gaps:', bold: true, size: 22, color: NAVY })],
          spacing: { before: 80, after: 60 },
        }));
        if (hasDiag) {
          children.push(new Paragraph({
            children: [new TextRun({ text: 'Diagnostic', bold: true, size: 20, color: GREY })],
            spacing: { after: 40 },
          }));
          for (const g of gaps.diagnosticGaps) {
            children.push(new Paragraph({
              children: [new TextRun({ text: `\u2022  ${g}`, size: 20 })],
              spacing: { after: 40 },
              indent: { left: 360 },
            }));
          }
        }
        if (hasRepair) {
          children.push(new Paragraph({
            children: [new TextRun({ text: 'Repair', bold: true, size: 20, color: GREY })],
            spacing: { before: 80, after: 40 },
          }));
          for (const g of gaps.repairGaps) {
            children.push(new Paragraph({
              children: [new TextRun({ text: `\u2022  ${g}`, size: 20 })],
              spacing: { after: 40 },
              indent: { left: 360 },
            }));
          }
        }
      } else {
        children.push(new Paragraph({
          children: [new TextRun({ text: '\u2713 No documentation gaps identified.', size: 20, color: '16A34A' })],
          spacing: { after: 60 },
        }));
      }
    }

    const doc = new Document({
      creator: 'Warranty Intelligence',
      title: `Job Card & Comments — ${oem?.name || ''}`,
      sections: [{ properties: {}, children }],
    });

    const buf = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="job-card-comments-${req.params.id.slice(0,8)}.docx"`);
    res.send(buf);
  } catch (err) {
    console.error('[Export DOCX]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/export/:id/csv', (req, res) => {
  const s = db.prepare('SELECT * FROM enrichment_sessions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const fields  = JSON.parse(s.original_fields  || '[]');
  const enr     = JSON.parse(s.enrichments      || '[]');
  const dec     = JSON.parse(s.review_decisions || '{}');
  const oemRow  = db.prepare('SELECT * FROM oem_configs WHERE id=?').get(s.oem_config_id);
  const portal  = JSON.parse(oemRow?.portal_fields || '[]');
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;

  const csv = [
    portal.map(f => esc(f.name || f.fieldId)).join(','),
    portal.map(f => {
      let v = resolve(f.fieldId, fields, enr, dec);
      if (f.maxChars && v.length > f.maxChars) v = v.slice(0, f.maxChars);
      return esc(v);
    }).join(','),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="portal-${req.params.id.slice(0,8)}.csv"`);
  res.send(csv);
});

// ────────────────────────────────────────────────────────────────────────────
// CUSTOM PROMPTS
// ────────────────────────────────────────────────────────────────────────────

// GET /api/prompts/default — must be BEFORE /:id
app.get('/api/prompts/default', (req, res) => {
  const { category = 'New Claim', brand } = req.query;
  let dp = null;
  if (brand) dp = db.prepare('SELECT * FROM custom_prompts WHERE category=? AND brand=? AND is_default=1 LIMIT 1').get(category, brand);
  if (!dp)   dp = db.prepare('SELECT * FROM custom_prompts WHERE category=? AND brand IS NULL AND is_default=1 LIMIT 1').get(category);
  if (!dp)   return res.status(404).json({ error: 'No default prompt found' });
  res.json(dp);
});

app.get('/api/prompts', (_req, res) => {
  res.json(db.prepare('SELECT * FROM custom_prompts ORDER BY category, name COLLATE NOCASE').all());
});

app.get('/api/prompts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM custom_prompts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.post('/api/prompts', (req, res) => {
  const { name, category, brand, is_default, prompt_text } = req.body;
  if (!name || !category || !prompt_text) return res.status(400).json({ error: 'name, category, prompt_text required' });
  const brandVal = brand || null;
  if (is_default) {
    if (brandVal) db.prepare('UPDATE custom_prompts SET is_default=0 WHERE category=? AND brand=?').run(category, brandVal);
    else          db.prepare('UPDATE custom_prompts SET is_default=0 WHERE category=? AND brand IS NULL').run(category);
  }
  const ins = db.prepare(`INSERT INTO custom_prompts (name,category,brand,is_default,prompt_text) VALUES (?,?,?,?,?)`).run(name, category, brandVal, is_default ? 1 : 0, prompt_text);
  res.json(db.prepare('SELECT * FROM custom_prompts WHERE id=?').get(ins.lastInsertRowid));
});

app.put('/api/prompts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM custom_prompts WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name, category, brand, is_default, prompt_text } = req.body;
  const newCat   = category    ?? existing.category;
  const newBrand = brand !== undefined ? (brand || null) : existing.brand;
  if (is_default) {
    if (newBrand) db.prepare('UPDATE custom_prompts SET is_default=0 WHERE category=? AND brand=? AND id!=?').run(newCat, newBrand, req.params.id);
    else          db.prepare('UPDATE custom_prompts SET is_default=0 WHERE category=? AND brand IS NULL AND id!=?').run(newCat, req.params.id);
  }
  db.prepare(`UPDATE custom_prompts SET name=?,category=?,brand=?,is_default=?,prompt_text=?,updated_at=datetime('now') WHERE id=?`)
    .run(name ?? existing.name, newCat, newBrand, is_default ? 1 : 0, prompt_text ?? existing.prompt_text, req.params.id);
  res.json(db.prepare('SELECT * FROM custom_prompts WHERE id=?').get(req.params.id));
});

app.delete('/api/prompts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM custom_prompts WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM custom_prompts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Telemetry ──────────────────────────────────────────────────────────────
const ALLOWED_EVENTS = new Set([
  'widget_loaded', 'widget_expanded', 'widget_minimised',
  'text_pasted', 'file_uploaded',
  'identify_started', 'identify_completed', 'identify_failed',
  'verify_shown',
  'fill_started', 'fill_completed', 'fill_failed',
  'field_filled', 'field_edited_by_user',
  'success_shown', 'reset_clicked', 'minimise_clicked',
  'feedback_thumbs_up', 'feedback_thumbs_down', 'feedback_text',
  'error',
]);

app.post('/api/telemetry/event', (req, res) => {
  try {
    const { userId, sessionId, eventType, eventData, pageHostname, pageUrl } = req.body;
    if (!userId || !eventType) {
      return res.status(400).json({ error: 'userId and eventType are required' });
    }
    if (!ALLOWED_EVENTS.has(eventType)) {
      return res.status(400).json({ error: `Unknown event type: ${eventType}` });
    }
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || null;
    db.prepare(`
      INSERT INTO telemetry_events
        (timestamp, user_id, session_id, event_type, event_data, page_hostname, page_url, user_agent, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      String(userId),
      sessionId || null,
      eventType,
      eventData ? JSON.stringify(eventData) : null,
      pageHostname || null,
      pageUrl || null,
      req.headers['user-agent'] || null,
      ip,
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Telemetry]', err);
    res.status(500).json({ error: 'Telemetry write failed' });
  }
});

app.get('/api/telemetry/summary/:secret', (req, res) => {
  if (!process.env.TELEMETRY_ADMIN_SECRET || req.params.secret !== process.env.TELEMETRY_ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({
    totalEvents:  db.prepare('SELECT COUNT(*) as c FROM telemetry_events').get().c,
    uniqueUsers:  db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM telemetry_events').get().c,
    eventsByType: db.prepare('SELECT event_type, COUNT(*) as count FROM telemetry_events GROUP BY event_type ORDER BY count DESC').all(),
    eventsByDay:  db.prepare("SELECT DATE(timestamp) as day, COUNT(*) as count FROM telemetry_events GROUP BY day ORDER BY day DESC LIMIT 14").all(),
    eventsByUser: db.prepare('SELECT user_id, COUNT(*) as count, MIN(timestamp) as first_event, MAX(timestamp) as last_event FROM telemetry_events GROUP BY user_id ORDER BY count DESC').all(),
    lastEvents:   db.prepare('SELECT timestamp, user_id, event_type, page_hostname FROM telemetry_events ORDER BY id DESC LIMIT 20').all(),
  });
});

app.get('/api/telemetry/user/:userId/:secret', (req, res) => {
  if (!process.env.TELEMETRY_ADMIN_SECRET || req.params.secret !== process.env.TELEMETRY_ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const events = db.prepare(`
    SELECT timestamp, event_type, event_data, page_hostname, page_url
    FROM telemetry_events WHERE user_id = ?
    ORDER BY id DESC LIMIT 200
  `).all(req.params.userId);
  res.json({ userId: req.params.userId, events });
});

// ── Catch-all SPA ─────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`[Server] Warranty Engine on port ${PORT}`));
