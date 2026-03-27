import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { buildDocxBuffer } from './generate-docx.js';
import { buildPdfBuffer } from './generate-pdf.js';
import jwt from 'jsonwebtoken';
import sgMail from '@sendgrid/mail';
import { readFileSync } from 'fs';
import { db } from './db.js';
import { requireAuth } from './auth-middleware.js';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { spawn } from 'child_process';
import { buildSafetyCultureDocx } from './generate-safetyculture-docx.js';
import { buildCustomerReportDocx } from './generate-customer-report-docx.js';
import { buildCatalystExportDocx } from './generate-catalyst-export-docx.js';
import { buildReportPdf } from './generate-report-pdf.js';
// archiver is CJS — load via createRequire
const archiver = createRequire(import.meta.url)('archiver');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

// ── Cloudflare R2 setup ────────────────────────────────────────────────────
// To set up R2:
// 1. Go to dash.cloudflare.com → R2 → Create bucket named 'machinerypilot-uploads'
// 2. Go to R2 → Manage R2 API tokens → Create token with Object Read & Write permissions
// 3. Copy Account ID from the R2 overview page
// 4. Add all credentials to .env and Railway environment variables
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
  console.log('[R2] Not configured — skipping original file storage');
}

async function uploadToR2(key, buffer, contentType) {
  if (!r2) return null;
  try {
    await r2.send(new PutObjectCommand({
      Bucket:      process.env.R2_BUCKET_NAME,
      Key:         key,
      Body:        buffer,
      ContentType: contentType,
    }));
    return key;
  } catch (err) {
    console.error('[R2] Upload failed:', err.message);
    return null;
  }
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// Log SendGrid config on startup (partial key only)
const sgKey   = process.env.SENDGRID_API_KEY  || '';
const sgFrom  = process.env.SENDGRID_FROM_EMAIL || '(not set)';
console.log(`[SendGrid] API key: ${sgKey ? sgKey.slice(0, 10) + '…' : '(not set)'} | From: ${sgFrom}`);

// Logo as base64 data URL for email embedding
const LOGO_PATH = '/Users/maxleorodeck/Desktop/Screenshot_2026-03-14_at_13_47_21.png';
let EMAIL_LOGO_SRC = '';
try {
  const logoBuf = readFileSync(LOGO_PATH);
  EMAIL_LOGO_SRC = `data:image/png;base64,${logoBuf.toString('base64')}`;
} catch { /* logo file not found — email will use text fallback */ }

// ── Polyfill globals that pdfjs-dist needs before it loads ──────────────────
// pdfjs-dist (legacy build) tries to require 'canvas' to polyfill these; since
// we use @napi-rs/canvas we supply them manually so rendering is not broken.
if (typeof global.Path2D === 'undefined') {
  global.Path2D = Path2D;
}
if (typeof global.DOMMatrix === 'undefined') {
  // Minimal DOMMatrix stub — covers all operations pdfjs-dist exercises
  global.DOMMatrix = class DOMMatrix {
    constructor(init) {
      const m = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      if (Array.isArray(init)) { init.forEach((v,i) => m[i] = v); }
      [this.m11,this.m12,this.m13,this.m14,
       this.m21,this.m22,this.m23,this.m24,
       this.m31,this.m32,this.m33,this.m34,
       this.m41,this.m42,this.m43,this.m44] = m;
      this.a=this.m11; this.b=this.m12; this.c=this.m21;
      this.d=this.m22; this.e=this.m41; this.f=this.m42;
      this.is2D=true; this.isIdentity=(m[0]===1&&m[5]===1&&m[10]===1&&m[15]===1);
    }
    multiply(o) {
      const a=this, b=o;
      return new global.DOMMatrix([
        a.m11*b.m11+a.m12*b.m21+a.m13*b.m31+a.m14*b.m41,
        a.m11*b.m12+a.m12*b.m22+a.m13*b.m32+a.m14*b.m42,
        a.m11*b.m13+a.m12*b.m23+a.m13*b.m33+a.m14*b.m43,
        a.m11*b.m14+a.m12*b.m24+a.m13*b.m34+a.m14*b.m44,
        a.m21*b.m11+a.m22*b.m21+a.m23*b.m31+a.m24*b.m41,
        a.m21*b.m12+a.m22*b.m22+a.m23*b.m32+a.m24*b.m42,
        a.m21*b.m13+a.m22*b.m23+a.m23*b.m33+a.m24*b.m43,
        a.m21*b.m14+a.m22*b.m24+a.m23*b.m34+a.m24*b.m44,
        a.m31*b.m11+a.m32*b.m21+a.m33*b.m31+a.m34*b.m41,
        a.m31*b.m12+a.m32*b.m22+a.m33*b.m32+a.m34*b.m42,
        a.m31*b.m13+a.m32*b.m23+a.m33*b.m33+a.m34*b.m43,
        a.m31*b.m14+a.m32*b.m24+a.m33*b.m34+a.m34*b.m44,
        a.m41*b.m11+a.m42*b.m21+a.m43*b.m31+a.m44*b.m41,
        a.m41*b.m12+a.m42*b.m22+a.m43*b.m32+a.m44*b.m42,
        a.m41*b.m13+a.m42*b.m23+a.m43*b.m33+a.m44*b.m43,
        a.m41*b.m14+a.m42*b.m24+a.m43*b.m34+a.m44*b.m44,
      ]);
    }
    translate(tx, ty, tz=0) {
      return this.multiply(new global.DOMMatrix([1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]));
    }
    scale(sx, sy=sx, sz=1, ox=0, oy=0, oz=0) {
      return this.translate(ox,oy,oz)
        .multiply(new global.DOMMatrix([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1]))
        .translate(-ox,-oy,-oz);
    }
    inverse() { return new global.DOMMatrix(); } // good-enough stub
    transformPoint(p) { return { x: p.x||0, y: p.y||0, z: p.z||0, w: p.w||1 }; }
    toFloat32Array() { return new Float32Array([this.m11,this.m12,this.m13,this.m14,this.m21,this.m22,this.m23,this.m24,this.m31,this.m32,this.m33,this.m34,this.m41,this.m42,this.m43,this.m44]); }
    toFloat64Array() { return new Float64Array([this.m11,this.m12,this.m13,this.m14,this.m21,this.m22,this.m23,this.m24,this.m31,this.m32,this.m33,this.m34,this.m41,this.m42,this.m43,this.m44]); }
    toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }
    static fromMatrix(o) { return new global.DOMMatrix(o.toFloat64Array()); }
    static fromFloat32Array(a) { return new global.DOMMatrix(Array.from(a)); }
    static fromFloat64Array(a) { return new global.DOMMatrix(Array.from(a)); }
  };
}

// pdfjs-dist legacy build — required for Node.js canvas rendering
const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = ''; // no web worker in Node.js

const app = express();

// In-memory progress store for sc-upload jobs
const uploadProgress = new Map();

// CORS — allow localhost in dev; add your production domain via ALLOWED_ORIGINS env var.
// e.g. ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (same-origin, curl, mobile)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin "${origin}" not allowed`));
  },
}));

app.use(express.json({ limit: '50mb' }));

