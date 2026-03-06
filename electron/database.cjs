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

module.exports = {
    initDatabase,
    createCase,
    getAllCases,
    getCase,
    addDocument,
    getDocumentsByCase,
};
