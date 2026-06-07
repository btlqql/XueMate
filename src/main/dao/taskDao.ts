import db from '../services/infrastructure/db'
import type { TaskStatus } from '../domain/task'

export interface TaskRow {
  id: string
  title: string
  deadline: string
  deadline_ts: number
  format: string
  naming: string
  note: string
  status: TaskStatus
  source_text: string
  created_at: number
  reminded_24h: number
  reminded_1h: number
}

export interface InsertTaskRow {
  id: string
  title: string
  deadline: string
  deadline_ts: number
  format: string
  naming: string
  note: string
  status: TaskStatus
  source_text: string
  created_at: number
}

export interface UpdateTaskFieldsRow {
  title: string
  deadline: string
  deadline_ts: number
  format: string
  naming: string
  note: string
}

const stmts = {
  getAll: db.prepare('SELECT * FROM tasks ORDER BY deadline_ts ASC, created_at DESC'),
  getById: db.prepare('SELECT * FROM tasks WHERE id = ?'),
  getPending: db.prepare(
    'SELECT * FROM tasks WHERE status = ? AND deadline_ts > 0 ORDER BY deadline_ts ASC'
  ),
  insert: db.prepare(
    `INSERT INTO tasks (id, title, deadline, deadline_ts, format, naming, note, status, source_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  updateStatus: db.prepare('UPDATE tasks SET status = ? WHERE id = ?'),
  updateFields: db.prepare(
    'UPDATE tasks SET title = ?, deadline = ?, deadline_ts = ?, format = ?, naming = ?, note = ? WHERE id = ?'
  ),
  delete: db.prepare('DELETE FROM tasks WHERE id = ?'),
  getPendingWithDeadline: db.prepare(
    'SELECT * FROM tasks WHERE status = ? AND deadline_ts > 0 AND deadline_ts > ?'
  ),
  markReminded: db.prepare('UPDATE tasks SET reminded_24h = ?, reminded_1h = ? WHERE id = ?')
}

const insertManyTx = db.transaction((rows: InsertTaskRow[]) => {
  for (const row of rows) {
    stmts.insert.run(
      row.id,
      row.title,
      row.deadline,
      row.deadline_ts,
      row.format,
      row.naming,
      row.note,
      row.status,
      row.source_text,
      row.created_at
    )
  }
})

export function findAll(): TaskRow[] {
  return stmts.getAll.all() as TaskRow[]
}

export function findById(id: string): TaskRow | null {
  return (stmts.getById.get(id) as TaskRow | undefined) ?? null
}

export function findPending(): TaskRow[] {
  return stmts.getPending.all('pending') as TaskRow[]
}

export function insertMany(rows: InsertTaskRow[]): void {
  insertManyTx(rows)
}

export function updateFields(id: string, fields: UpdateTaskFieldsRow): number {
  const result = stmts.updateFields.run(
    fields.title,
    fields.deadline,
    fields.deadline_ts,
    fields.format,
    fields.naming,
    fields.note,
    id
  )
  return result.changes
}

export function updateStatus(id: string, status: TaskStatus): number {
  const result = stmts.updateStatus.run(status, id)
  return result.changes
}

export function deleteById(id: string): number {
  const result = stmts.delete.run(id)
  return result.changes
}

export function findPendingWithDeadlineAfter(timestamp: number): TaskRow[] {
  return stmts.getPendingWithDeadline.all('pending', timestamp) as TaskRow[]
}

export function markReminded(id: string, reminded24h: boolean, reminded1h: boolean): void {
  stmts.markReminded.run(reminded24h ? 1 : 0, reminded1h ? 1 : 0, id)
}