// No size limits — raw binary must arrive unmodified.
// Set limits in a reverse-proxy (nginx/Caddy) instead when hosting.
const upload = multer({ storage: multer.memoryStorage() });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Render every page of a PDF to a base64 PNG at 300 DPI
// This is CRITICAL: sending PDFs as documents only extracts text, which strips
// hand-drawn circles (A/B/C status marks) and handwriting entirely.
// ---------------------------------------------------------------------------
async function pdfToImages(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const SCALE = 300 / 72; // PDF default is 72 DPI → scale to 300 DPI
  const images = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });

    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    images.push({
      base64:    canvas.toBuffer('image/png').toString('base64'),
      mediaType: 'image/png',
    });
  }

  return images;
}

// Detect image media type from magic bytes
function detectMediaType(buffer, fallback) {
  const sig = buffer.slice(0, 4).toString('hex');
  if (sig.startsWith('ffd8'))     return 'image/jpeg';
  if (sig.startsWith('89504e47')) return 'image/png';
  if (sig.startsWith('47494638')) return 'image/gif';
  if (sig.startsWith('52494646')) return 'image/webp';
  return fallback || 'image/jpeg';
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Enhance image before sending to Claude:
//   - 3× upscale  (makes small hand-drawn circles much larger)
//   - +30% contrast (makes faint ink stand out)
//   - +50% saturation (preserves colour of pen used for circles)
//   - sharpen kernel (crisps up edges of circle strokes)
//   - output as PNG (lossless — no re-compression artefacts)
// ---------------------------------------------------------------------------
async function enhanceImage(buffer) {
  const meta = await sharp(buffer).metadata();
  return sharp(buffer)
    .resize(meta.width * 3, meta.height * 3, { kernel: sharp.kernel.lanczos3 })
    .modulate({ saturation: 1.5 })        // +50% saturation
    .linear(1.3, -(128 * 0.3))            // contrast ×1.3 (equivalent to +30%)
    .sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Build image content blocks (reused across both API calls)
// ---------------------------------------------------------------------------
function imageBlocks(imageItems) {
  return imageItems.map(img => ({
    type:   'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
  }));
}

// ---------------------------------------------------------------------------
// POST /api/process  — two-pass extraction
//   Pass 1: literal visual description of circles (simple, direct)
//   Pass 2: structured JSON extraction using pass-1 result as grounding context
// ---------------------------------------------------------------------------
app.post('/api/process', requireAuth, upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // ── Size verification: write each received buffer to a temp file and
    //    compare against the size multer reports. They must match exactly.
    for (const file of files) {
      const tmpPath = path.join(
        os.tmpdir(),
        `mp-recv-${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`,
      );
      fs.writeFileSync(tmpPath, file.buffer);
      const diskSize = fs.statSync(tmpPath).size;
      const match    = diskSize === file.buffer.length ? '✓ MATCH' : '✗ MISMATCH';
      console.log(
        `[size-check] "${file.originalname}" | ` +
        `multer buffer: ${file.buffer.length} bytes | ` +
        `temp file on disk: ${diskSize} bytes | ${match}`,
      );
      console.log(`  → temp file: ${tmpPath}`);
    }

    // Collect image items — PDFs rendered to pages, images enhanced then passed through
    const imageItems = [];
    for (const file of files) {
      if (file.mimetype === 'application/pdf') {
        console.log(`Rendering PDF "${file.originalname}" to images at 300 DPI…`);
        const pages = await pdfToImages(file.buffer);
        console.log(`  → ${pages.length} page(s) — enhancing each…`);
        for (const page of pages) {
          const enhanced = await enhanceImage(Buffer.from(page.base64, 'base64'));
          imageItems.push({ base64: enhanced.toString('base64'), mediaType: 'image/png' });
        }
      } else {
        console.log(`Enhancing "${file.originalname}" (${file.buffer.length} bytes)…`);
        const enhanced = await enhanceImage(file.buffer);
        console.log(`  → enhanced size: ${enhanced.length} bytes`);
        imageItems.push({ base64: enhanced.toString('base64'), mediaType: 'image/png' });
      }
    }

    const isPdf = files.length === 1 && files[0].mimetype === 'application/pdf';
    const sourceDesc = isPdf
      ? 'You have been given a PDF inspection report.'
      : `You have been given ${imageItems.length} photo${imageItems.length > 1 ? 's' : ''} of a physical inspection form. Examine them in order.`;

    const imgBlocks = imageBlocks(imageItems);

    // ── Pass 1: literal circle detection ────────────────────────────────────
    console.log(`Pass 1: literal circle detection (${imageItems.length} image(s))…`);
    const pass1Response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role:    'user',
        content: [
          ...imgBlocks,
          {
            type: 'text',
            text: `This is a machinery inspection form. Each row has A / B / C printed. The engineer circled exactly ONE letter per row.

For each row, examine all three letters individually:
- Does A have a circle/oval/enclosure around it?
- Does B have a circle/oval/enclosure around it?
- Does C have a circle/oval/enclosure around it?

Rules:
- Only ONE letter per row should be circled
- If you think you see circles on multiple letters, pick the CLEAREST one
- B circles look the same as A and C circles - do not skip B rows
- If genuinely none circled, output 'none'

Output: row name -> A or B or C or none | comment`,
          },
        ],
      }],
    });

    const preAnalysis = pass1Response.content[0].text;
    console.log('Pass 1 result:\n', preAnalysis);

    // ── Pass 2: structured JSON extraction using pass-1 as grounding ────────
    console.log('Pass 2: structured JSON extraction…');
    const pass2Response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role:    'user',
        content: [
          ...imgBlocks,
          {
            type: 'text',
            text: `${sourceDesc}

Based on this visual analysis of the form:
${preAnalysis}

Now extract all items as JSON using these statuses from the analysis above.

Also read the header section for: engineer name, serial number, engine serial number, date, machine hours, customer name (often handwritten in coloured ink).

Return ONLY valid JSON, no markdown:

{
  "reportTitle": "document title or 'Machinery Inspection Report'",
  "engineer": "engineer name or ''",
  "serialNo": "serial number or ''",
  "engineSerialNo": "engine serial number or ''",
  "date": "date or ''",
  "machineHours": "machine hours or ''",
  "customerName": "customer name or ''",
  "items": [
    {
      "id": "item_1",
      "number": 1,
      "name": "item name",
      "category": "section heading from the form or ''",
      "status": "A|B|C|na",
      "comment": "any handwritten notes for this item or ''"
    }
  ]
}

Rules:
- Use the circled letters from the visual analysis above for each item's status
- If a row had no circle detected, use "na"
- Capture all handwritten notes verbatim in the comment field
- Preserve item order from the form
- Return ONLY the JSON object, nothing else`,
          },
        ],
      }],
    });

    const rawText = pass2Response.content[0].text;

    // Extract JSON — handles ```json fences or bare object
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const bareMatch  = rawText.match(/(\{[\s\S]*\})/);
    const jsonStr    = fenceMatch ? fenceMatch[1] : bareMatch ? bareMatch[1] : null;

    if (!jsonStr) {
      return res.status(500).json({ error: 'Claude did not return parseable JSON', raw: rawText });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      return res.status(500).json({ error: 'Failed to parse Claude response as JSON', raw: rawText });
    }

    // ── Upload original files to R2 ─────────────────────────────────────────
    // Use a temporary ID (timestamp) as the folder; the frontend will pass
    // these keys back when saving the report so we can store them.
    const r2Keys = [];
    if (R2_CONFIGURED) {
      const tmpId = `tmp-${Date.now()}`;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isPdfFile = file.mimetype === 'application/pdf';
        const ext = isPdfFile ? 'pdf' : (file.originalname.match(/\.[^.]+$/) || ['.jpg'])[0];
        const key = isPdfFile
          ? `uploads/${tmpId}/original.pdf`
          : `uploads/${tmpId}/photo-${i}${ext}`;
        const uploaded = await uploadToR2(key, file.buffer, file.mimetype);
        if (uploaded) r2Keys.push(uploaded);
      }
    }

    res.json({ ...parsed, _r2Keys: r2Keys });
  } catch (err) {
    console.error('Error processing request:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/download/docx  — generate and return a .docx file
// ---------------------------------------------------------------------------
app.post('/api/download/docx', requireAuth, async (req, res) => {
  try {
    const { report, items } = req.body;
    if (!report || !items) return res.status(400).json({ error: 'Missing report or items' });
    const buf = await buildDocxBuffer(report, items);
    const filename = (report.title || 'Inspection-Report').replace(/\s+/g, '-') + '.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('DOCX error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/download/pdf  — generate and return a .pdf file
// ---------------------------------------------------------------------------
app.post('/api/download/pdf', requireAuth, async (req, res) => {
  try {
    const { report, items } = req.body;
    if (!report || !items) return res.status(400).json({ error: 'Missing report or items' });
    const buf = await buildPdfBuffer(report, items);
    const filename = (report.title || 'Inspection-Report').replace(/\s+/g, '-') + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Auth routes ────────────────────────────────────────────────────────────
app.post('/api/auth/request-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    // Clean up any existing codes for this email
    db.prepare('DELETE FROM auth_codes WHERE email = ?').run(email.toLowerCase());
    // Generate 4-digit code
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    db.prepare('INSERT INTO auth_codes (email, code, expiresAt) VALUES (?, ?, ?)').run(email.toLowerCase(), code, expiresAt);

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
        <div style="background:#1A1A1A;padding:16px 24px;border-bottom:3px solid #F4C542;margin-bottom:24px;">
          <span style="font-family:Arial,sans-serif;font-weight:900;font-size:22px;letter-spacing:2px;color:#F4C542">Machinery Pilot</span>
        </div>
        <p style="font-size:14px;color:#444;margin:0 0 16px;">Your MachineryPilot login code is:</p>
        <div style="font-size:48px;font-weight:900;letter-spacing:12px;color:#1A1A1A;margin:0 0 24px;text-align:center;border:2px solid #CCCCCC;padding:16px;">${code}</div>
        <p style="font-size:12px;color:#888;margin:0;">Expires in 10 minutes. Do not share this code.</p>
      </div>`;

    try {
      await sgMail.send({
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com',
        subject: 'Your MachineryPilot login code',
        text: `Your MachineryPilot login code is: ${code}\n\nExpires in 10 minutes.\nDo not share this code.`,
        html: htmlBody,
      });
    } catch (sgErr) {
      console.error('[SendGrid] Send failed:');
      console.error('  message:', sgErr.message);
      if (sgErr.response) {
        console.error('  status:', sgErr.response.status);
        console.error('  body:', JSON.stringify(sgErr.response.body, null, 2));
      }
      // Always log code to console so login still works during debugging
      console.log(`[DEV] Login code for ${email}: ${code}`);
    }

    res.json({ ok: true, message: 'Code sent' });
  } catch (err) {
    console.error('request-code error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/verify-code', (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
    const row = db.prepare('SELECT * FROM auth_codes WHERE email = ? AND code = ?').get(email.toLowerCase(), code);
    if (!row) return res.status(401).json({ error: 'Invalid code' });
    if (Date.now() > row.expiresAt) {
      db.prepare('DELETE FROM auth_codes WHERE email = ?').run(email.toLowerCase());
      return res.status(401).json({ error: 'Code expired' });
    }
    db.prepare('DELETE FROM auth_codes WHERE email = ?').run(email.toLowerCase());
    const token = jwt.sign({ email: email.toLowerCase() }, process.env.JWT_SECRET || 'mp-dev-secret', { expiresIn: '7d' });
    res.json({ token, email: email.toLowerCase() });
  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Report CRUD ────────────────────────────────────────────────────────────
app.get('/api/reports', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT id, title, machineRef, serialNo, engineSerialNo, date, machineHours, customerName, engineer, status, originalFiles, createdAt, updatedAt FROM reports ORDER BY updatedAt DESC').all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reports', requireAuth, (req, res) => {
  try {
    const { title, machineRef, serialNo, engineSerialNo, date, machineHours, customerName, engineer, status, reportJson, originalFiles } = req.body;
    const result = db.prepare(`
      INSERT INTO reports (title, machineRef, serialNo, engineSerialNo, date, machineHours, customerName, engineer, status, reportJson, originalFiles)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title||'Untitled', machineRef||'', serialNo||'', engineSerialNo||'', date||'', machineHours||'', customerName||'', engineer||'', status||'Open', JSON.stringify(reportJson||{}), JSON.stringify(originalFiles||[]));
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/:id', requireAuth, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/reports/:id', requireAuth, (req, res) => {
  try {
    const { title, machineRef, serialNo, engineSerialNo, date, machineHours, customerName, engineer, status, reportJson, originalFiles } = req.body;
    // Only overwrite originalFiles if explicitly provided
    const existing = db.prepare('SELECT originalFiles FROM reports WHERE id = ?').get(req.params.id);
    const filesJson = originalFiles !== undefined
      ? JSON.stringify(originalFiles)
      : (existing?.originalFiles || '[]');
    db.prepare(`
      UPDATE reports SET title=?, machineRef=?, serialNo=?, engineSerialNo=?, date=?, machineHours=?, customerName=?, engineer=?, status=?, reportJson=?, originalFiles=?, updatedAt=datetime('now')
      WHERE id=?
    `).run(title||'Untitled', machineRef||'', serialNo||'', engineSerialNo||'', date||'', machineHours||'', customerName||'', engineer||'', status||'Open', JSON.stringify(reportJson||{}), filesJson, req.params.id);
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/reports/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Original file download URLs ─────────────────────────────────────────────
app.get('/api/reports/:id/originals', requireAuth, async (req, res) => {
  try {
    const row = db.prepare('SELECT originalFiles FROM reports WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const keys = JSON.parse(row.originalFiles || '[]');
    if (!R2_CONFIGURED || keys.length === 0) return res.json({ urls: [] });
    const urls = await Promise.all(keys.map(key =>
      getSignedUrl(r2, new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key:    key,
      }), { expiresIn: 3600 })
    ));
    res.json({ urls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SafetyCulture pipeline ──────────────────────────────────────────────────
// POST /api/process-safetyculture
// Accepts a SafetyCulture inspection PDF, extracts machine details + flagged
// items via Claude vision, extracts photos via PyMuPDF, generates a Catalyst
// quote .docx, packages everything into a ZIP, and uploads to R2.
// ---------------------------------------------------------------------------
app.post('/api/process-safetyculture', requireAuth, upload.single('file'), async (req, res) => {
  const ts            = Date.now();
  const tmpPath       = path.join(os.tmpdir(), `sc-${ts}.pdf`);
  const tmpSummaryPdf = path.join(os.tmpdir(), `sc-summary-${ts}.pdf`);
  const tmpPhotosDir  = path.join(os.tmpdir(), `sc-photos-${ts}`);

  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'A PDF file is required' });

    // ── 1. Save PDF to temp file (Python subprocess needs a path) ─────────────
    fs.writeFileSync(tmpPath, file.buffer);

    // ── 2. Extract text from all pages (Pass 1 — no images sent to Claude) ──────
    console.log('[SafetyCulture] Extracting PDF text…');
    const pdfText = await new Promise((resolve, reject) => {
      const py = spawn('python3', [path.join(__dirname, 'safetyculture_text.py'), tmpPath]);
      let stdout = '', stderr = '';
      py.stdout.on('data', d => stdout += d);
      py.stderr.on('data', d => stderr += d);
      py.on('close', code => {
        if (code !== 0) return reject(new Error(`Text extraction failed: ${stderr}`));
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Text output not JSON')); }
      });
    });
    if (pdfText.error) throw new Error(pdfText.error);
    console.log(`[SafetyCulture] Extracted text from ${pdfText.page_count} pages`);

    // ── 3. Claude extraction (text-only — no images) ───────────────────────────
    console.log('[SafetyCulture] Calling Claude for structured extraction…');
    const claudeRes = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role:    'user',
        content: `The following is the full text content of a SafetyCulture machinery inspection report, extracted page by page. Extract all information and return ONLY a valid JSON object — no preamble, no markdown fences, no explanation.

Schema:
{
  "machine": {
    "type": "machine model/type e.g. Edge S18",
    "serial": "machine serial number",
    "hours": "machine hours reading",
    "inspection_date": "date of inspection",
    "engineer": "inspector/engineer name",
    "site": "site name where inspection occurred",
    "inspection_title": "full inspection title",
    "score": "score e.g. 153/164",
    "flagged_count": <integer total flagged items>
  },
  "flagged_items": [
    {
      "item_name": "inspection item name",
      "section": "category or section heading",
      "status": "C-Urgent OR B-Next-Service",
      "finding": "engineer's finding note/description",
      "photo_numbers": [<integer sequential photo numbers associated with this item>]
    }
  ],
  "additional_findings": [
    {
      "number": <integer>,
      "finding": "free text finding",
      "photo_numbers": [<integer sequential photo numbers>]
    }
  ]
}

Rules:
- Only include items with status C-Urgent or B-Next-Service in flagged_items
- Completely ignore A-Satisfactory and N/A items
- photo_numbers are the sequential photo/media numbers printed in the PDF for each item (e.g. "14" or "Photo 14" next to an item means include 14)
- If no photo numbers are associated with an item, use []
- Return ONLY the raw JSON object

PDF TEXT CONTENT:
${pdfText.text}`,
      }],
    });

    const rawText  = claudeRes.content[0].text;
    const fence    = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const bare     = rawText.match(/(\{[\s\S]*\})/s);
    const jsonStr  = fence ? fence[1] : bare ? bare[1] : null;
    if (!jsonStr) return res.status(500).json({ error: 'Claude did not return parseable JSON', raw: rawText.slice(0, 600) });

    let extracted;
    try { extracted = JSON.parse(jsonStr); }
    catch { return res.status(500).json({ error: 'Failed to parse Claude JSON', raw: rawText.slice(0, 600) }); }

    const { machine, flagged_items = [], additional_findings = [] } = extracted;
    if (!machine || (!machine.serial && !machine.type)) {
      return res.status(422).json({ error: 'Could not identify machine details — is this a SafetyCulture inspection PDF?' });
    }

    // ── 4. Build names used for files and ZIP root ─────────────────────────────
    function sanitizeName(str, maxLen = 40) {
      return (str || '')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/[\s-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, maxLen) || 'Item';
    }

    const mType   = sanitizeName(machine.type   || 'Machine', 20);
    const mSer    = sanitizeName(machine.serial  || 'Unknown', 20);
    const mDate   = (machine.inspection_date || '').replace(/[^0-9]/g, '').substring(0, 8) || 'NoDate';
    const rootDir = `${mType}_${mSer}_${mDate}`;

    const urgentItems      = flagged_items.filter(i => i.status === 'C-Urgent');
    const nextServiceItems = flagged_items.filter(i => i.status === 'B-Next-Service');

    // ── 5. Generate Catalyst entry sheet DOCX ────────────────────────────────
    console.log('[SafetyCulture] Generating Catalyst entry sheet…');
    const catalystBuf      = await buildSafetyCultureDocx(machine, flagged_items, additional_findings);
    const catalystFilename = 'Catalyst_Entry_Sheet.docx';

    // ── 5b. Generate customer report DOCX ────────────────────────────────────
    console.log('[SafetyCulture] Generating customer report…');
    const customerBuf = await buildCustomerReportDocx(machine, flagged_items, additional_findings);

    // ── 6. Extract flagged-items summary pages as a PDF ────────────────────────
    console.log('[SafetyCulture] Extracting flagged-items summary pages…');
    await new Promise((resolve, reject) => {
      const py = spawn('python3', [
        path.join(__dirname, 'safetyculture_summary_pdf.py'),
        tmpPath,
        tmpSummaryPdf,
      ], { env: process.env });
      let stdout = '', stderr = '';
      py.stdout.on('data', d => stdout += d);
      py.stderr.on('data', d => { stderr += d; process.stdout.write(d); });
      py.on('close', code => {
        if (code !== 0) return reject(new Error(`Summary PDF script exited ${code}: ${stderr.slice(0, 300)}`));
        try {
          const out = JSON.parse(stdout);
          if (out.error) return reject(new Error(out.error));
          console.log(`[SafetyCulture] Summary PDF: ${out.pages} page(s) → ${out.output}`);
          resolve(out);
        } catch {
          reject(new Error(`Summary PDF output not JSON: ${stdout.slice(0, 200)}`));
        }
      });
    });

    // ── 6b. Extract individual photos (text-rich PDFs only) ──────────────────
    // Detect text-rich PDF: avg > 100 chars per page means real text layer.
    const avgCharsPerPage = pdfText.text.length / (pdfText.page_count || 1);
    const isTextRich = avgCharsPerPage > 100;
    let extractedPhotos = [];

    const itemsWithPhotos = flagged_items.filter(i => (i.photo_numbers || []).length > 0);
    if (isTextRich && itemsWithPhotos.length > 0) {
      console.log(`[SafetyCulture] Text-rich PDF (avg ${avgCharsPerPage.toFixed(0)} chars/page) — extracting individual photos…`);
      try {
        extractedPhotos = await new Promise((resolve, reject) => {
          const py = spawn('python3', [
            path.join(__dirname, 'safetyculture_photos.py'),
            tmpPath,
            JSON.stringify(flagged_items),
            tmpPhotosDir,
          ], { env: process.env });
          let stdout = '', stderr = '';
          py.stdout.on('data', d => stdout += d);
          py.stderr.on('data', d => { stderr += d; process.stdout.write(d); });
          py.on('close', code => {
            if (code !== 0) return reject(new Error(`Photo extraction exited ${code}: ${stderr.slice(0, 300)}`));
            try { resolve(JSON.parse(stdout)); }
            catch { reject(new Error(`Photo output not JSON: ${stdout.slice(0, 200)}`)); }
          });
        });
        console.log(`[SafetyCulture] Extracted ${extractedPhotos.length} photo(s)`);
      } catch (pyErr) {
        console.error('[SafetyCulture] Photo extraction failed (continuing without photos):', pyErr.message);
        extractedPhotos = [];
      }
    } else {
      console.log(`[SafetyCulture] Scanned/image PDF (avg ${avgCharsPerPage.toFixed(0)} chars/page) — skipping photo extraction`);
    }

    // ── 7. Build ZIP ───────────────────────────────────────────────────────────
    console.log('[SafetyCulture] Building ZIP…');
    const zipBuf = await new Promise((resolve, reject) => {
      const arc    = archiver('zip', { zlib: { level: 6 } });
      const chunks = [];
      arc.on('data',  d => chunks.push(d));
      arc.on('end',   ()  => resolve(Buffer.concat(chunks)));
      arc.on('error', reject);
      arc.append(catalystBuf, { name: `${rootDir}/${catalystFilename}` });
      arc.append(customerBuf, { name: `${rootDir}/Customer_Report.docx` });
      arc.file(tmpSummaryPdf, { name: `${rootDir}/Flagged_Items_Summary.pdf` });
      for (const photo of extractedPhotos) {
        arc.file(photo.path, { name: `${rootDir}/Photos/${photo.subfolder}/${photo.filename}` });
      }
      arc.finalize();
    });
    console.log(`[SafetyCulture] ZIP size: ${(zipBuf.length / 1024).toFixed(0)} KB`);

    // ── 8. Upload to R2 ───────────────────────────────────────────────────────
    const zipKey  = `safetyculture/${rootDir}_${ts}.zip`;
    const pdfKey  = `safetyculture/originals/${rootDir}_original.pdf`;
    let downloadUrl = null;
    if (R2_CONFIGURED) {
      const uploadedZip = await uploadToR2(zipKey, zipBuf, 'application/zip');
      if (uploadedZip) {
        downloadUrl = await getSignedUrl(r2, new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key:    zipKey,
        }), { expiresIn: 3600 });
        console.log(`[SafetyCulture] Uploaded ZIP to R2: ${zipKey}`);
      }
      await uploadToR2(pdfKey, file.buffer, 'application/pdf');
      console.log(`[SafetyCulture] Uploaded original PDF to R2: ${pdfKey}`);
    } else {
      console.log('[SafetyCulture] R2 not configured — files not stored remotely');
    }

    // ── 9. Log to SQLite ───────────────────────────────────────────────────────
    db.prepare(`
      INSERT INTO safetyculture_jobs (machineSerial, machineName, flaggedCount, photoCount, outputKey, originalPdfKey)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(machine.serial || '', machine.type || '', flagged_items.length, extractedPhotos.length, zipKey, pdfKey);

    // ── 10. Return result ──────────────────────────────────────────────────────
    res.json({
      ok:               true,
      machine,
      urgentCount:      urgentItems.length,
      nextServiceCount: nextServiceItems.length,
      additionalCount:  additional_findings.length,
      photoCount:       extractedPhotos.length,
      downloadUrl,
      zipKey,
    });

  } catch (err) {
    console.error('[SafetyCulture] Error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
    try { fs.unlinkSync(tmpSummaryPdf); } catch { /* may not exist */ }
    try { fs.rmSync(tmpPhotosDir, { recursive: true, force: true }); } catch { /* may not exist */ }
  }
});

// GET /api/safetyculture-jobs — list all jobs with signed download URLs
app.get('/api/safetyculture-jobs', requireAuth, async (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM safetyculture_jobs ORDER BY createdAt DESC').all();
    const jobs = await Promise.all(rows.map(async row => {
      let zipUrl = null;
      let pdfUrl = null;
      if (R2_CONFIGURED) {
        if (row.outputKey) {
          try {
            zipUrl = await getSignedUrl(r2, new GetObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME, Key: row.outputKey,
            }), { expiresIn: 3600 });
          } catch { /* key may no longer exist */ }
        }
        if (row.originalPdfKey) {
          try {
            pdfUrl = await getSignedUrl(r2, new GetObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME, Key: row.originalPdfKey,
            }), { expiresIn: 3600 });
          } catch { /* key may no longer exist */ }
        }
      }
      return { ...row, zipUrl, pdfUrl };
    }));
    res.json(jobs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SC Report Viewer API ────────────────────────────────────────────────────

// Shared helper: generate signed URL for an R2 key (returns null if not configured)
async function signedUrl(key) {
  if (!r2 || !key) return null;
  try {
    return await getSignedUrl(r2, new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key:    key,
    }), { expiresIn: 3600 });
  } catch { return null; }
}

// Attach signed photo URLs and parsed rotations to an item row
async function attachPhotoUrls(item) {
  const keys = JSON.parse(item.photoKeys || '[]');
  const signedUrls = await Promise.all(keys.map(k => signedUrl(k)));
  const photos = keys.map((r2Key, i) => ({
    signedUrl: signedUrls[i],
    r2Key,
    filename: r2Key.split('/').pop(),
  }));
  const photoRotations = JSON.parse(item.photoRotations || '{}');
  return { ...item, photos, photoRotations };
}

// ---------------------------------------------------------------------------
// GET /api/sc-photos/download — proxy download to avoid browser CORS on R2
// ---------------------------------------------------------------------------
app.get('/api/sc-photos/download', requireAuth, async (req, res) => {
  const { key, filename } = req.query;
  if (!key || !filename) return res.status(400).json({ error: 'Missing key or filename' });
  try {
    console.log('[Download] R2 endpoint:', `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    console.log('[Download] Fetching key:', key);
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    const object = await r2.send(command);
    const chunks = [];
    for await (const chunk of object.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', object.ContentType || 'image/jpeg');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[Download] GetObject failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Background processor for sc-upload jobs
// ---------------------------------------------------------------------------
async function runScUpload(jobId, file) {
  const ts        = Date.now();
  const tmpPath   = path.join(os.tmpdir(), `sc-up-${ts}.pdf`);
  const tmpPhotos = path.join(os.tmpdir(), `sc-up-photos-${ts}`);

  function setProgress(progress, message) {
    uploadProgress.set(jobId, { status: 'processing', progress, message, reportId: null, error: null });
  }

  try {
    fs.writeFileSync(tmpPath, file.buffer);

    // ── 1. Extract text (20%) ────────────────────────────────────────────────
    setProgress(20, 'Extracting text…');
    const pdfText = await new Promise((resolve, reject) => {
      const py = spawn('python3', [path.join(__dirname, 'safetyculture_text.py'), tmpPath]);
      let out = '', err = '';
      py.stdout.on('data', d => out += d);
      py.stderr.on('data', d => err += d);
      py.on('close', code => {
        if (code !== 0) return reject(new Error(`Text extraction failed: ${err}`));
        try { resolve(JSON.parse(out)); } catch { reject(new Error('Text output not JSON')); }
      });
    });
    if (pdfText.error) throw new Error(pdfText.error);

    // ── 2. Claude — extract ALL items (40%) ─────────────────────────────────
    setProgress(40, 'Analysing flagged items…');
    const claudeRes = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{ role: 'user', content:
`Extract all inspection items from this SafetyCulture machinery inspection report. Return ONLY a valid JSON object — no preamble, no markdown.

Schema:
{
  "machine": {
    "type": "machine model/type",
    "serial": "machine serial number",
    "hours": "machine hours",
    "inspection_date": "date of inspection",
    "engineer": "inspector name",
    "site": "site name",
    "inspection_title": "full title",
    "score": "score e.g. 157/164",
    "flagged_count": <integer>
  },
  "items": [
    {
      "item_name": "exact item name from report",
      "section": "section heading e.g. General, Hydraulic System, Feeder Conveyor",
      "status": "status must be exactly one of: C-Urgent attention, B-Due next Service, A-Satisfactory, N/A",
      "finding": "engineer's finding note, empty string if none",
      "action_note": "the 'To do' or recommended action text for this item, empty string if none",
      "photo_numbers": [<integer photo numbers directly associated with this item>]
    }
  ]
}

Rules:
- Include ALL items regardless of status
- status must be exactly one of: C-Urgent attention, B-Due next Service, A-Satisfactory, N/A
- photo_numbers: integer numbers from "Photo N" text directly under or next to the item
- Most A-Satisfactory items will have photo_numbers: []
- action_note: extract any recommended action, "To do" text, or service instruction following a flagged item; empty string for A-Satisfactory/N/A
- Preserve section groupings exactly as in the report
- Return ONLY the raw JSON object

PDF TEXT:
${pdfText.text}` }],
    });

    const raw     = claudeRes.content[0].text;
    const fence   = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const bare    = raw.match(/(\{[\s\S]*\})/s);
    const jsonStr = fence ? fence[1] : bare ? bare[1] : null;
    if (!jsonStr) throw new Error('Claude did not return JSON');

    let extracted;
    try { extracted = JSON.parse(jsonStr); }
    catch { throw new Error('Failed to parse Claude JSON'); }

    const { machine = {}, items = [] } = extracted;
    if (!machine.serial && !machine.type) {
      throw new Error('Could not identify machine — is this a SafetyCulture PDF?');
    }

    // ── 3. Extract photos (60%) ──────────────────────────────────────────────
    setProgress(60, 'Extracting photos…');
    const avgChars = pdfText.text.length / (pdfText.page_count || 1);
    let extractedPhotos = [];
    if (avgChars > 100) {
      extractedPhotos = await new Promise((resolve, reject) => {
        const py = spawn('python3', [
          path.join(__dirname, 'safetyculture_extract_photos.py'),
          tmpPath,
          tmpPhotos,
        ], { env: process.env });
        let out = '', err = '';
        py.stdout.on('data', d => out += d);
        py.stderr.on('data', d => { err += d; process.stdout.write(d); });
        py.on('close', code => {
          if (code !== 0) return reject(new Error(`Photo extraction failed: ${err.slice(0, 300)}`));
          try { resolve(JSON.parse(out)); }
          catch { reject(new Error(`Photo output not JSON: ${out.slice(0, 200)}`)); }
        });
      }).catch(e => { console.error('[sc-upload] Photo extraction error (continuing):', e.message); return []; });
    }

    // ── 4. Save to database (80%) ────────────────────────────────────────────
    setProgress(80, 'Saving to database…');
    const flaggedCount = items.filter(i => i.status === 'C-Urgent' || i.status === 'B-Next-Service').length;
    const row = db.prepare(`
      INSERT INTO sc_reports (machineType, machineSerial, machineHours, inspectionDate,
        engineer, site, score, flaggedCount, totalItems, pdfKey)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
    `).run(
      machine.type || '', machine.serial || '', machine.hours || '',
      machine.inspection_date || '', machine.engineer || '', machine.site || '',
      machine.score || '', flaggedCount, items.length,
    );
    const reportId = row.lastInsertRowid;

    const pdfKey = `sc-reports/${reportId}/original.pdf`;
    await uploadToR2(pdfKey, file.buffer, 'application/pdf');
    db.prepare('UPDATE sc_reports SET pdfKey = ? WHERE id = ?').run(pdfKey, reportId);

    const photoNameMap = {};
    for (const item of items) {
      const sanitized = (item.item_name || 'Photo')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 60);
      (item.photo_numbers || []).forEach((num, idx) => {
        if (!photoNameMap[num]) {
          const ext = 'jpeg';
          photoNameMap[num] = `sc-photos/${reportId}/0/${sanitized}_${idx + 1}.${ext}`;
        }
      });
    }
    for (const photo of extractedPhotos) {
      const ext = photo.ext || 'jpeg';
      const key = photoNameMap[photo.photo_number]
        || `sc-photos/${reportId}/0/${photo.photo_number}.${ext}`;
      const buf = fs.readFileSync(photo.path);
      const mt  = ext === 'png' ? 'image/png' : 'image/jpeg';
      await uploadToR2(key, buf, mt);
      if (!photoNameMap[photo.photo_number]) photoNameMap[photo.photo_number] = key;
    }

    const insertItem = db.prepare(`
      INSERT INTO sc_items (reportId, itemName, section, status, finding, photoKeys, actionNotes, comments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      const photoKeys = (item.photo_numbers || [])
        .map(n => photoNameMap[n])
        .filter(Boolean);
      insertItem.run(
        reportId,
        item.item_name   || '',
        item.section     || '',
        item.status      || '',
        item.finding     || '',
        JSON.stringify(photoKeys),
        item.action_note || '',
        item.finding     || '',
      );
    }

    console.log(`[sc-upload] Report ${reportId} stored — ${items.length} items, ${extractedPhotos.length} photos`);

    // ── Complete (100%) ──────────────────────────────────────────────────────
    uploadProgress.set(jobId, { status: 'complete', progress: 100, message: 'Complete', reportId, error: null });

  } catch (err) {
    console.error('[sc-upload] Error:', err);
    uploadProgress.set(jobId, { status: 'error', progress: 0, message: 'Error', reportId: null, error: err.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { }
    try { fs.rmSync(tmpPhotos, { recursive: true, force: true }); } catch { }
  }
}

// ---------------------------------------------------------------------------
// GET /api/sc-upload/progress/:jobId — poll upload processing status
// ---------------------------------------------------------------------------
app.get('/api/sc-upload/progress/:jobId', requireAuth, (req, res) => {
  const prog = uploadProgress.get(req.params.jobId);
  if (!prog) return res.status(404).json({ error: 'Job not found' });
  res.json(prog);
});

// ---------------------------------------------------------------------------
// POST /api/sc-upload — process a SafetyCulture PDF, store in DB + R2
// ---------------------------------------------------------------------------
app.post('/api/sc-upload', requireAuth, upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  if (file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'PDF required' });

  const jobId = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  uploadProgress.set(jobId, { status: 'processing', progress: 0, message: 'Extracting text…', reportId: null, error: null });
  res.json({ jobId });
  runScUpload(jobId, file).catch(() => {});
});

// ---------------------------------------------------------------------------
// GET /api/sc-reports — list all reports
// ---------------------------------------------------------------------------
app.get('/api/sc-reports', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM sc_reports ORDER BY createdAt DESC').all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/sc-reports/:id — full report with items and signed photo URLs
// ---------------------------------------------------------------------------
app.get('/api/sc-reports/:id', requireAuth, async (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM sc_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Not found' });

    const items = db.prepare('SELECT * FROM sc_items WHERE reportId = ? ORDER BY id').all(req.params.id);
    const itemsWithUrls = await Promise.all(items.map(attachPhotoUrls));

    const pdfUrl = await signedUrl(report.pdfKey);
    res.json({ report: { ...report, pdfUrl }, items: itemsWithUrls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// DELETE /api/sc-reports/:id
// ---------------------------------------------------------------------------
app.delete('/api/sc-reports/:id', requireAuth, async (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM sc_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Not found' });

    // Collect all R2 keys belonging to this report
    const items  = db.prepare('SELECT photoKeys FROM sc_items WHERE reportId = ?').all(req.params.id);
    const keys   = [report.pdfKey];
    for (const item of items) {
      try { keys.push(...JSON.parse(item.photoKeys || '[]')); } catch { }
    }

    // Delete from R2 (best-effort, don't fail if key missing)
    if (r2) {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await Promise.all(keys.filter(Boolean).map(k =>
        r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: k })).catch(() => {})
      ));
    }

    db.prepare('DELETE FROM sc_items   WHERE reportId = ?').run(req.params.id);
    db.prepare('DELETE FROM sc_reports WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// PATCH /api/sc-reports/:id — update editable report fields
// ---------------------------------------------------------------------------
app.patch('/api/sc-reports/:id', requireAuth, (req, res) => {
  try {
    const { engineer, site, machineHours, score, reportStatus, machineType, machineSerial, inspectionDate } = req.body;
    db.prepare(`
      UPDATE sc_reports
      SET engineer       = COALESCE(?, engineer),
          site           = COALESCE(?, site),
          machineHours   = COALESCE(?, machineHours),
          score          = COALESCE(?, score),
          reportStatus   = COALESCE(?, reportStatus),
          machineType    = COALESCE(?, machineType),
          machineSerial  = COALESCE(?, machineSerial),
          inspectionDate = COALESCE(?, inspectionDate)
      WHERE id = ?
    `).run(
      engineer       !== undefined ? engineer       : null,
      site           !== undefined ? site           : null,
      machineHours   !== undefined ? machineHours   : null,
      score          !== undefined ? score          : null,
      reportStatus   !== undefined ? reportStatus   : null,
      machineType    !== undefined ? machineType    : null,
      machineSerial  !== undefined ? machineSerial  : null,
      inspectionDate !== undefined ? inspectionDate : null,
      req.params.id,
    );
    const report = db.prepare('SELECT * FROM sc_reports WHERE id = ?').get(req.params.id);
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/sc-reports/:id/download-pdf — customer-facing PDF
// ---------------------------------------------------------------------------
app.post('/api/sc-reports/:id/download-pdf', requireAuth, async (req, res) => {
  const { itemIds } = req.body;

  try {
    const report = db.prepare('SELECT * FROM sc_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const items = [];
    for (const itemId of (itemIds || [])) {
      const item = db.prepare('SELECT * FROM sc_items WHERE id = ? AND reportId = ?').get(itemId, req.params.id);
      if (item) items.push(item);
    }

    // Fetch photo buffers for each item
    const photoBuffersMap = {};
    if (r2) {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      for (const item of items) {
        const keys = JSON.parse(item.photoKeys || '[]');
        const bufs = [];
        for (const key of keys) {
          try {
            const obj = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
            const chunks = [];
            for await (const chunk of obj.Body) chunks.push(chunk);
            bufs.push(Buffer.concat(chunks));
          } catch { bufs.push(null); }
        }
        photoBuffersMap[item.id] = bufs;
      }
    }

    // Build logo buffer from the base64 data URL loaded at startup
    const logoBuffer = EMAIL_LOGO_SRC
      ? Buffer.from(EMAIL_LOGO_SRC.split(',')[1], 'base64')
      : null;

    // Compute live counts for the PDF header
    const allReportItems = db.prepare('SELECT * FROM sc_items WHERE reportId = ?').all(req.params.id);
    const flaggedCount = allReportItems.filter(i => i.status && (i.status.startsWith('C-Urgent') || i.status.startsWith('B-Due') || i.status.startsWith('B-Next'))).length;
    const actionsCount = allReportItems.filter(i => i.actionNotes && i.actionNotes.trim()).length;

    const pdfBuf = await buildReportPdf(report, items, photoBuffersMap, logoBuffer, flaggedCount, actionsCount);

    const safeType   = (report.machineType   || 'Report').replace(/[^a-zA-Z0-9]/g, '_');
    const safeSerial = (report.machineSerial || '').replace(/[^a-zA-Z0-9]/g, '_');
    const today      = new Date().toISOString().slice(0, 10);
    const filename   = `Report_${safeType}_${safeSerial}_${today}.pdf`.replace(/_+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuf);
  } catch (err) {
    console.error('[download-pdf] Error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sc-reports/:id/download-photos — ZIP photos from visible items
// ---------------------------------------------------------------------------
app.post('/api/sc-reports/:id/download-photos', requireAuth, async (req, res) => {
  const { itemIds } = req.body;
  if (!itemIds || !itemIds.length) return res.status(400).json({ error: 'No item IDs provided' });

  try {
    const report = db.prepare('SELECT id FROM sc_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Collect all photo keys for the requested items
    const allPhotoKeys = [];
    for (const itemId of itemIds) {
      const item = db.prepare('SELECT photoKeys FROM sc_items WHERE id = ? AND reportId = ?')
        .get(itemId, req.params.id);
      if (item) {
        const keys = JSON.parse(item.photoKeys || '[]');
        allPhotoKeys.push(...keys);
      }
    }

    if (allPhotoKeys.length === 0) {
      return res.status(404).json({ error: 'No photos found for selected items' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="photos-report-${req.params.id}.zip"`);

    const arc = archiver('zip', { zlib: { level: 6 } });
    arc.pipe(res);

    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    for (const key of allPhotoKeys) {
      try {
        const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
        const obj = await r2.send(cmd);
        const filename = key.split('/').pop();
        arc.append(obj.Body, { name: filename });
      } catch (e) {
        console.error('[download-photos] Failed to fetch key:', key, e.message);
      }
    }

    await arc.finalize();
  } catch (err) {
    console.error('[download-photos] Error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/sc-items/:id/photos/:photoIndex/rotate — save rotation metadata
// ---------------------------------------------------------------------------
app.patch('/api/sc-items/:id/photos/:photoIndex/rotate', requireAuth, (req, res) => {
  try {
    const { rotation } = req.body; // 0, 90, 180, 270
    const item = db.prepare('SELECT photoRotations FROM sc_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const rotations = JSON.parse(item.photoRotations || '{}');
    rotations[req.params.photoIndex] = rotation;
    db.prepare('UPDATE sc_items SET photoRotations = ? WHERE id = ?')
      .run(JSON.stringify(rotations), req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// DELETE /api/sc-items/:id/photos/:photoIndex — delete a single photo
// ---------------------------------------------------------------------------
app.delete('/api/sc-items/:id/photos/:photoIndex', requireAuth, async (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM sc_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const idx  = parseInt(req.params.photoIndex);
    const keys = JSON.parse(item.photoKeys || '[]');
    if (idx < 0 || idx >= keys.length) return res.status(400).json({ error: 'Invalid photo index' });

    const keyToDelete = keys[idx];
    if (r2 && keyToDelete) {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: keyToDelete })).catch(() => {});
    }

    const newKeys = keys.filter((_, i) => i !== idx);

    // Shift rotation indices down past the deleted slot
    const rotations = JSON.parse(item.photoRotations || '{}');
    const newRotations = {};
    Object.entries(rotations).forEach(([k, v]) => {
      const ki = parseInt(k);
      if (ki < idx) newRotations[ki] = v;
      else if (ki > idx) newRotations[ki - 1] = v;
    });

    db.prepare('UPDATE sc_items SET photoKeys = ?, photoRotations = ? WHERE id = ?')
      .run(JSON.stringify(newKeys), JSON.stringify(newRotations), item.id);

    const signedUrls = await Promise.all(newKeys.map(k => signedUrl(k)));
    const photos = newKeys.map((r2Key, i) => ({ signedUrl: signedUrls[i], r2Key, filename: r2Key.split('/').pop() }));
    res.json({ ok: true, photos, photoRotations: newRotations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/sc-reports/:id/export-catalyst — ZIP: DOCX + photos
// ---------------------------------------------------------------------------
function buildCatalystCsv(report, items) {
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
  function csvRow(cells) {
    return cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',');
  }
  const lines = [];
  lines.push(csvRow(['Description']));
  lines.push(csvRow(['Field', 'Value']));
  for (const [field, label] of FIELD_MAP) {
    const val = report[field];
    if (val != null && String(val).trim()) {
      lines.push(csvRow([label, String(val).trim()]));
    }
  }
  lines.push('');
  lines.push(csvRow(['Estimate Items']));
  lines.push(csvRow(['Item', 'Comment', 'Action']));
  for (const item of items) {
    const comment = (item.comments    || '').trim();
    const action  = (item.actionNotes || '').trim();
    if (!comment && !action) continue;
    lines.push(csvRow([item.itemName || 'Item', comment, action]));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
app.post('/api/sc-reports/:id/export-catalyst', requireAuth, async (req, res) => {
  const { itemIds } = req.body;
  if (!itemIds || !itemIds.length) return res.status(400).json({ error: 'No item IDs provided' });

  try {
    const report = db.prepare('SELECT * FROM sc_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const items = [];
    for (const itemId of itemIds) {
      const item = db.prepare('SELECT * FROM sc_items WHERE id = ? AND reportId = ?').get(itemId, req.params.id);
      if (item) items.push(item);
    }

    const docxBuf = await buildCatalystExportDocx(report, items);

    const siteName   = report.site || report.machineType || 'Site';
    const safeSite   = siteName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const todayDate  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const zipBase    = `Catalyst_Import_${safeSite}_${todayDate}`;
    const folderName = zipBase;
    const docxName   = `${zipBase}.docx`;
    const zipName    = `${zipBase}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const arc = archiver('zip', { zlib: { level: 6 } });
    arc.pipe(res);

    arc.append(docxBuf, { name: `${folderName}/${docxName}` });

    const csvContent = buildCatalystCsv(report, items);
    arc.append(Buffer.from(csvContent, 'utf-8'), { name: `${folderName}/${zipBase}.csv` });

    if (r2) {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      for (const item of items) {
        const keys = JSON.parse(item.photoKeys || '[]');
        for (const key of keys) {
          try {
            const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
            const obj = await r2.send(cmd);
            arc.append(obj.Body, { name: `${folderName}/${key.split('/').pop()}` });
          } catch (e) {
            console.error('[export-catalyst] Failed to fetch key:', key, e.message);
          }
        }
      }
    }

    await arc.finalize();
  } catch (err) {
    console.error('[export-catalyst] Error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/sc-items/:id — update actionNotes, comments, customerRequestedEstimate
// ---------------------------------------------------------------------------
app.patch('/api/sc-items/:id', requireAuth, (req, res) => {
  try {
    const { actionNotes, comments, customerRequestedEstimate, status } = req.body;
    db.prepare(`
      UPDATE sc_items
      SET actionNotes = COALESCE(?, actionNotes),
          comments    = COALESCE(?, comments),
          customerRequestedEstimate = COALESCE(?, customerRequestedEstimate),
          status      = COALESCE(?, status)
      WHERE id = ?
    `).run(
      actionNotes               !== undefined ? actionNotes               : null,
      comments                  !== undefined ? comments                  : null,
      customerRequestedEstimate !== undefined ? Number(customerRequestedEstimate) : null,
      status                    !== undefined ? status                    : null,
      req.params.id,
    );
    const item = db.prepare('SELECT * FROM sc_items WHERE id = ?').get(req.params.id);

    // Auto-update report status to Customer Approved if all C-Urgent and B-Due items have customerRequestedEstimate
    if (customerRequestedEstimate !== undefined && item) {
      const allItems     = db.prepare('SELECT * FROM sc_items WHERE reportId = ?').all(item.reportId);
      const flaggedItems = allItems.filter(i => i.status && (
        i.status.startsWith('C-Urgent') || i.status.startsWith('B-Due') || i.status.startsWith('B-Next')
      ));
      if (flaggedItems.length > 0 && flaggedItems.every(i => i.customerRequestedEstimate)) {
        db.prepare(`UPDATE sc_reports SET reportStatus = 'Customer Approved' WHERE id = ?`).run(item.reportId);
      }
    }

    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/sc-items/:id/photos — add a photo to an existing item
// ---------------------------------------------------------------------------
app.post('/api/sc-items/:id/photos', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const item = db.prepare('SELECT * FROM sc_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const existingKeys = JSON.parse(item.photoKeys || '[]');

    const sanitizedName = (item.itemName || 'Photo')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 60);

    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpeg';
    const seq = existingKeys.length + 1;
    const key = `sc-photos/${item.reportId}/${item.id}/${sanitizedName}_${seq}.${ext}`;

    await uploadToR2(key, req.file.buffer, req.file.mimetype);

    const allKeys = [...existingKeys, key];
    db.prepare('UPDATE sc_items SET photoKeys = ? WHERE id = ?')
      .run(JSON.stringify(allKeys), req.params.id);

    const signedUrls = await Promise.all(allKeys.map(k => signedUrl(k)));
    const photos = allKeys.map((r2Key, i) => ({ signedUrl: signedUrls[i], r2Key, filename: r2Key.split('/').pop() }));
    res.json({ ok: true, photos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Production: serve frontend static files ─────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MachineryPilot backend running on http://localhost:${PORT}`));
