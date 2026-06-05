import type { Task } from '../domain/task'
import type { TaskRow } from '../dao/taskDao'

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    deadline: row.deadline,
    deadlineTs: row.deadline_ts,
    format: row.format,
    naming: row.naming,
    note: row.note,
    status: row.status,
    sourceText: row.source_text,
    createdAt: row.created_at,
    reminded24h: row.reminded_24h === 1,
    reminded1h: row.reminded_1h === 1
  }
}
