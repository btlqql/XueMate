import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const DATA_DIR = join(process.env.HOME || '/tmp', '.xuemate')
const DB_PATH = join(DATA_DIR, 'xuemate.db')
const DEFAULT_COLLECTION_ID = 'default'

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp);

  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL DEFAULT 'default' REFERENCES collections(id) ON DELETE RESTRICT,
    file_name TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL DEFAULT 'default' REFERENCES collections(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    start_pos INTEGER NOT NULL,
    end_pos INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    deadline TEXT NOT NULL DEFAULT '',
    deadline_ts INTEGER NOT NULL DEFAULT 0,
    format TEXT NOT NULL DEFAULT '不限',
    naming TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),
    source_text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    reminded_24h INTEGER NOT NULL DEFAULT 0,
    reminded_1h INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS quick_search_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    query TEXT NOT NULL,
    normalized_query TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('foreground','background')),
    status TEXT NOT NULL CHECK(status IN ('done','error','skipped')),
    mode TEXT,
    task_id TEXT,
    summary TEXT DEFAULT '',
    result_json TEXT DEFAULT '{}',
    error TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_quick_search_results_run
    ON quick_search_results(run_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_quick_search_results_query
    ON quick_search_results(normalized_query, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_quick_search_results_recent
    ON quick_search_results(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_quick_search_results_kind_status
    ON quick_search_results(kind, status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS learning_signals (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('todo','weak_point','material_gap')),
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','confirmed','resolved','dismissed')),
    source TEXT NOT NULL DEFAULT 'agent' CHECK(source IN ('chat','memory','manual','agent')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_signals_unique
    ON learning_signals(conversation_id, type, normalized_title);
  CREATE INDEX IF NOT EXISTS idx_learning_signals_conversation
    ON learning_signals(conversation_id, status, updated_at DESC);
`)

function hasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((row) => row.name === column)
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
  }
}

const now = Date.now()

db.prepare(
  `INSERT OR IGNORE INTO collections (id, name, description, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?)`
).run(DEFAULT_COLLECTION_ID, '默认资料库', '自动创建的默认资料库', now, now)

// 兼容旧版本：原 documents/chunks 没有 collection_id。
// SQLite ALTER TABLE 无法安全补 FK，这里只补字段；新库会走上面的完整建表约束。
addColumnIfMissing(
  'documents',
  'collection_id',
  `collection_id TEXT NOT NULL DEFAULT '${DEFAULT_COLLECTION_ID}'`
)
addColumnIfMissing(
  'chunks',
  'collection_id',
  `collection_id TEXT NOT NULL DEFAULT '${DEFAULT_COLLECTION_ID}'`
)

db.exec(`
  UPDATE documents SET collection_id = '${DEFAULT_COLLECTION_ID}'
  WHERE collection_id IS NULL OR collection_id = '';

  UPDATE chunks SET collection_id = '${DEFAULT_COLLECTION_ID}'
  WHERE collection_id IS NULL OR collection_id = '';

  CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chunks_collection ON chunks(collection_id);
`)

export default db
