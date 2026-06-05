import { randomUUID } from 'crypto'
import type { Task, TaskEditableFields } from '../domain/task'
import type { InsertTaskRow, UpdateTaskFieldsRow } from '../dao/taskDao'
import * as taskDao from '../dao/taskDao'
import { rowToTask } from '../mappers/taskMapper'

export type { Task } from '../domain/task'

export function getTasks(): Task[] {
  return taskDao.findAll().map(rowToTask)
}

export function addTasks(tasks: Omit<Task, 'id' | 'createdAt'>[]): Task[] {
  const now = Date.now()
  const rows: InsertTaskRow[] = tasks.map((task) => ({
    id: randomUUID(),
    title: task.title,
    deadline: task.deadline,
    deadline_ts: task.deadlineTs,
    format: task.format,
    naming: task.naming,
    note: task.note,
    status: task.status || 'pending',
    source_text: task.sourceText || '',
    created_at: now
  }))

  taskDao.insertMany(rows)
  return getTasks()
}

export function updateTask(id: string, fields: Partial<TaskEditableFields>): boolean {
  const existing = taskDao.findById(id)
  if (!existing) return false

  const row: UpdateTaskFieldsRow = {
    title: fields.title ?? existing.title,
    deadline: fields.deadline ?? existing.deadline,
    deadline_ts: fields.deadlineTs ?? existing.deadline_ts,
    format: fields.format ?? existing.format,
    naming: fields.naming ?? existing.naming,
    note: fields.note ?? existing.note
  }

  return taskDao.updateFields(id, row) > 0
}

export function deleteTask(id: string): boolean {
  return taskDao.deleteById(id) > 0
}

export function toggleTask(id: string): boolean {
  const row = taskDao.findById(id)
  if (!row) return false

  const newStatus = row.status === 'done' ? 'pending' : 'done'
  return taskDao.updateStatus(id, newStatus) > 0
}

// 获取需要提醒的任务
export function getTasksForReminder(): Task[] {
  return taskDao.findPendingWithDeadlineAfter(Date.now()).map(rowToTask)
}

export function markReminded(id: string, reminded24h: boolean, reminded1h: boolean): void {
  taskDao.markReminded(id, reminded24h, reminded1h)
}
