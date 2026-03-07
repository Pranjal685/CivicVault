/**
 * Database Layer — Persistent relational storage for multi-case management.
 *
 * Uses better-sqlite3 for synchronous, fast SQLite operations.
 * Database stored at: app.getPath('userData')/civicvault.db
 */

const path = require('path');
const crypto = require('crypto');

let db = null;

/**
 * Initialize the database. Must be called after app.whenReady().
 * @param {string} userDataPath - app.getPath('userData')
 */
function initDatabase(userDataPath) {
    if (db) return db;

    const Database = require('better-sqlite3');
    const dbPath = path.join(userDataPath, 'civicvault.db');

    db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');

    // ── Create tables ────────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS cases (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            created_at  DATETIME DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS documents (
            id          TEXT PRIMARY KEY,
            case_id     TEXT NOT NULL,
            filename    TEXT NOT NULL,
            file_hash   TEXT,
            uploaded_at DATETIME DEFAULT (datetime('now')),
            num_pages   INTEGER DEFAULT 0,
            num_chunks  INTEGER DEFAULT 0,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS audit_ledger (
            id              TEXT PRIMARY KEY,
            case_id         TEXT NOT NULL,
            action_type     TEXT NOT NULL,
            details         TEXT,
            timestamp       DATETIME DEFAULT (datetime('now')),
            previous_hash   TEXT NOT NULL,
            current_hash    TEXT NOT NULL,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );
    `);

    console.log(`[CivicVault DB] SQLite initialized at: ${dbPath}`);
    return db;
}

// ── CRUD: Cases ──────────────────────────────────────────────────────

/**
 * Create a new case.
 * @param {string} name
 * @returns {{ id: string, name: string, created_at: string }}
 */
function createCase(name) {
    const id = crypto.randomUUID();
    const stmt = db.prepare('INSERT INTO cases (id, name) VALUES (?, ?)');
    stmt.run(id, name);

    return db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
}

/**
 * Get all cases, ordered by most recent first.
 * Includes document count for each case.
 * @returns {Array<{ id, name, created_at, doc_count }>}
 */
function getAllCases() {
    return db.prepare(`
        SELECT c.*, COUNT(d.id) as doc_count
        FROM cases c
        LEFT JOIN documents d ON d.case_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `).all();
}

/**
 * Get a single case by ID.
 * @param {string} caseId
 */
function getCase(caseId) {
    return db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
}

// ── CRUD: Documents ──────────────────────────────────────────────────

/**
 * Add a document record linked to a case.
 * @param {string} caseId
 * @param {string} filename
 * @param {string} hash - SHA-256 file hash
 * @param {number} numPages
 * @param {number} numChunks
 * @returns {{ id, case_id, filename, file_hash, uploaded_at }}
 */
function addDocument(caseId, filename, hash, numPages = 0, numChunks = 0) {
    const id = crypto.randomUUID();
    const stmt = db.prepare(
        'INSERT INTO documents (id, case_id, filename, file_hash, num_pages, num_chunks) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(id, caseId, filename, hash, numPages, numChunks);

    return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
}

/**
 * Get all documents for a specific case.
 * @param {string} caseId
 * @returns {Array<{ id, case_id, filename, file_hash, uploaded_at, num_pages, num_chunks }>}
 */
function getDocumentsByCase(caseId) {
    return db.prepare(
        'SELECT * FROM documents WHERE case_id = ? ORDER BY uploaded_at DESC'
    ).all(caseId);
}

// ══ Chain-of-Custody: Audit Ledger ═══════════════════════════════════════

/** Genesis hash — first entry in every case's chain */
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Get the most recent hash for a case's ledger chain.
 * @param {string} caseId
 * @returns {string} The latest current_hash, or GENESIS_HASH if chain is empty.
 */
function getLatestHash(caseId) {
    const row = db.prepare(
        'SELECT current_hash FROM audit_ledger WHERE case_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT 1'
    ).get(caseId);
    return row ? row.current_hash : GENESIS_HASH;
}

/**
 * Append an immutable, cryptographically-linked entry to the audit ledger.
 * @param {string} caseId
 * @param {string} actionType - e.g. 'DOCUMENT_INGEST', 'TIMELINE_GENERATION', 'SEARCH_QUERY'
 * @param {object} detailsObj - metadata about the action
 * @returns {{ id, case_id, action_type, details, timestamp, previous_hash, current_hash }}
 */
function appendLedgerEntry(caseId, actionType, detailsObj) {
    const id = crypto.randomUUID();
    const previousHash = getLatestHash(caseId);
    const timestamp = new Date().toISOString();
    const detailsStr = JSON.stringify(detailsObj);

    // SHA-256 chain: hash(previous_hash + caseId + actionType + details + timestamp)
    const currentHash = crypto
        .createHash('sha256')
        .update(previousHash + caseId + actionType + detailsStr + timestamp)
        .digest('hex');

    db.prepare(
        'INSERT INTO audit_ledger (id, case_id, action_type, details, timestamp, previous_hash, current_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, caseId, actionType, detailsStr, timestamp, previousHash, currentHash);

    console.log(`[CivicVault Ledger] ${actionType} | Case: ${caseId.substring(0, 8)} | Hash: ${currentHash.substring(0, 12)}…`);

    return { id, case_id: caseId, action_type: actionType, details: detailsStr, timestamp, previous_hash: previousHash, current_hash: currentHash };
}

/**
 * Get the full audit trail for a case, ordered chronologically.
 * @param {string} caseId
 * @returns {Array<{ id, case_id, action_type, details, timestamp, previous_hash, current_hash }>}
 */
function getAuditTrail(caseId) {
    return db.prepare(
        'SELECT * FROM audit_ledger WHERE case_id = ? ORDER BY timestamp ASC, rowid ASC'
    ).all(caseId);
}

/**
 * Verify the integrity of a case's entire audit chain.
 * @param {string} caseId
 * @returns {{ valid: boolean, entries: number, brokenAt: number|null }}
 */
function verifyChainIntegrity(caseId) {
    const entries = getAuditTrail(caseId);
    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // Check chain link: previous_hash must match expected
        if (entry.previous_hash !== expectedPrevHash) {
            return { valid: false, entries: entries.length, brokenAt: i };
        }

        // Verify hash computation
        const computedHash = crypto
            .createHash('sha256')
            .update(entry.previous_hash + entry.case_id + entry.action_type + entry.details + entry.timestamp)
            .digest('hex');

        if (computedHash !== entry.current_hash) {
            return { valid: false, entries: entries.length, brokenAt: i };
        }

        expectedPrevHash = entry.current_hash;
    }

    return { valid: true, entries: entries.length, brokenAt: null };
}

module.exports = {
    initDatabase,
    createCase,
    getAllCases,
    getCase,
    addDocument,
    getDocumentsByCase,
    appendLedgerEntry,
    getAuditTrail,
    verifyChainIntegrity,
};
