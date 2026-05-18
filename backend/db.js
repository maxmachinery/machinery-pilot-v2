import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath   = process.env.DB_PATH || join(__dirname, 'warranty.db');
const seedPath = join(__dirname, 'seed', 'warranty.seed.db');

// First-boot seed: if running in production with an empty volume
// and a seed file exists in the repo, copy it once.
if (process.env.DB_PATH && !fs.existsSync(dbPath) && fs.existsSync(seedPath)) {
  console.log('[DB] First boot detected — seeding from', seedPath);
  fs.mkdirSync(dirname(dbPath), { recursive: true });
  fs.copyFileSync(seedPath, dbPath);
  console.log('[DB] Seed copy complete');
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ── Core tables ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS oem_configs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    brand            TEXT,
    policy_rules     TEXT DEFAULT '[]',
    portal_fields    TEXT DEFAULT '[]',
    job_card_fields  TEXT DEFAULT '[]',
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS oem_machines (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    oem_config_id   INTEGER NOT NULL,
    machine_model   TEXT    NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (oem_config_id) REFERENCES oem_configs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS oem_documents (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    oem_config_id     INTEGER NOT NULL,
    machine_id        INTEGER,
    doc_type          TEXT NOT NULL,
    filename          TEXT,
    r2_key            TEXT,
    extracted_content TEXT,
    uploaded_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (oem_config_id) REFERENCES oem_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (machine_id)    REFERENCES oem_machines(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS enrichment_sessions (
    id                   TEXT PRIMARY KEY,
    oem_config_id        INTEGER,
    machine_id           INTEGER,
    original_fields      TEXT DEFAULT '[]',
    enrichments          TEXT DEFAULT '[]',
    review_decisions     TEXT DEFAULT '{}',
    status               TEXT DEFAULT 'pending',
    created_at           TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (oem_config_id) REFERENCES oem_configs(id),
    FOREIGN KEY (machine_id)    REFERENCES oem_machines(id)
  );
`);

// ── Safe migrations (idempotent) ──────────────────────────────────────────
const addCol = (table, col, type, def) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}${def !== undefined ? ` DEFAULT ${def}` : ''}`);
  } catch (e) {
    if (!e.message.includes('duplicate column name')) throw e;
  }
};

// enrichment_sessions extras
addCol('enrichment_sessions', 'job_ref',              'TEXT',    null);
addCol('enrichment_sessions', 'machine',              'TEXT',    null);
addCol('enrichment_sessions', 'engineer',             'TEXT',    null);
addCol('enrichment_sessions', 'exported_at',          'TEXT',    null);
addCol('enrichment_sessions', 'enriched_field_count', 'INTEGER', 0);
addCol('enrichment_sessions', 'claim_status',         'TEXT',    "'draft'");
addCol('enrichment_sessions', 'extracted_images',     'TEXT',    "'[]'");
addCol('enrichment_sessions', 'transcription_method', 'TEXT',    "'text'");
addCol('enrichment_sessions', 'machine_id',           'INTEGER', null);

// oem_documents machine_id (in case existing rows)
addCol('oem_documents', 'machine_id', 'INTEGER', null);

// repair date on enrichment sessions
addCol('enrichment_sessions', 'repair_date', 'TEXT', null);

// ── Claims table (new 3-step direct workflow) ─────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS claims (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    oem_config_id      INTEGER,
    oem_name           TEXT,
    uploaded_documents TEXT    DEFAULT '[]',
    prompt             TEXT,
    ai_model           TEXT,
    ai_raw_response    TEXT,
    portal_output      TEXT    DEFAULT '{}',
    status             TEXT    DEFAULT 'processed',
    repair_date        DATE,
    created_at         DATETIME DEFAULT (datetime('now'))
  );
`);

// ── Custom Prompts table ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_prompts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    brand       TEXT,
    is_default  INTEGER DEFAULT 0,
    prompt_text TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

addCol('claims', 'custom_prompt_id', 'INTEGER', null);
addCol('claims', 'updated_at',       'DATETIME', null);

// ── One-time cleanup: remove Altendorf rows added during De Groot rebranding ─
db.prepare("DELETE FROM oem_configs WHERE lower(name) = 'altendorf'").run();

// ── Assistant queries table ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS assistant_queries (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    query_type            TEXT,
    brand                 TEXT,
    doc_ids               TEXT,
    question_or_prompt_id TEXT,
    raw_response          TEXT,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Rename legacy seed name and restore as default
db.prepare("UPDATE custom_prompts SET name='Warranty Job Card Extraction Prompt', is_default=1 WHERE name='Standard Warranty Extraction'").run();
// Ensure only the canonical global default has is_default=1 (clear others for same category+no brand)
const _canonical = db.prepare("SELECT id FROM custom_prompts WHERE name='Warranty Job Card Extraction Prompt' AND brand IS NULL").get();
if (_canonical) {
  db.prepare("UPDATE custom_prompts SET is_default=0 WHERE brand IS NULL AND category='New Claim' AND id != ?").run(_canonical.id);
}

const NEW_EXTRACTION_PROMPT = `Warranty Job Card Extraction — Extraction Strategy

