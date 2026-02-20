const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'motrice_dev.db');
const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
const seedPath = path.join(__dirname, '..', 'sql', 'seed.sql');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function execute(sql) {
  db.exec(sql);
}

async function run(sql, params = []) {
  const stmt = db.prepare(normalizeSql(sql));
  const result = stmt.run(...params);
  return { id: Number(result.lastInsertRowid), changes: result.changes };
}

async function get(sql, params = []) {
  const stmt = db.prepare(normalizeSql(sql));
  return stmt.get(...params) || null;
}

async function all(sql, params = []) {
  const stmt = db.prepare(normalizeSql(sql));
  return stmt.all(...params);
}

async function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = await fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function initDatabase({ seed = false } = {}) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  await execute(schemaSql);
  await ensureCoachSchemaCompatibility();

  if (seed) {
    const seedSql = fs.readFileSync(seedPath, 'utf-8');
    await execute(seedSql);
  }
}

async function ensureCoachSchemaCompatibility() {
  const table = await get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'coach_profiles'");
  if (!table) return;

  const columns = await all('PRAGMA table_info(coach_profiles)');
  const hasPrimarySportId = columns.some((column) => column.name === 'primary_sport_id');

  if (!hasPrimarySportId) {
    await execute('ALTER TABLE coach_profiles ADD COLUMN primary_sport_id INTEGER REFERENCES sports(id) ON DELETE SET NULL');
  }

  const plansTable = await get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plans'");
  if (plansTable) {
    const planColumns = await all('PRAGMA table_info(plans)');
    const hasCoachNote = planColumns.some((column) => column.name === 'coach_note');
    if (!hasCoachNote) {
      await execute("ALTER TABLE plans ADD COLUMN coach_note TEXT NOT NULL DEFAULT ''");
    }
  }

  const planAttachmentsTable = await get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plan_attachments'");
  if (!planAttachmentsTable) {
    await execute(`
      CREATE TABLE IF NOT EXISTS plan_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL CHECK (file_size > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
      );
    `);
    await execute('CREATE INDEX IF NOT EXISTS idx_plan_attachments_plan ON plan_attachments(plan_id);');
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  execute,
  transaction,
  initDatabase
};
