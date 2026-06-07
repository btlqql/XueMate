import db from '../services/infrastructure/db'

const stmtGet = db.prepare('SELECT data FROM memory WHERE id = 1')
const stmtSave = db.prepare('INSERT OR REPLACE INTO memory (id, data, updated_at) VALUES (1, ?, ?)')

export function loadMemoryData(): string | null {
  const row = stmtGet.get() as { data: string } | undefined
  return row?.data ?? null
}

export function saveMemoryData(data: string, updatedAt: number): void {
  stmtSave.run(data, updatedAt)
}
