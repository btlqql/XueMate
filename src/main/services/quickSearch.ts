import { checkSearchSafety, summarizeResults } from './agent'
import { searchCloudLearningResources, getCloudBaseUrl, type CloudResourceScores } from './cloud'
import { searchAndFetch } from './web'

export interface QuickSearchSource {
  title: string
  url: string
  text: string
  scores?: CloudResourceScores
  level?: string
}

export interface QuickSearchResult {
  query: string
  summary: string
  mode: 'cloud' | 'local'
  taskId?: string
  elapsedMs?: number
  cacheHit?: boolean
  stages?: { name: string; status: string; detail: string; at: string }[]
  sources: QuickSearchSource[]
}

type QuickSearchMode = 'local' | 'cloud'

function getQuickSearchMode(): QuickSearchMode {
  const configured = (process.env.XUEMATE_QUICK_SEARCH_MODE || 'local').trim().toLowerCase()
  return configured === 'cloud' ? 'cloud' : 'local'
}

export async function quickSearch(query: string): Promise<QuickSearchResult> {
  const normalized = query.trim()
  if (!normalized) throw new Error('请输入要查的内容')

  const unsafe = await checkSearchSafety(normalized)
  if (unsafe) {
    throw new Error(unsafe)
  }

  const searchMode = getQuickSearchMode()
  const cloudBaseUrl = searchMode === 'cloud' ? getCloudBaseUrl() : null

  if (searchMode === 'cloud' && cloudBaseUrl) {
    try {
      const cloudResult = await searchCloudLearningResources(normalized, 4)
      if (cloudResult) {
        return {
          query: cloudResult.query,
          summary: cloudResult.summary,
          mode: 'cloud',
          taskId: cloudResult.taskId,
          elapsedMs: cloudResult.elapsedMs,
          cacheHit: cloudResult.cacheHit,
          stages: cloudResult.stages,
          sources: cloudResult.sources.map((source) => ({
            title: source.title,
            url: source.url,
            text: source.text.slice(0, 700),
            scores: source.scores,
            level: source.level
          }))
        }
      }
    } catch (error: any) {
      console.warn('[QuickSearch] 云端不可用，回退到本地搜索:', error.message || error)
    }
  }

  return quickSearchLocal(normalized)
}

async function quickSearchLocal(normalized: string): Promise<QuickSearchResult> {
  const pages = await searchAndFetch(normalized)
  const sources = pages.slice(0, 4).map((page) => ({
    title: page.title || '网页',
    url: page.url,
    text: page.text.slice(0, 700)
  }))

  const rawText = sources.map((page) => `【${page.title}】${page.url}\n${page.text}`).join('\n\n')
  const summary = await summarizeResults(normalized, rawText)
  return { query: normalized, summary, mode: 'local', sources }
}
