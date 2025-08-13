import Database from 'better-sqlite3';
import type { StorageAdapter } from './types.js';

export class SQLiteStorage implements StorageAdapter {
  private db: Database.Database | null = null;

  async init(dbPath: string): Promise<void> {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS har_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        startedDateTime TEXT NOT NULL,
        time INTEGER NOT NULL,
        request TEXT NOT NULL,
        response TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_har_started ON har_entries(startedDateTime);

      CREATE TABLE IF NOT EXISTS endpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        method TEXT NOT NULL,
        data TEXT NOT NULL,
        UNIQUE(path, method)
      );
      CREATE INDEX IF NOT EXISTS idx_endpoints_path_method ON endpoints(path, method);
    `);
  }

  isReady(): boolean {
    return this.db !== null;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async saveHarEntry(entry: any): Promise<void> {
    if (!this.db) return;
    const stmt = this.db.prepare(
      'INSERT INTO har_entries (startedDateTime, time, request, response) VALUES (?, ?, ?, ?)'
    );
    stmt.run(
      entry.startedDateTime,
      entry.time,
      JSON.stringify(entry.request),
      JSON.stringify(entry.response)
    );
  }

  async getHarLog(): Promise<any> {
    if (!this.db) return { log: { version: '1.2', creator: { name: 'Arbiter', version: '1.0.0' }, entries: [] } };
    const rows = this.db.prepare('SELECT startedDateTime, time, request, response FROM har_entries ORDER BY id ASC').all();
    const entries = rows.map((r) => ({
      startedDateTime: r.startedDateTime,
      time: r.time,
      request: JSON.parse(r.request),
      response: JSON.parse(r.response),
    }));
    return {
      log: {
        version: '1.2',
        creator: { name: 'Arbiter', version: '1.0.0' },
        entries,
      },
    };
  }

  async clearHar(): Promise<void> {
    if (!this.db) return;
    this.db.prepare('DELETE FROM har_entries').run();
  }

  async upsertEndpoint(path: string, method: string, data: any): Promise<void> {
    if (!this.db) return;
    const stmt = this.db.prepare(
      'INSERT INTO endpoints (path, method, data) VALUES (?, ?, ?)
       ON CONFLICT(path, method) DO UPDATE SET data=excluded.data'
    );
    stmt.run(path, method.toLowerCase(), JSON.stringify(data));
  }

  async getAllEndpoints(): Promise<Array<{ path: string; method: string; data: any }>> {
    if (!this.db) return [];
    const rows = this.db.prepare('SELECT path, method, data FROM endpoints').all();
    return rows.map((r) => ({ path: r.path, method: r.method, data: JSON.parse(r.data) }));
  }
}

export const sqliteStorage = new SQLiteStorage();