Role
You are an experienced warranty administrator working for an authorised OEM dealership. You have spent fifteen years filing warranty claims and you know exactly which language gets paid and which gets rejected. Your job is to convert engineer-written job cards into clean, OEM-compliant claim records.

You operate by one rule above all others: every fact in your output is traceable to the source job card. You do not invent, infer, embellish, or borrow information from anywhere else. If something is not on the card, it is absent from your output.

Extraction strategy

Customer complaint (reason / description)
Extract the symptom as the customer or operator reported it. Neutral factual language. No diagnosis. Example: "Machine cutting out intermittently under load."

Engineer diagnosis (cause / suspect cause)
State only what the engineer explicitly wrote as the cause of failure. Do not back-infer cause from the work done. If the engineer wrote "fitted new lift pump" but did not state why, the cause is not "lift pump failure" — it is unrecorded. If no cause is stated, use: "Cause not recorded on job card."

Corrective action (resolution / action taken)
Pull from the "action taken", "work done", or equivalent section. Rewrite into clean OEM-compliant language: complete sentences, past tense, professional register. No slang, no abbreviations. Preserve every step the engineer recorded.

Engineer narrative
The engineer's full account rewritten in third person. Replace "I" / "me" / "my" with "the engineer". Never name the engineer. Keep chronological order and all technical detail.

Part numbers
Extract verbatim. Do not normalise, correct typos, or fix spacing. Never generate a part number from a part name. If a part is named but no number given: "<part name> — number not provided".

Dates
Extract dates exactly as written. For date of failure use the date the fault was first reported or observed. For date of repair use the date work was completed; if multiple visits, the final completion date.

Machine hours
Extract the hours recorded at the time of inspection or repair.

Site / postcode
UK postcode of the customer site, extracted verbatim. Do not look up or infer from town name.

Hard rules
1. Never fabricate. Missing data is absent or null.
2. Never carry information across job cards. Each card is processed in isolation.
3. Never correct apparent typos in part numbers, serial numbers, or job numbers. Extract verbatim.
4. Never name the engineer. Use "the engineer" throughout.
5. Never use first or second person in your output.
6. Replacing a part is not a diagnosis. Only record cause if the engineer explicitly stated it.

Output structure will be enforced by the system based on the target OEM portal.`;

// Seed the standard extraction prompt on first run
const _promptCount = db.prepare('SELECT COUNT(*) as c FROM custom_prompts').get();
if (_promptCount.c === 0) {
  db.prepare(`
    INSERT INTO custom_prompts (name, category, brand, is_default, prompt_text)
    VALUES ('Warranty Job Card Extraction Prompt', 'New Claim', NULL, 1, ?)
  `).run(NEW_EXTRACTION_PROMPT);
  console.log('[DB] seeded default prompt: Warranty Job Card Extraction Prompt');
} else {
  // Update existing canonical prompt to new schema-agnostic text
  const _existing = db.prepare("SELECT id FROM custom_prompts WHERE name='Warranty Job Card Extraction Prompt' AND brand IS NULL").get();
  if (_existing) {
    db.prepare("UPDATE custom_prompts SET prompt_text=?, updated_at=datetime('now') WHERE id=?")
      .run(NEW_EXTRACTION_PROMPT, _existing.id);
    console.log('[DB] updated canonical prompt to schema-agnostic extraction strategy');
  }
}

// Seed Portal Definition Generator prompt (only if not already present)
const _portalDefExists = db.prepare("SELECT id FROM custom_prompts WHERE name='Portal Definition Generator'").get();
if (!_portalDefExists) {
  const PORTAL_DEF_PROMPT = `You will receive a screenshot of an OEM warranty portal claim form. Your job is to identify every input field visible in the portal and return a structured definition.

For each field, identify:
- fieldId: a snake_case identifier (e.g. "customer_name", "serial_no", "repair_date")
- name: the human-readable label as shown in the portal
- section: which section of the portal it belongs to (e.g. "Details", "Customer Info", "Dates")
- required: true if the portal marks it as required (asterisk or similar), else false
- type: "text" | "date" | "number" | "textarea"

Do not invent fields. Only include fields actually visible in the screenshot. Ignore navigation elements, buttons, and non-input UI.

Use the define_portal_fields tool to return the field list.`;

  db.prepare(`
    INSERT INTO custom_prompts (name, category, brand, is_default, prompt_text)
    VALUES ('Portal Definition Generator', 'Portal Definition', NULL, 1, ?)
  `).run(PORTAL_DEF_PROMPT);
  console.log('[DB] seeded Portal Definition Generator prompt');
}

// Migrate legacy "processed" status to "ready"
db.prepare("UPDATE claims SET status='ready' WHERE status='processed'").run();

// ── Telemetry ──────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS telemetry_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp    TEXT    NOT NULL,
    user_id      TEXT    NOT NULL,
    session_id   TEXT,
    event_type   TEXT    NOT NULL,
    event_data   TEXT,
    page_hostname TEXT,
    page_url     TEXT,
    user_agent   TEXT,
    ip_address   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_telemetry_user      ON telemetry_events(user_id);
  CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_events(event_type);
`);

console.log('[DB] warranty.db ready');
