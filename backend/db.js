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

console.log('[DB] warranty.db ready');
