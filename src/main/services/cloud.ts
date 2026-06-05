import { net } from 'electron'

export interface CloudResourceScores {
  relevance: number
  readability: number
  ageFit: number
  trust: number
  adNoise: number
  overall: number
  level: string
  reason: string
}

export interface CloudResourceSource {
  title: string
  url: string
  text: string
  scores: CloudResourceScores
  level: string
}

export interface CloudResourceSearchResult {
  taskId: string
  mode: string
  query: string
  elapsedMs: number
  cacheHit: boolean
  stages: { name: string; status: string; detail: string; at: string }[]
  summary: string
  sources: CloudResourceSource[]
}

export function getCloudBaseUrl(): string | null {
  const configured = (process.env.XUEMATE_CLOUD_URL || '').trim()
  if (!configured || configured.toLowerCase() === 'off') return null
  return configured.replace(/\/$/, '')
}

export async function searchCloudLearningResources(
  query: string,
  limit = 4
): Promise<CloudResourceSearchResult | null> {
  const baseUrl = getCloudBaseUrl()
  if (!baseUrl) return null

  const response = await net.fetch(`${baseUrl}/api/resource/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-XueMate-Client': 'electron-main'
    },
    body: JSON.stringify({ query, limit })
  })

  if (!response.ok) {
    throw new Error(`云端资源检索失败 (${response.status})`)
  }

  const payload = (await response.json()) as any
  if (!payload?.success) {
    throw new Error(payload?.error || '云端资源检索失败')
  }

  return {
    taskId: String(payload.taskId || ''),
    mode: String(payload.mode || 'cloud-resource-search'),
    query: String(payload.query || query),
    elapsedMs: Number(payload.elapsedMs || 0),
    cacheHit: Boolean(payload.cacheHit),
    stages: Array.isArray(payload.stages) ? payload.stages : [],
    summary: String(payload.summary || ''),
    sources: Array.isArray(payload.sources)
      ? payload.sources
          .map((source: any) => ({
            title: String(source?.title || '网页资源'),
            url: String(source?.url || ''),
            text: String(source?.text || ''),
            scores: normalizeScores(source?.scores),
            level: String(source?.level || source?.scores?.level || 'C')
          }))
          .filter((source) => /^https?:\/\//i.test(source.url))
      : []
  }
}

function normalizeScores(scores: any): CloudResourceScores {
  return {
    relevance: Number(scores?.relevance || 0),
    readability: Number(scores?.readability || 0),
    ageFit: Number(scores?.ageFit || 0),
    trust: Number(scores?.trust || 0),
    adNoise: Number(scores?.adNoise || 0),
    overall: Number(scores?.overall || 0),
    level: String(scores?.level || 'C'),
    reason: String(scores?.reason || '')
  }
}
