import { randomUUID } from 'crypto'
import db from './db'

export interface Task {
  id: string
  title: string
  deadline: string
  deadlineTs: number
  format: string
  naming: string
  note: string
  status: 'pending' | 'done'
  sourceText: string
  createdAt: number
  reminded24h: boolean
  reminded1h: boolean
}

const stmts = {
  getAll: db.prepare('SELECT * FROM tasks ORDER BY deadline_ts ASC, created_at DESC'),
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

function rowToTask(r: any): Task {
  return {
    id: r.id,
    title: r.title,
    deadline: r.deadline,
    deadlineTs: r.deadline_ts,
    format: r.format,
    naming: r.naming,
    note: r.note,
    status: r.status,
    sourceText: r.source_text,
    createdAt: r.created_at,
    reminded24h: r.reminded_24h === 1,
    reminded1h: r.reminded_1h === 1
  }
}

export function getTasks(): Task[] {
  return (stmts.getAll.all() as any[]).map(rowToTask)
}

export function addTasks(tasks: Omit<Task, 'id' | 'createdAt'>[]): Task[] {
  const now = Date.now()
  const insertBatch = db.transaction(() => {
    for (const t of tasks) {
      stmts.insert.run(
        randomUUID(),
        t.title,
        t.deadline,
        t.deadlineTs,
        t.format,
        t.naming,
        t.note,
        t.status || 'pending',
        t.sourceText || '',
        now
      )
    }
  })
  insertBatch()
  return getTasks()
}

export function updateTask(
  id: string,
  fields: Partial<Pick<Task, 'title' | 'deadline' | 'deadlineTs' | 'format' | 'naming' | 'note'>>
): boolean {
  const existing = stmts.getAll.all().find((r: any) => r.id === id) as any
  if (!existing) return false

  stmts.updateFields.run(
    fields.title ?? existing.title,
    fields.deadline ?? existing.deadline,
    fields.deadlineTs ?? existing.deadline_ts,
    fields.format ?? existing.format,
    fields.naming ?? existing.naming,
    fields.note ?? existing.note,
    id
  )
  return true
}

export function deleteTask(id: string): boolean {
  const result = stmts.delete.run(id)
  return result.changes > 0
}

export function toggleTask(id: string): boolean {
  const row = (stmts.getAll.all() as any[]).find((r) => r.id === id)
  if (!row) return false
  const newStatus = row.status === 'done' ? 'pending' : 'done'
  stmts.updateStatus.run(newStatus, id)
  return true
}

// 获取需要提醒的任务
export function getTasksForReminder(): Task[] {
  const now = Date.now()
  return (stmts.getPendingWithDeadline.all('pending', now) as any[]).map(rowToTask)
}

export function markReminded(id: string, reminded24h: boolean, reminded1h: boolean): void {
  stmts.markReminded.run(reminded24h ? 1 : 0, reminded1h ? 1 : 0, id)
}
