import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { db } from './db.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Cloudflare R2 ──────────────────────────────────────────────────────────
const R2_CONFIGURED = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
);

let r2 = null;
if (R2_CONFIGURED) {
  r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  console.log('[R2] Configured — bucket:', process.env.R2_BUCKET_NAME);
} else {
  console.log('[R2] Not configured — file storage disabled');
}

async function uploadToR2(key, buffer, contentType) {
  if (!r2) return null;
  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return key;
  } catch (err) {
    console.error('[R2] Upload failed:', err.message);
    return null;
  }
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
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
});

// ── Helpers ───────────────────────────────────────────────────────────────
function extractJson(text, arrayMode = false) {
  const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const pattern  = arrayMode ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match    = stripped.match(pattern);
  if (!match) throw new Error('No JSON found in model response');
  return JSON.parse(match[0]);
}

function parseRow(row) {
  return {
    ...row,
    policy_rules:    JSON.parse(row.policy_rules    || '[]'),
    portal_fields:   JSON.parse(row.portal_fields   || '[]'),
    job_card_fields: JSON.parse(row.job_card_fields || '[]'),
  };
}

// Extract text from PDF buffer; returns '' on failure
async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    return (data.text || '').trim();
  } catch {
    return '';
  }
}

// Build context string from all OEM documents for this config
function buildOemContext(oemConfigId) {
  const DOC_LABELS = {
    warranty_policy:  'WARRANTY POLICY',
    portal_structure: 'PORTAL FIELD STRUCTURE',
    machine_handbook: 'MACHINE HANDBOOK',
    historic_claims:  'HISTORIC APPROVED CLAIMS (use as style/detail guide)',
  };
  const docs = db.prepare(
    'SELECT * FROM oem_documents WHERE oem_config_id = ? ORDER BY doc_type'
  ).all(oemConfigId);

  return docs
    .filter(d => d.extracted_content)
    .map(d => `[${DOC_LABELS[d.doc_type] || d.doc_type.toUpperCase()}]\n${d.extracted_content.substring(0, 4000)}`)
    .join('\n\n');
}

// ────────────────────────────────────────────────────────────────────────────
// OEM CONFIGS
// ────────────────────────────────────────────────────────────────────────────

