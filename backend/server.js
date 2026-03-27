import 'dotenv/config';
import express from 'express';
import multer  from 'multer';
import cors    from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createRequire } from 'module';
import { db } from './db.js';
import crypto  from 'crypto';
import path    from 'path';
import { fileURLToPath } from 'url';

const require    = createRequire(import.meta.url);
const pdfParse   = require('pdf-parse');
const __dirname  = path.dirname(fileURLToPath(import.meta.url));

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

const distPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(distPath));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, f.mimetype === 'application/pdf'),
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

// Build enrichment context from docs for a specific machine
function buildMachineContext(machineId) {
  const LABELS = {
    warranty_policy:  'WARRANTY POLICY',
    portal_structure: 'PORTAL FIELD STRUCTURE',
    machine_handbook: 'MACHINE HANDBOOK',
    historic_claims:  'HISTORIC APPROVED CLAIMS (match this tone/detail)',
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

// ────────────────────────────────────────────────────────────────────────────
// LIBRARY — OEM × Machine flat table
// ────────────────────────────────────────────────────────────────────────────

// GET /api/library — full flat table: [{oemId, oemName, machineId, machineModel, documents:[]}]
app.get('/api/library', (_req, res) => {
  const machines = db.prepare(`
    SELECT m.id AS machine_id, m.machine_model, m.created_at AS machine_created_at,
           c.id AS oem_id, c.name AS oem_name, c.brand AS oem_brand,
           c.policy_rules, c.portal_fields, c.job_card_fields
    FROM oem_machines m
    JOIN oem_configs c ON c.id = m.oem_config_id
    ORDER BY c.name COLLATE NOCASE, m.machine_model COLLATE NOCASE
  `).all();

  const rows = machines.map(m => {
    const docs = db.prepare(
      'SELECT id, doc_type, filename, uploaded_at FROM oem_documents WHERE machine_id = ?'
    ).all(m.machine_id);
    return {
      machineId:    m.machine_id,
      machineModel: m.machine_model,
      oemId:        m.oem_id,
      oemName:      m.oem_name,
      oemBrand:     m.oem_brand,
      policy_rules:    JSON.parse(m.policy_rules    || '[]'),
      portal_fields:   JSON.parse(m.portal_fields   || '[]'),
      job_card_fields: JSON.parse(m.job_card_fields || '[]'),
      documents:    docs,
    };
  });
  res.json(rows);
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
//   body fields: oemName, machineName, docType
//   file: pdf
// ────────────────────────────────────────────────────────────────────────────
app.post('/api/documents/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF received' });
    const { oemName, machineName, docType } = req.body;
    if (!oemName || !machineName || !docType) {
      return res.status(400).json({ error: 'oemName, machineName, docType all required' });
    }
    const VALID_TYPES = ['warranty_policy', 'portal_structure', 'machine_handbook', 'historic_claims'];
    if (!VALID_TYPES.includes(docType)) {
      return res.status(400).json({ error: `docType must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const { oem, machine } = findOrCreateMachine(oemName, machineName);
    const buf = req.file.buffer;
    const b64 = buf.toString('base64');

    // ── Text extraction ────────────────────────────────────────
    let content = await extractPdfText(buf);
    let method  = 'text';
    if (content.length < 100) {
      method = 'vision';
      const vr = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 8192,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: 'Transcribe all text from this document. Return transcribed text only.' },
        ]}],
      });
      content = vr.content[0].text;
    }

    // ── Re-extract structured config for policy/portal docs ───
    if (docType === 'warranty_policy') {
      try {
        const sr = await anthropic.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 8192,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: `Extract from this warranty policy. Return ONLY valid JSON:
{
  "policyRules": ["each rule as a statement"],
  "jobCardFields": [{"fieldId":"snake_case","name":"label","description":"what goes here","required":true,"type":"text"}]
}` },
          ]}],
        });
        const ex = extractJson(sr.content[0].text);
        db.prepare('UPDATE oem_configs SET policy_rules=?, job_card_fields=? WHERE id=?')
          .run(JSON.stringify(ex.policyRules || []), JSON.stringify(ex.jobCardFields || []), oem.id);
      } catch { /* keep existing */ }
    }

    if (docType === 'portal_structure') {
      try {
        const sr = await anthropic.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 4096,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: `Extract portal field structure. Return ONLY valid JSON:
{
  "portalFields": [{"fieldId":"id","name":"label","required":true,"maxChars":null,"description":"what maps here"}]
}` },
          ]}],
        });
        const ex = extractJson(sr.content[0].text);
        db.prepare('UPDATE oem_configs SET portal_fields=? WHERE id=?')
          .run(JSON.stringify(ex.portalFields || []), oem.id);
      } catch { /* keep existing */ }
    }

    // ── R2 upload ──────────────────────────────────────────────
    let r2Key = null;
    if (R2_CONFIGURED) {
      r2Key = `docs/${oem.id}/${machine.id}/${docType}-${Date.now()}.pdf`;
      await uploadToR2(r2Key, buf, 'application/pdf');
    }

    // ── Replace existing doc of same type for this machine ─────
    db.prepare('DELETE FROM oem_documents WHERE machine_id=? AND doc_type=?').run(machine.id, docType);
    const ins = db.prepare(`
      INSERT INTO oem_documents (oem_config_id, machine_id, doc_type, filename, r2_key, extracted_content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(oem.id, machine.id, docType, req.file.originalname, r2Key, content.slice(0, 60000));

    const doc = db.prepare('SELECT * FROM oem_documents WHERE id=?').get(ins.lastInsertRowid);
    res.json({ ...doc, machineId: machine.id, oemId: oem.id, transcriptionMethod: method });
  } catch (err) {
    console.error('[Doc Upload]', err);
    res.status(500).json({ error: err.message });
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
      model: 'claude-sonnet-4-6', max_tokens: 8192,
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

// ────────────────────────────────────────────────────────────────────────────
// JOB CARD — upload + enrich (now machine-aware)
// ────────────────────────────────────────────────────────────────────────────

// POST /api/jobcard/upload
app.post('/api/jobcard/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF received' });
    const { machineId, oemConfigId, jobRef, machine: machineLabel, engineer } = req.body;

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
      model: 'claude-sonnet-4-6', max_tokens: 8192,
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
         extracted_images, transcription_method)
      VALUES (?,?,?, ?, '[]','{}', 'pending', ?,?,?, ?, 'draft', ?,?)
    `).run(
      sessionId, oemConfig.id, resolvedMachineId || null,
      JSON.stringify(extractedFields),
      jobRef || null, machineLabel || oemConfig.name, engineer || null,
      extractedFields.length,
      JSON.stringify(extractedImages), method,
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
        model: 'claude-sonnet-4-6', max_tokens: 512,
        messages: [{ role: 'user', content: `Warranty claim quality reviewer for ${oem.name}.

Reference documents:
${context || 'No additional documents.'}

Field: ${field.name}
Description: ${def.description || 'N/A'}
Required: ${def.required ? 'Yes' : 'No'}
Current Value: "${field.value}"

Return ONLY JSON:
{"suggestion":"best final value","severity":"critical|warning|minor|ok","reason":"one sentence"}` }],
      });
      let e;
      try { e = extractJson(r.content[0].text); }
      catch { e = { suggestion: field.value, severity: 'ok', reason: 'Field assessed.' }; }
      enrichments.push({ fieldId: field.fieldId, ...e });
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
  const complete = enr.filter(e => e.severity !== 'ok').every(e => merged[e.fieldId]);

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
// CLAIM HISTORY
// ────────────────────────────────────────────────────────────────────────────

app.get('/api/claims', (_req, res) => {
  const rows = db.prepare(`
    SELECT s.*, c.name AS oem_name, c.brand AS oem_brand,
           m.machine_model AS machine_model_ref
    FROM enrichment_sessions s
    LEFT JOIN oem_configs  c ON c.id = s.oem_config_id
    LEFT JOIN oem_machines m ON m.id = s.machine_id
    ORDER BY s.created_at DESC
  `).all();
  res.json(rows.map(r => ({
    ...r,
    original_fields:  JSON.parse(r.original_fields  || '[]'),
    enrichments:      JSON.parse(r.enrichments      || '[]'),
    review_decisions: JSON.parse(r.review_decisions || '{}'),
    extracted_images: JSON.parse(r.extracted_images || '[]'),
  })));
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

// ── Catch-all SPA ─────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`[Server] Warranty Enrichment Engine on port ${PORT}`));
