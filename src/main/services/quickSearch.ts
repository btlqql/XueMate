import { checkSearchSafety, summarizeResults } from './agent'
import { searchAndFetch } from './web'

export interface QuickSearchResult {
  query: string
  summary: string
  sources: { title: string; url: string; text: string }[]
}

export async function quickSearch(query: string): Promise<QuickSearchResult> {
  const normalized = query.trim()
  if (!normalized) throw new Error('请输入要查的内容')

  const unsafe = await checkSearchSafety(normalized)
  if (unsafe) {
    throw new Error(unsafe)
  }

  const pages = await searchAndFetch(normalized)
  const sources = pages.slice(0, 4).map((page) => ({
    title: page.title || '网页',
    url: page.url,
    text: page.text.slice(0, 700)
  }))

  const rawText = sources.map((page) => `【${page.title}】${page.url}\n${page.text}`).join('\n\n')
  const summary = await summarizeResults(normalized, rawText)
  return { query: normalized, summary, sources }
}
