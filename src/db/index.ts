import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database<sqlite3.Database, sqlite3.Statement>;

export async function initDatabase(): Promise<void> {
  try {
    const dbPath = path.resolve(process.cwd(), 'hermes.db');

    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    console.log(`[Database] Koneksi SQLite berhasil → ${dbPath}`);

    // ── Tabel portfolio ──────────────────────────────────────────────────────
    await db.exec(`
      CREATE TABLE IF NOT EXISTS portfolio (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id       INTEGER NOT NULL,
        symbol        TEXT    NOT NULL,
        average_price REAL    NOT NULL,
        total_lot     INTEGER NOT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[Database] Tabel "portfolio" siap.');

    // ── Tabel watchlist ──────────────────────────────────────────────────────
    await db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id    INTEGER NOT NULL,
        symbol     TEXT    NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[Database] Tabel "watchlist" siap.');

    // ── Tabel alerts ─────────────────────────────────────────────────────────
    await db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id      INTEGER NOT NULL,
        symbol       TEXT    NOT NULL,
        target_price REAL    NOT NULL,
        condition    TEXT    NOT NULL CHECK (condition IN ('ABOVE', 'BELOW')),
        is_active    BOOLEAN DEFAULT 1,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[Database] Tabel "alerts" siap.');

    console.log('[Database] Semua tabel berhasil diinisialisasi.');
  } catch (error) {
    console.error('[Database Error] Gagal menginisialisasi database:', error);
    throw error;
  }
}

export function getDb(): Database<sqlite3.Database, sqlite3.Statement> {
  if (!db) {
    throw new Error('[Database] Database belum diinisialisasi. Panggil initDatabase() terlebih dahulu.');
  }
  return db;
}
