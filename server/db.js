import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pg from 'pg';

export async function connectDatabase({ url = process.env.DATABASE_URL, path = process.env.SQLITE_PATH || 'data/training.sqlite' } = {}) {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 20 });
    const wrap = client => ({ dialect: 'postgres', query: async (sql, params = []) => {
      let i = 0;
      return client.query(sql.replace(/\?/g, () => `$${++i}`), params);
    } });
    return { ...wrap(pool), async transaction(fn) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await fn(wrap(client)); await client.query('COMMIT'); return result; }
      catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }, close: () => pool.end() };
  }
  const { DatabaseSync } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
  let tail = Promise.resolve();
  const locked = fn => { const result = tail.then(fn); tail = result.catch(() => {}); return result; };
  const raw = { dialect: 'sqlite', async query(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    if (/^\s*(SELECT|PRAGMA|WITH)/i.test(sql) || /\bRETURNING\b/i.test(sql)) { const rows = stmt.all(...params); return { rows, rowCount: rows.length }; }
    const result = stmt.run(...params); return { rows: [], rowCount: result.changes };
  } };
  return { dialect: 'sqlite', query: (sql, params) => locked(() => raw.query(sql, params)), transaction: fn => locked(async () => {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = await fn(raw); sqlite.exec('COMMIT'); return result; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  }), close: async () => { await tail; sqlite.close(); } };
}

export async function migrate(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')), is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL, cover_image TEXT NOT NULL DEFAULT '', speaker TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('onsite','online','hybrid')), location TEXT NOT NULL DEFAULT '', online_url TEXT NOT NULL DEFAULT '', start_at TEXT NOT NULL, end_at TEXT NOT NULL, reg_open_at TEXT NOT NULL, reg_close_at TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity>0), price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(price>=0), requires_approval INTEGER NOT NULL DEFAULT 0, cancel_deadline_days INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL CHECK(status IN ('draft','open','full','closed','finished')), created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS course_fields (id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id), label TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('text','select','checkbox')), options TEXT NOT NULL DEFAULT '[]', is_required INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS registrations (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, course_id TEXT NOT NULL REFERENCES courses(id), title TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, organization TEXT NOT NULL, position TEXT NOT NULL, custom_answers TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL CHECK(status IN ('pending','confirmed','waitlisted','rejected','cancelled')), waitlist_position INTEGER, pdpa_consented_at TEXT NOT NULL, access_token_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '')`,
    `CREATE UNIQUE INDEX IF NOT EXISTS registration_active_email ON registrations(course_id,email) WHERE status != 'cancelled'`,
    `CREATE INDEX IF NOT EXISTS registration_course_status ON registrations(course_id,status)`,
    `CREATE INDEX IF NOT EXISTS registration_email ON registrations(email)`,
    `CREATE INDEX IF NOT EXISTS course_status_start ON courses(status,start_at)`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS registration_grants (token_hash TEXT PRIMARY KEY, registration_id TEXT NOT NULL REFERENCES registrations(id), expires_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS email_logs (id TEXT PRIMARY KEY, registration_id TEXT REFERENCES registrations(id), type TEXT NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', error TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, claimed_at TEXT, sent_at TEXT, dedupe_key TEXT UNIQUE, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS email_queue ON email_logs(status,next_attempt_at)`,
    `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, before_data TEXT, after_data TEXT, ip TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
  ];
  for (const sql of statements) await db.query(sql);
}
