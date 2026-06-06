import { checkSearchSafety, summarizeResults } from './agent'
import { searchAndFetch } from './web'

export interface QuickSearchSourceScore {
  relevance: number
  readability: number
  ageFit: number
  trust: number
  adNoise: number
  overall: number
  level: string
  reason: string
}

export interface QuickSearchSource {
  title: string
  url: string
  text: string
  scores?: QuickSearchSourceScore
  level?: string
}

export interface QuickSearchResult {
  query: string
  summary: string
  mode: 'local'
  taskId?: string
  elapsedMs?: number
  cacheHit?: boolean
  stages?: { name: string; status: string; detail: string; at: string }[]
  sources: QuickSearchSource[]
}

export interface QuickSearchBackgroundUpdate {
  runId?: string
  recordId?: string
  query: string
  status: 'running' | 'done' | 'error' | 'skipped'
  message?: string
  result?: QuickSearchResult
  error?: string
}

export async function quickSearch(query: string): Promise<QuickSearchResult> {
  const normalized = query.trim()
  if (!normalized) throw new Error('请输入要查的内容')

  const unsafe = await checkSearchSafety(normalized)
  if (unsafe) {
    throw new Error(unsafe)
  }

  return quickSearchLocal(normalized)
}

async function quickSearchLocal(normalized: string): Promise<QuickSearchResult> {
  const startAt = Date.now()
  const pages = await searchAndFetch(normalized)
  const sources = pages.slice(0, 4).map((page) => ({
    title: page.title || '网页',
    url: page.url,
    text: page.text.slice(0, 700)
  }))

  const rawText = sources.map((page) => `【${page.title}】${page.url}\n${page.text}`).join('\n\n')
  const summary = await summarizeResults(normalized, rawText)
  const elapsedMs = Date.now() - startAt

  return {
    query: normalized,
    summary,
    mode: 'local',
    elapsedMs,
    stages: [
      {
        name: 'local-web-search',
        status: 'done',
        detail: `本地网页查询完成，整理 ${sources.length} 条参考资料`,
        at: new Date().toISOString()
      }
    ],
    sources
  }
}
