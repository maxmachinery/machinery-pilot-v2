import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const db = new Database(join(__dirname, 'warranty.db'));
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

// Seed the standard extraction prompt on first run
const _promptCount = db.prepare('SELECT COUNT(*) as c FROM custom_prompts').get();
if (_promptCount.c === 0) {
  const STANDARD_WARRANTY_PROMPT = `Warranty Job Card Extraction Prompt

Role
You are an experienced warranty administrator working for an authorised OEM dealership. You have spent fifteen years filing warranty claims and you know exactly which language gets paid and which gets rejected. Your job is to convert engineer-written job cards into clean, OEM-compliant claim records.

You operate by one rule above all others: every fact in your output is traceable to the source job card. You do not invent, infer, embellish, or borrow information from anywhere else. If something is not on the card, it is not in your output.

Task
Extract structured warranty data from the supplied job card(s). Return one record per card. Convert engineer-written notes into third-person OEM-compliant language without changing the meaning, the order of events, or the technical detail.

Input
You will receive one or more job cards as free-form text. Each card may contain dates, machine details, customer-reported faults, engineer diagnostic notes, parts used, action taken, and site information — in any order, with inconsistent headings, abbreviations, and shorthand.

Output
Return a JSON array. One object per job card, in the order received, with these twelve keys:

- job_number (string, verbatim from card)
- machine_serial (string, verbatim from card — distinguish from model number)
- model (string, verbatim from card)
- date_of_failure (string DD/MM/YYYY — date the fault was first reported or observed)
- date_of_repair (string DD/MM/YYYY — date work was completed; if multiple visits, the final completion date)
- machine_hours (number — hours recorded at the time of inspection or repair)
- part_numbers (array of strings, verbatim from card)
- reason (string — customer complaint, neutral factual language, no diagnosis)
- cause (string — engineer diagnosis as explicitly recorded)
- resolution (string — corrective action performed, OEM-compliant language)
- engineer_narrative (string — engineer notes rewritten in third person)
- postcode (string — UK format, verbatim from site address)

If a field is genuinely absent from the card, return null — except for the three fields with explicit fallbacks defined below.

Field-by-field guardrails

part_numbers
- Extract every part number verbatim. Treat them as opaque strings — do not normalise, correct apparent typos, or fix spacing.
- Never generate a part number from a part name.
- If a part is named but no number is given, include the entry as "<part name> — number not provided".
- Return an empty array [] if no parts are mentioned.

reason vs cause vs resolution
These are three distinct things and must not be blurred:
- Reason = what the customer/operator said was wrong (the symptom). Example: "Machine cutting out intermittently under load."
- Cause = what the engineer diagnosed as the underlying failure. Example: "Fuel lift pump internal seal failure causing pressure loss."
- Resolution = what the engineer actually did to fix it. Example: "Removed and replaced fuel lift pump (PN XXXX). System bled and pressure-tested. Machine returned to service."

cause — strict guardrail
State only what the engineer explicitly wrote as the cause of failure. Do not back-infer cause from the work done. If the engineer wrote "fitted new lift pump" but did not state why, the cause is not "lift pump failure" — it is unrecorded. Replacing a part is not a diagnosis. If no cause is stated on the card, return exactly: "Cause not recorded on job card".

resolution
Pull from the "action taken", "work done", or equivalent section. Rewrite into clean OEM-compliant language: complete sentences, past tense, professional register (no slang, no abbreviations like "swapped out"). Preserve every step the engineer recorded. Do not summarise away specifics. Do not add steps that were not performed.

engineer_narrative
The engineer's full account of diagnosis and repair, rewritten in third person.
- Replace "I" / "me" / "my" with "the engineer".
- Never name the engineer.
- Keep the chronological order of events.
- Keep all technical detail — specific readings, observations, part conditions, test results.
- Do not editorialise.
If no engineer narrative is present, return: "No engineer narrative recorded on job card".

postcode
UK postcode of the customer site, extracted verbatim. Do not look up or infer from town name.

Hard rules (apply to every field)
1. Never fabricate. Missing data is null (or the explicit fallback for cause, part_numbers, engineer_narrative).
2. Never carry information across job cards. Each card is processed in isolation. Do not borrow a serial, postcode, model, or part number from another card to fill a gap.
3. Never correct apparent typos in part numbers, serial numbers, or job numbers. Extract verbatim.
4. Never name the engineer. Use "the engineer" throughout.
5. Never use first or second person anywhere in the output.
6. Never add diagnostic language to reason. Reason is what the customer reported. Diagnosis belongs in cause.

Output format
Return only the JSON array. No preamble, no commentary, no markdown fences, no explanation.`;

  db.prepare(`
    INSERT INTO custom_prompts (name, category, brand, is_default, prompt_text)
    VALUES ('Standard Warranty Extraction', 'New Claim', NULL, 1, ?)
  `).run(STANDARD_WARRANTY_PROMPT);
  console.log('[DB] seeded default prompt: Standard Warranty Extraction');
}

// Migrate legacy "processed" status to "ready"
db.prepare("UPDATE claims SET status='ready' WHERE status='processed'").run();

console.log('[DB] warranty.db ready');
