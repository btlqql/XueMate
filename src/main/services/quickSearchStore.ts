import { randomUUID } from 'crypto'
import type { QuickSearchResult } from './quickSearch'
import type {
  QuickSearchFilters,
  QuickSearchKind,
  QuickSearchRecord,
  QuickSearchStatus
} from '../domain/quickSearch'
import * as quickSearchDao from '../dao/quickSearchDao'
import { quickSearchRecordToInsertRow, rowToQuickSearchRecord } from '../mappers/quickSearchMapper'

interface SaveResultInput {
  id?: string
  runId: string
  query?: string
  kind: QuickSearchKind
  result: QuickSearchResult
  createdAt?: number
}

interface SaveStatusInput {
  id?: string
  runId: string
  query: string
  kind: QuickSearchKind
  status: QuickSearchStatus
  mode?: string
  taskId?: string
  summary?: string
  resultJson?: unknown
  error?: string
  createdAt?: number
}

export function normalizeQuickSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function saveResult(input: SaveResultInput): QuickSearchRecord {
  const now = input.createdAt || Date.now()
  const query = input.query || input.result.query
  const record: QuickSearchRecord = {
    id: input.id || randomUUID(),
    runId: input.runId,
    query,
    normalizedQuery: normalizeQuickSearchQuery(query),
    kind: input.kind,
    status: 'done',
    mode: input.result.mode || '',
    taskId: input.result.taskId || '',
    summary: input.result.summary || '',
    resultJson: input.result,
    error: '',
    createdAt: now,
    updatedAt: now
  }

  quickSearchDao.insert(quickSearchRecordToInsertRow(record))
  return record
}

export function saveStatus(input: SaveStatusInput): QuickSearchRecord {
  const now = input.createdAt || Date.now()
  const record: QuickSearchRecord = {
    id: input.id || randomUUID(),
    runId: input.runId,
    query: input.query,
    normalizedQuery: normalizeQuickSearchQuery(input.query),
    kind: input.kind,
    status: input.status,
    mode: input.mode || '',
    taskId: input.taskId || '',
    summary: input.summary || '',
    resultJson: input.resultJson ?? {},
    error: input.error || '',
    createdAt: now,
    updatedAt: now
  }

  quickSearchDao.insert(quickSearchRecordToInsertRow(record))
  return record
}

export function list(filters: QuickSearchFilters = {}): QuickSearchRecord[] {
  return quickSearchDao.findMany({ limit: 5, ...filters }).map(rowToQuickSearchRecord)
}

export function get(id: string): QuickSearchRecord | null {
  const row = quickSearchDao.findById(id)
  return row ? rowToQuickSearchRecord(row) : null
}

export function deleteRecord(id: string): boolean {
  return quickSearchDao.deleteById(id) > 0
}
