import { request } from 'http'
import { getPeerEdgeRuntimeStatus } from './peerEdgeRuntime'

export interface PeerEdgeEvidenceCard {
  source: string
  peerId: string
  group: string
  fileName: string
  chunkId: string
  snippet: string
  score: number
  rankReason: string[]
  ts: number
}

export interface PeerEdgeRetrieveOptions {
  topK?: number
  collectionId?: string
  timeoutMs?: number
  peerLimit?: number
}

export interface PeerEdgeRetrieveResult {
  enabled: boolean
  running: boolean
  count: number
  evidence: PeerEdgeEvidenceCard[]
  elapsedMs: number
  errors: Array<{ baseUrl: string; error: string }>
}

function postJson<T>(url: URL, body: unknown, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(body)
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(raw)
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`PeerEdge daemon returned ${res.statusCode}: ${text.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(text) as T)
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error('PeerEdge daemon request timeout'))
    })
    req.on('error', reject)
    req.write(raw)
    req.end()
  })
}

function getErrorMessage(error: unknown, fallback = '未知错误'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

export async function retrievePeerEvidence(
  query: string,
  options: PeerEdgeRetrieveOptions = {}
): Promise<PeerEdgeRetrieveResult> {
  const status = getPeerEdgeRuntimeStatus()
  const started = Date.now()
  if (!status.enabled || !status.running) {
    return {
      enabled: status.enabled,
      running: status.running,
      count: 0,
      evidence: [],
      elapsedMs: 0,
      errors: []
    }
  }

  const timeoutMs = Math.max(100, Math.min(options.timeoutMs || 700, 5000))
  const endpoint = new URL(`http://127.0.0.1:${status.port}/fanout-retrieve`)

  try {
    const payload = await postJson<{
      success: boolean
      data?: {
        count?: number
        evidence?: PeerEdgeEvidenceCard[]
        errors?: Array<{ baseUrl: string; error: string }>
        elapsedMs?: number
      }
      error?: string
    }>(
      endpoint,
      {
        query,
        topK: options.topK || 5,
        collectionId: options.collectionId || 'all',
        timeoutMs,
        peerLimit: options.peerLimit
      },
      timeoutMs + 150
    )

    if (!payload.success) throw new Error(payload.error || 'PeerEdge fanout failed')

    return {
      enabled: true,
      running: true,
      count: payload.data?.count || 0,
      evidence: payload.data?.evidence || [],
      elapsedMs: payload.data?.elapsedMs || Date.now() - started,
      errors: payload.data?.errors || []
    }
  } catch (error) {
    const message = getErrorMessage(error)
    console.warn('[PeerEdge] retrieve failed:', message)
    return {
      enabled: true,
      running: true,
      count: 0,
      evidence: [],
      elapsedMs: Date.now() - started,
      errors: [{ baseUrl: 'local-daemon', error: message }]
    }
  }
}


export function buildPeerEdgeContext(
  evidence: PeerEdgeEvidenceCard[],
  options: { maxChars?: number; title?: string } = {}
): string {
  if (!evidence.length) return ''

  const maxChars = options.maxChars || 2200
  const title = options.title || '以下是班级边缘网络中同伴设备返回的脱敏学习证据'
  const blocks: string[] = []
  const citations: string[] = []
  let usedChars = 0

  const ranked = [...evidence]
    .filter((item) => item.snippet && item.snippet.trim())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  for (let i = 0; i < ranked.length; i++) {
    const item = ranked[i]
    const citationId = `同伴${i + 1}`
    const budgetLeft = maxChars - usedChars
    if (budgetLeft < 180) break

    const clipped = item.snippet.trim().slice(0, Math.min(700, budgetLeft))
    usedChars += clipped.length
    citations.push(`${citationId}: ${item.fileName || '班级边缘资料'} / 相关度${Math.round(item.score * 100)}`)
    blocks.push(
      `[${citationId}] 来源: ${item.fileName || '班级边缘资料'}\n` +
        `边缘相关度: ${Math.round(item.score * 100)}%; ` +
        `入选原因: ${(item.rankReason || []).slice(0, 4).join('、') || 'Bloom/Sketch 路由命中'}\n` +
        `${clipped}`
    )
  }

  if (!blocks.length) return ''

  return (
    `\n\n${title}（PeerEdge 已做 Bloom/Sketch 隐私路由；回答时可标注 [同伴1] 这种引用）：\n` +
    blocks.join('\n\n---\n\n') +
    `\n\n同伴引用索引：\n${citations.join('\n')}` +
    '\n\n请把这些内容当作补充证据；如果它与本机资料冲突，优先说明差异，不要编造来源。'
  )
}
