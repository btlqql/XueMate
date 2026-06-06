export type QuickSearchKind = 'foreground' | 'background'
export type QuickSearchStatus = 'done' | 'error' | 'skipped'

export interface QuickSearchFilters {
  limit?: number
  runId?: string
  query?: string
  kind?: QuickSearchKind
  status?: QuickSearchStatus
}

export interface QuickSearchRecord {
  id: string
  runId: string
  query: string
  normalizedQuery: string
  kind: QuickSearchKind
  status: QuickSearchStatus
  mode: string
  taskId: string
  summary: string
  resultJson: unknown
  error: string
  createdAt: number
  updatedAt: number
}