// POST /api/oem/upload  — create new OEM from warranty policy PDF
app.post('/api/oem/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file received' });

    const pdfBase64 = req.file.buffer.toString('base64');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          {
            type: 'text',
            text: `Analyse this OEM warranty policy document.

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "oemName": "manufacturer/OEM name",
  "brand": "brand name",
  "policyRules": ["each rule as a clear statement"],
  "jobCardFields": [
    { "fieldId": "snake_case_id", "name": "Field label", "description": "What value goes here", "required": true, "type": "text" }
  ],
  "portalFields": [
    { "fieldId": "field_id", "name": "Portal label", "required": true, "maxChars": null, "description": "What maps here" }
  ]
}

Be exhaustive — include every field an engineer must fill in, and every portal submission field.`,
          },
        ],
      }],
    });

    const parsed = extractJson(response.content[0].text);

    const configResult = db.prepare(`
      INSERT INTO oem_configs (name, brand, policy_rules, portal_fields, job_card_fields)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      parsed.oemName,
      parsed.brand || parsed.oemName,
      JSON.stringify(parsed.policyRules   || []),
      JSON.stringify(parsed.portalFields  || []),
      JSON.stringify(parsed.jobCardFields || []),
    );

    const oemId = configResult.lastInsertRowid;

    // Also store as a warranty_policy document
    const extractedText = await extractPdfText(req.file.buffer);
    const docContent    = extractedText.length > 100 ? extractedText : JSON.stringify(parsed, null, 2);

    if (R2_CONFIGURED) {
      await uploadToR2(`oem-docs/${oemId}/warranty_policy-${Date.now()}.pdf`, req.file.buffer, 'application/pdf');
    }

    db.prepare('DELETE FROM oem_documents WHERE oem_config_id = ? AND doc_type = ?').run(oemId, 'warranty_policy');
    db.prepare(`
      INSERT INTO oem_documents (oem_config_id, doc_type, filename, extracted_content)
      VALUES (?, 'warranty_policy', ?, ?)
    `).run(oemId, req.file.originalname, docContent.substring(0, 60000));

    const saved = db.prepare('SELECT * FROM oem_configs WHERE id = ?').get(oemId);
    res.json(parseRow(saved));
  } catch (err) {
    console.error('[OEM Upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oem/configs  — list all OEM configs with doc status
app.get('/api/oem/configs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM oem_configs ORDER BY created_at DESC').all();
  const result = rows.map(row => {
    const docs = db.prepare(
      'SELECT doc_type, filename, uploaded_at FROM oem_documents WHERE oem_config_id = ?'
    ).all(row.id);
    return { ...parseRow(row), documents: docs };
  });
  res.json(result);
});

// GET /api/oem/:id  — single OEM with full docs list
app.get('/api/oem/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM oem_configs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'OEM not found' });
  const docs = db.prepare('SELECT * FROM oem_documents WHERE oem_config_id = ? ORDER BY doc_type').all(req.params.id);
  res.json({ ...parseRow(row), documents: docs });
});

// POST /api/oem/:id/documents  — upload / replace a document for an OEM
app.post('/api/oem/:id/documents', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file received' });

    const validTypes = ['warranty_policy', 'portal_structure', 'machine_handbook', 'historic_claims'];
    const { docType } = req.body;
    if (!validTypes.includes(docType)) return res.status(400).json({ error: `docType must be one of: ${validTypes.join(', ')}` });

    const oem = db.prepare('SELECT * FROM oem_configs WHERE id = ?').get(req.params.id);
    if (!oem) return res.status(404).json({ error: 'OEM not found' });

    const buffer    = req.file.buffer;
    const b64       = buffer.toString('base64');

    // ── Text extraction ────────────────────────────────────────
    let extractedContent     = await extractPdfText(buffer);
    let transcriptionMethod  = 'text';

    if (extractedContent.length < 100) {
      transcriptionMethod = 'vision';
      const vResp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: 'Transcribe all text content from this document as accurately as possible, preserving structure. Return only the transcribed text.' },
          ],
        }],
      });
      extractedContent = vResp.content[0].text;
    }

    // ── Re-extract structured config fields if needed ──────────
    if (docType === 'warranty_policy') {
      const sResp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: `Extract from this warranty policy:
{
  "policyRules": ["each rule as a clear statement"],
  "jobCardFields": [{"fieldId":"snake_case","name":"label","description":"what goes here","required":true,"type":"text"}]
}
Return ONLY valid JSON.` },
          ],
        }],
      });
      try {
        const ex = extractJson(sResp.content[0].text);
        db.prepare('UPDATE oem_configs SET policy_rules = ?, job_card_fields = ? WHERE id = ?')
          .run(JSON.stringify(ex.policyRules || []), JSON.stringify(ex.jobCardFields || []), req.params.id);
      } catch { /* keep existing */ }
    }

    if (docType === 'portal_structure') {
      const sResp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: `Extract portal field structure:
{
  "portalFields": [{"fieldId":"field_id","name":"label","required":true,"maxChars":null,"description":"what maps here"}]
}
Return ONLY valid JSON.` },
          ],
        }],
      });
      try {
        const ex = extractJson(sResp.content[0].text);
        db.prepare('UPDATE oem_configs SET portal_fields = ? WHERE id = ?')
          .run(JSON.stringify(ex.portalFields || []), req.params.id);
      } catch { /* keep existing */ }
    }

    // ── R2 upload ──────────────────────────────────────────────
    let r2Key = null;
    if (R2_CONFIGURED) {
      r2Key = `oem-docs/${req.params.id}/${docType}-${Date.now()}.pdf`;
      await uploadToR2(r2Key, buffer, 'application/pdf');
    }

    // ── Save to DB (replace existing of same type) ─────────────
    db.prepare('DELETE FROM oem_documents WHERE oem_config_id = ? AND doc_type = ?').run(req.params.id, docType);
    const result = db.prepare(`
      INSERT INTO oem_documents (oem_config_id, doc_type, filename, r2_key, extracted_content)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, docType, req.file.originalname, r2Key, extractedContent.substring(0, 60000));

    const doc = db.prepare('SELECT * FROM oem_documents WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ...doc, transcriptionMethod });
  } catch (err) {
    console.error('[OEM Document Upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/oem/documents/:docId
app.delete('/api/oem/documents/:docId', (req, res) => {
  db.prepare('DELETE FROM oem_documents WHERE id = ?').run(req.params.docId);
  res.json({ ok: true });
});

// ────────────────────────────────────────────────────────────────────────────
// JOB CARD + ENRICHMENT
// ────────────────────────────────────────────────────────────────────────────

// POST /api/jobcard/upload  — upload job card, extract fields
app.post('/api/jobcard/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file received' });
    const { oemConfigId, jobRef, machine, engineer } = req.body;
    if (!oemConfigId) return res.status(400).json({ error: 'oemConfigId is required' });

    const oemRow = db.prepare('SELECT * FROM oem_configs WHERE id = ?').get(oemConfigId);
    if (!oemRow) return res.status(404).json({ error: 'OEM config not found' });
    const oemConfig = parseRow(oemRow);

    const buffer    = req.file.buffer;
    const b64       = buffer.toString('base64');
    const fieldsJson = JSON.stringify(oemConfig.job_card_fields, null, 2);

    // ── Detect digital vs scanned ──────────────────────────────
    const extractedText      = await extractPdfText(buffer);
    const transcriptionMethod = extractedText.length >= 100 ? 'text' : 'vision';

    let content;
    if (transcriptionMethod === 'vision') {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        {
          type: 'text',
          text: `This appears to be a scanned or handwritten job card for a ${oemConfig.name} warranty claim.

Use your vision capabilities to:
1. Transcribe ALL handwritten and printed text
2. Extract values for each expected field
3. Note any photographs, diagrams, or images present

Expected fields:
${fieldsJson}

Return ONLY a JSON object:
{
  "fields": [
    { "fieldId": "exact_id", "name": "field name", "value": "extracted value" }
  ],
  "images": [
    { "id": "img_1", "description": "Describe what is shown in this image/photo/diagram" }
  ]
}

Include all expected fields. Use empty string for anything not found.`,
        },
      ];
    } else {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        {
          type: 'text',
          text: `This is a digital job card PDF for a ${oemConfig.name} warranty claim.

Extract the value for each field:
${fieldsJson}

Return ONLY a valid JSON array:
[
  { "fieldId": "exact_id", "name": "field name", "value": "extracted value" }
]

Include all fields. Use empty string for missing values.`,
        },
      ];
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content }],
    });

    let extractedFields = [];
    let extractedImages  = [];
    const responseText   = response.content[0].text;

    if (transcriptionMethod === 'vision') {
      try {
        const parsed = extractJson(responseText);
        extractedFields = parsed.fields  || [];
        extractedImages = parsed.images  || [];
      } catch {
        extractedFields = extractJson(responseText, true);
      }
    } else {
      extractedFields = extractJson(responseText, true);
    }

    if (R2_CONFIGURED) {
      await uploadToR2(`job-cards/${Date.now()}-${req.file.originalname}`, buffer, 'application/pdf');
    }

    const sessionId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO enrichment_sessions
        (id, oem_config_id, original_fields, enrichments, review_decisions, status,
         job_ref, machine, engineer, enriched_field_count, claim_status, extracted_images, transcription_method)
      VALUES (?, ?, ?, '[]', '{}', 'pending', ?, ?, ?, ?, 'draft', ?, ?)
    `).run(
      sessionId, oemConfigId, JSON.stringify(extractedFields),
      jobRef    || null,
      machine   || null,
      engineer  || null,
      extractedFields.length,
      'draft',
      JSON.stringify(extractedImages),
      transcriptionMethod,
    );

    res.json({ sessionId, fields: extractedFields, images: extractedImages, transcriptionMethod, oemConfig });
  } catch (err) {
    console.error('[Job Card Upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobcard/enrich/:sessionId  — enrich all fields using ALL OEM docs
app.post('/api/jobcard/enrich/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.prepare('SELECT * FROM enrichment_sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const oemRow    = db.prepare('SELECT * FROM oem_configs WHERE id = ?').get(session.oem_config_id);
    const oemConfig = parseRow(oemRow);

    const originalFields = JSON.parse(session.original_fields || '[]');

    // Build context from all OEM documents
    let docContext = buildOemContext(session.oem_config_id);

    // Fallback to structured policy rules if no documents
    if (!docContext && oemConfig.policy_rules.length) {
      docContext = oemConfig.policy_rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
    }

    const enrichments = [];

    for (const field of originalFields) {
      const fieldDef = oemConfig.job_card_fields.find(f => f.fieldId === field.fieldId) || {};

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `You are a warranty claim quality reviewer for ${oemConfig.name}.

