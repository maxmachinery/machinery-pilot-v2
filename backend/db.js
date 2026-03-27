import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Migrate existing DBs — add originalFiles column if missing
try {
  db.exec(`ALTER TABLE reports ADD COLUMN originalFiles TEXT DEFAULT '[]'`);
} catch { /* column already exists */ }

// Migrate: add safetyculture_jobs table if missing
db.exec(`
  CREATE TABLE IF NOT EXISTS safetyculture_jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    machineSerial   TEXT DEFAULT '',
    machineName     TEXT DEFAULT '',
    flaggedCount    INTEGER DEFAULT 0,
    photoCount      INTEGER DEFAULT 0,
    outputKey       TEXT DEFAULT '',
    originalPdfKey  TEXT DEFAULT '',
    createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrate existing safetyculture_jobs rows — add originalPdfKey if missing
try {
  db.exec(`ALTER TABLE safetyculture_jobs ADD COLUMN originalPdfKey TEXT DEFAULT ''`);
} catch { /* column already exists */ }

// Migrate sc_items — add photoRotations if missing
try {
  db.exec(`ALTER TABLE sc_items ADD COLUMN photoRotations TEXT DEFAULT '{}'`);
} catch { /* column already exists */ }

// Migrate sc_reports — add reportStatus if missing
try {
  db.exec(`ALTER TABLE sc_reports ADD COLUMN reportStatus TEXT DEFAULT 'Open'`);
} catch { /* column already exists */ }

// Migrate sc_items — add customerRequestedEstimate if missing
try {
  db.exec(`ALTER TABLE sc_items ADD COLUMN customerRequestedEstimate INTEGER DEFAULT 0`);
} catch { /* column already exists */ }

// ── SafetyCulture report viewer tables ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sc_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    machineType     TEXT DEFAULT '',
    machineSerial   TEXT DEFAULT '',
    machineHours    TEXT DEFAULT '',
    inspectionDate  TEXT DEFAULT '',
    engineer        TEXT DEFAULT '',
    site            TEXT DEFAULT '',
    score           TEXT DEFAULT '',
    flaggedCount    INTEGER DEFAULT 0,
    totalItems      INTEGER DEFAULT 0,
    pdfKey          TEXT DEFAULT '',
    createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sc_items (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    reportId            INTEGER NOT NULL,
    itemName            TEXT DEFAULT '',
    section             TEXT DEFAULT '',
    status              TEXT DEFAULT '',
    finding             TEXT DEFAULT '',
    photoKeys           TEXT DEFAULT '[]',
    actionNotes         TEXT DEFAULT '',
    comments            TEXT DEFAULT '',
    approvedByCustomer  INTEGER DEFAULT 0
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL DEFAULT 'Untitled Report',
    machineRef     TEXT    DEFAULT '',
    serialNo       TEXT    DEFAULT '',
    engineSerialNo TEXT    DEFAULT '',
    date           TEXT    DEFAULT '',
    machineHours   TEXT    DEFAULT '',
    customerName   TEXT    DEFAULT '',
    engineer       TEXT    DEFAULT '',
    status         TEXT    NOT NULL DEFAULT 'Open',
    reportJson     TEXT    NOT NULL DEFAULT '{}',
    originalFiles  TEXT    DEFAULT '[]',
    createdAt      TEXT    NOT NULL DEFAULT (datetime('now')),
    updatedAt      TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS auth_codes (
    email     TEXT    NOT NULL,
    code      TEXT    NOT NULL,
    expiresAt INTEGER NOT NULL
  );
`);
