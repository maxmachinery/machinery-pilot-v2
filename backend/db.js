import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const db = new Database(join(__dirname, 'warranty.db'));

db.pragma('journal_mode = WAL');

// ── Core tables ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS oem_configs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    brand           TEXT,
    policy_rules    TEXT DEFAULT '[]',
    portal_fields   TEXT DEFAULT '[]',
    job_card_fields TEXT DEFAULT '[]',
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS oem_documents (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    oem_config_id    INTEGER NOT NULL,
    doc_type         TEXT NOT NULL,
    filename         TEXT,
    r2_key           TEXT,
    extracted_content TEXT,
    uploaded_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (oem_config_id) REFERENCES oem_configs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS enrichment_sessions (
    id                   TEXT PRIMARY KEY,
    oem_config_id        INTEGER,
    original_fields      TEXT DEFAULT '[]',
    enrichments          TEXT DEFAULT '[]',
    review_decisions     TEXT DEFAULT '{}',
    status               TEXT DEFAULT 'pending',
    created_at           TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (oem_config_id) REFERENCES oem_configs(id)
  );
`);

// ── Migrate: add columns to enrichment_sessions if missing ────────────────
const addCol = (col, type, def) => {
  try {
    db.exec(`ALTER TABLE enrichment_sessions ADD COLUMN ${col} ${type}${def !== undefined ? ` DEFAULT ${def}` : ''}`);
  } catch (e) {
    if (!e.message.includes('duplicate column name')) throw e;
  }
};
addCol('job_ref',               'TEXT',    null);
addCol('machine',               'TEXT',    null);
addCol('engineer',              'TEXT',    null);
addCol('exported_at',           'TEXT',    null);
addCol('enriched_field_count',  'INTEGER', 0);
addCol('claim_status',          'TEXT',    "'draft'");
addCol('extracted_images',      'TEXT',    "'[]'");
addCol('transcription_method',  'TEXT',    "'text'");

console.log('[DB] warranty.db ready');