Reference documents:
${docContext || 'No additional documents available.'}

Assess this job card field for policy compliance and completeness.
Field: ${field.name}
Description: ${fieldDef.description || 'N/A'}
Required: ${fieldDef.required ? 'Yes' : 'No'}
Current Value: "${field.value}"

If Historic Approved Claims are included above, match their tone, level of detail, and phrasing in your suggestion.

Return ONLY a JSON object:
{
  "suggestion": "best final value — improve if needed, keep if fine",
  "severity": "critical|warning|minor|ok",
  "reason": "one sentence explanation"
}`,
        }],
      });

      let enrichment;
      try   { enrichment = extractJson(response.content[0].text); }
      catch { enrichment = { suggestion: field.value, severity: 'ok', reason: 'Field assessed — no issues found.' }; }

      enrichments.push({ fieldId: field.fieldId, ...enrichment });
    }

    db.prepare('UPDATE enrichment_sessions SET enrichments = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(enrichments), 'enriched', sessionId);

    res.json({ enrichments });
  } catch (err) {
    console.error('[Enrich]', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// SESSIONS
// ────────────────────────────────────────────────────────────────────────────

// GET /api/session/:id
app.get('/api/session/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM enrichment_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const oemRow = db.prepare('SELECT id, name, brand FROM oem_configs WHERE id = ?').get(session.oem_config_id);

  res.json({
    ...session,
    original_fields:    JSON.parse(session.original_fields    || '[]'),
    enrichments:        JSON.parse(session.enrichments        || '[]'),
    review_decisions:   JSON.parse(session.review_decisions   || '{}'),
    extracted_images:   JSON.parse(session.extracted_images   || '[]'),
    oem_config: oemRow,
  });
});

// PUT /api/session/:id/review
app.put('/api/session/:id/review', (req, res) => {
  const session = db.prepare('SELECT * FROM enrichment_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { decisions } = req.body;
  if (!decisions) return res.status(400).json({ error: 'decisions required' });

  const existing = JSON.parse(session.review_decisions || '{}');
  const merged   = { ...existing, ...decisions };

  const enrichments = JSON.parse(session.enrichments || '[]');
  const needsReview = enrichments.filter(e => e.severity !== 'ok');
  const complete    = needsReview.every(e => merged[e.fieldId]);

  db.prepare('UPDATE enrichment_sessions SET review_decisions = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(merged), complete ? 'reviewed' : 'enriched', req.params.id);

  res.json({ decisions: merged, complete });
});

// ────────────────────────────────────────────────────────────────────────────
// CLAIM HISTORY
// ────────────────────────────────────────────────────────────────────────────

// GET /api/claims  — full claim history
app.get('/api/claims', (_req, res) => {
  const rows = db.prepare(`
    SELECT s.*, c.name AS oem_name, c.brand AS oem_brand
    FROM enrichment_sessions s
    LEFT JOIN oem_configs c ON c.id = s.oem_config_id
    ORDER BY s.created_at DESC
  `).all();

  res.json(rows.map(r => ({
    ...r,
    original_fields:   JSON.parse(r.original_fields   || '[]'),
    enrichments:       JSON.parse(r.enrichments       || '[]'),
    review_decisions:  JSON.parse(r.review_decisions  || '{}'),
    extracted_images:  JSON.parse(r.extracted_images  || '[]'),
  })));
});

// PUT /api/session/:id/export  — mark session as exported
app.put('/api/session/:id/export', (req, res) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE enrichment_sessions SET exported_at = ?, claim_status = ? WHERE id = ?')
    .run(now, 'exported', req.params.id);
  res.json({ ok: true, exported_at: now });
});

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

function resolveField(fieldId, originalFields, enrichments, decisions) {
  const field      = originalFields.find(f => f.fieldId === fieldId);
  if (!field) return '';
  const enrichment = enrichments.find(e => e.fieldId === fieldId);
  const decision   = decisions[fieldId];
  if (decision) {
    if (decision.action === 'accept') return enrichment?.suggestion ?? field.value;
    if (decision.action === 'edit')   return decision.value ?? '';
    return field.value;
  }
  if (enrichment?.severity === 'ok') return enrichment.suggestion ?? field.value;
  return field.value;
}

// GET /api/export/:id/txt
app.get('/api/export/:id/txt', (req, res) => {
  const session = db.prepare('SELECT * FROM enrichment_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const originalFields  = JSON.parse(session.original_fields   || '[]');
  const enrichments     = JSON.parse(session.enrichments       || '[]');
  const decisions       = JSON.parse(session.review_decisions  || '{}');
  const oemRow          = db.prepare('SELECT name, brand FROM oem_configs WHERE id = ?').get(session.oem_config_id);

  const lines = [
    '='.repeat(58),
    ' ENRICHED JOB CARD — WARRANTY ENRICHMENT ENGINE',
    '='.repeat(58),
    `Generated : ${new Date().toUTCString()}`,
    `OEM       : ${oemRow?.name || 'Unknown'}`,
    `Job Ref   : ${session.job_ref || '—'}`,
    `Machine   : ${session.machine || '—'}`,
    `Engineer  : ${session.engineer || '—'}`,
    `Session   : ${req.params.id}`,
    '',
    ...originalFields.flatMap(f => [
      `--- ${f.name.toUpperCase()} ---`,
      resolveField(f.fieldId, originalFields, enrichments, decisions) || '(no value)',
      '',
    ]),
  ];

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="enriched-job-card-${req.params.id.slice(0, 8)}.txt"`);
  res.send(lines.join('\n'));
});

// GET /api/export/:id/csv
app.get('/api/export/:id/csv', (req, res) => {
  const session = db.prepare('SELECT * FROM enrichment_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const originalFields = JSON.parse(session.original_fields   || '[]');
  const enrichments    = JSON.parse(session.enrichments       || '[]');
  const decisions      = JSON.parse(session.review_decisions  || '{}');
  const oemRow         = db.prepare('SELECT * FROM oem_configs WHERE id = ?').get(session.oem_config_id);
  const portalFields   = JSON.parse(oemRow?.portal_fields     || '[]');

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const headers = portalFields.map(f => esc(f.name || f.fieldId));
  const row     = portalFields.map(f => {
    let val = resolveField(f.fieldId, originalFields, enrichments, decisions);
    if (f.maxChars && val.length > f.maxChars) val = val.substring(0, f.maxChars);
    return esc(val);
  });

  const csv = [headers.join(','), row.join(',')].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="portal-export-${req.params.id.slice(0, 8)}.csv"`);
  res.send(csv);
});

// Catch-all: React app
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`[Server] Warranty Enrichment Engine running on port ${PORT}`);
});
