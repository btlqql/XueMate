import type { QuickSearchRecord } from '../domain/quickSearch'
import type { InsertQuickSearchRow, QuickSearchRow } from '../dao/quickSearchDao'

function parseResultJson(raw: string | null): unknown {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function stringifyResultJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

export function rowToQuickSearchRecord(row: QuickSearchRow): QuickSearchRecord {
  return {
    id: row.id,
    runId: row.run_id,
    query: row.query,
    normalizedQuery: row.normalized_query,
    kind: row.kind,
    status: row.status,
    mode: row.mode || '',
    taskId: row.task_id || '',
    summary: row.summary || '',
    resultJson: parseResultJson(row.result_json),
    error: row.error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function quickSearchRecordToInsertRow(record: QuickSearchRecord): InsertQuickSearchRow {
  return {
    id: record.id,
    run_id: record.runId,
    query: record.query,
    normalized_query: record.normalizedQuery,
    kind: record.kind,
    status: record.status,
    mode: record.mode,
    task_id: record.taskId,
    summary: record.summary,
    result_json: stringifyResultJson(record.resultJson),
    error: record.error,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  }
}
