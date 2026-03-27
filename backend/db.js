import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const db = new Database(join(__dirname, 'warranty.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS oem_configs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    brand       TEXT,
    policy_rules   TEXT DEFAULT '[]',
    portal_fields  TEXT DEFAULT '[]',
    job_card_fields TEXT DEFAULT '[]',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrichment_sessions (
    id              TEXT PRIMARY KEY,
    oem_config_id   INTEGER,
    original_fields TEXT DEFAULT '[]',
    enrichments     TEXT DEFAULT '[]',
    review_decisions TEXT DEFAULT '{}',
    status          TEXT DEFAULT 'pending',
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (oem_config_id) REFERENCES oem_configs(id)
  );
`);

console.log('[DB] warranty.db ready');
