import db from '../services/db'
import type { QuickSearchFilters, QuickSearchKind, QuickSearchStatus } from '../domain/quickSearch'

export interface QuickSearchRow {
  id: string
  run_id: string
  query: string
  normalized_query: string
  kind: QuickSearchKind
  status: QuickSearchStatus
  mode: string | null
  task_id: string | null
  summary: string | null
  result_json: string | null
  error: string | null
  created_at: number
  updated_at: number
}

export interface InsertQuickSearchRow {
  id: string
  run_id: string
  query: string
  normalized_query: string
  kind: QuickSearchKind
  status: QuickSearchStatus
  mode: string
  task_id: string
  summary: string
  result_json: string
  error: string
  created_at: number
  updated_at: number
}

const stmts = {
  insert: db.prepare(
    `INSERT INTO quick_search_results (
      id, run_id, query, normalized_query, kind, status, mode, task_id,
      summary, result_json, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  getById: db.prepare('SELECT * FROM quick_search_results WHERE id = ?'),
  deleteById: db.prepare('DELETE FROM quick_search_results WHERE id = ?')
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 5
  return Math.max(1, Math.min(Math.floor(Number(limit)), 50))
}

export function insert(row: InsertQuickSearchRow): void {
  stmts.insert.run(
    row.id,
    row.run_id,
    row.query,
    row.normalized_query,
    row.kind,
    row.status,
    row.mode,
    row.task_id,
    row.summary,
    row.result_json,
    row.error,
    row.created_at,
    row.updated_at
  )
}

export function findMany(filters: QuickSearchFilters = {}): QuickSearchRow[] {
  const clauses: string[] = []
  const params: Array<string | number> = []

  if (filters.runId) {
    clauses.push('run_id = ?')
    params.push(filters.runId)
  }

  if (filters.kind) {
    clauses.push('kind = ?')
    params.push(filters.kind)
  }

  if (filters.status) {
    clauses.push('status = ?')
    params.push(filters.status)
  }

  if (filters.query) {
    clauses.push('normalized_query LIKE ?')
    params.push(`%${filters.query.trim().toLowerCase()}%`)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = clampLimit(filters.limit)
  return db
    .prepare(`SELECT * FROM quick_search_results ${where} ORDER BY updated_at DESC LIMIT ?`)
    .all(...params, limit) as QuickSearchRow[]
}

export function findById(id: string): QuickSearchRow | null {
  return (stmts.getById.get(id) as QuickSearchRow | undefined) ?? null
}

export function deleteById(id: string): number {
  const result = stmts.deleteById.run(id)
  return result.changes
}
