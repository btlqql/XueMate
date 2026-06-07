import http from 'http'
import type { Server } from 'http'
import * as rag from './rag'
import { buildLearningGraph } from './learningGraph'
import { buildSystemPrompt, getMemory, loadArchive } from './memory'
import { quickSearch } from './quickSearch'
import { buildQuerySketch, getLocalPeerEdgeSketch } from './peerEdgeSketch'
import {
  bridgeCacheKey,
  clearBridgeCache,
  getBridgeCacheStats,
  withBridgeCache
} from './bridgeCache'

let bridgeServer: Server | null = null
const MAX_BODY_BYTES = 1024 * 1024

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(payload))
}

function collectionIdOf(url: URL): string | undefined {
  return url.searchParams.get('collectionId') || undefined
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, num))
}

function boolFromBody(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return !['0', 'false', 'off', 'no'].includes(value.toLowerCase())
  return Boolean(value)
}

function noCacheFromUrl(url: URL): boolean {
  return boolFromBody(url.searchParams.get('noCache') ?? url.searchParams.get('no_cache'), false)
}

function noCacheFromBody(body: Record<string, any>): boolean {
  return boolFromBody(body.noCache ?? body.no_cache, false)
}

function pathWithSearch(url: URL): string {
  return `${url.pathname}${url.search}`
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) {
      throw new Error('request body too large')
    }
    chunks.push(buffer)
  }

  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object')
  }
  return parsed
}

export function startRendererBridge(port = 8788): void {
  if (bridgeServer) return

  bridgeServer = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        sendJson(res, 204, {})
        return
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { success: true, service: 'xuemate-renderer-bridge' })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/rag/collections') {
        const data = await withBridgeCache(
          bridgeCacheKey(req.method, pathWithSearch(url)),
          () => rag.getCollections(),
          { noCache: noCacheFromUrl(url) }
        )
        sendJson(res, 200, { success: true, data })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/rag/documents') {
        const data = await withBridgeCache(
          bridgeCacheKey(req.method, pathWithSearch(url)),
          () => rag.getDocuments(collectionIdOf(url)),
          { noCache: noCacheFromUrl(url) }
        )
        sendJson(res, 200, { success: true, data })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/rag/stats') {
        const data = await withBridgeCache(
          bridgeCacheKey(req.method, pathWithSearch(url)),
          () => rag.getStats(collectionIdOf(url)),
          { noCache: noCacheFromUrl(url) }
        )
        sendJson(res, 200, { success: true, data })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/rag/learningGraph') {
        const data = await withBridgeCache(
          bridgeCacheKey(req.method, pathWithSearch(url)),
          () => buildLearningGraph(collectionIdOf(url)),
          { noCache: noCacheFromUrl(url) }
        )
        sendJson(res, 200, { success: true, data })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/rag/retrieve') {
        const body = await readJsonBody(req)
        const query = String(body.query || '').trim()
        if (!query) {
          sendJson(res, 400, { success: false, error: 'query is required' })
          return
        }

        const data = await withBridgeCache(
          bridgeCacheKey(req.method, pathWithSearch(url), body),
          async () => {
            const results = await rag.retrieve(query, {
              collectionId: String(
                body.collectionId || collectionIdOf(url) || rag.ALL_COLLECTIONS_ID
              ),
              topK: clampNumber(body.topK, 5, 1, 20),
              candidateK: clampNumber(body.candidateK, 48, 5, 200),
              minScore: clampNumber(body.minScore, 0.18, 0, 1),
              useMmr: boolFromBody(body.useMmr, true),
              noCache: noCacheFromBody(body) || noCacheFromUrl(url)
            })
            const includeContext = boolFromBody(body.includeContext, true)
            const context = includeContext
              ? rag.buildRagContext(results, {
                  maxChars: clampNumber(body.maxChars, 3600, 500, 12000),
                  title: String(body.title || '以下是 XueMate 知识库检索到的真实资料')
                })
              : ''

            return {
              query,
              count: results.length,
              results,
              context
            }
          },
          { noCache: noCacheFromBody(body) || noCacheFromUrl(url) }
        )

        sendJson(res, 200, {
          success: true,
          data
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/peeredge/sketch') {
        const data = getLocalPeerEdgeSketch(noCacheFromUrl(url))
        sendJson(res, 200, { success: true, data })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/peeredge/query-sketch') {
        const body = await readJsonBody(req)
        const query = String(body.query || '').trim()
        if (!query) {
          sendJson(res, 400, { success: false, error: 'query is required' })
          return
        }
        const data = buildQuerySketch(query)
        sendJson(res, 200, { success: true, data })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/memory') {
        const data = await withBridgeCache(
          bridgeCacheKey(req.method, pathWithSearch(url)),
          () => {
            const memory = getMemory()
            const includeSystemPrompt = url.searchParams.get('includeSystemPrompt') === '1'
            return {
              memory,
              systemPrompt: includeSystemPrompt ? buildSystemPrompt(memory) : undefined
            }
          },
          { noCache: noCacheFromUrl(url) }
        )
        sendJson(res, 200, {
          success: true,
          data
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/memory/archive') {
        const module = String(url.searchParams.get('module') || 'topics') as
          | 'topics'
          | 'weak'
          | 'strong'
        if (!['topics', 'weak', 'strong'].includes(module)) {
          sendJson(res, 400, { success: false, error: 'module must be topics, weak, or strong' })
          return
        }
        const data = await withBridgeCache(
          bridgeCacheKey(req.method, pathWithSearch(url)),
          () => ({ module, text: loadArchive(module) }),
          { noCache: noCacheFromUrl(url) }
        )
        sendJson(res, 200, { success: true, data })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/cache/stats') {
        sendJson(res, 200, { success: true, data: getBridgeCacheStats() })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/cache/clear') {
        const body = await readJsonBody(req)
        clearBridgeCache(String(body.reason || 'rendererBridge api'))
        sendJson(res, 200, { success: true, data: getBridgeCacheStats() })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/quick-search/run') {
        const body = await readJsonBody(req)
        const query = String(body.query || '').trim()
        if (!query) {
          sendJson(res, 400, { success: false, error: 'query is required' })
          return
        }
        const data = await quickSearch(query)
        sendJson(res, 200, { success: true, data })
        return
      }

      sendJson(res, 404, { success: false, error: 'not found' })
    } catch (error: any) {
      sendJson(res, 500, { success: false, error: error?.message || String(error) })
    }
  })

  bridgeServer.on('error', (error: any) => {
    console.error('[RendererBridge] 启动失败:', error?.message || error)
    bridgeServer = null
  })

  bridgeServer.listen(port, '127.0.0.1', () => {
    console.log(`[RendererBridge] listening on http://127.0.0.1:${port}`)
  })
}

export function stopRendererBridge(): void {
  if (!bridgeServer) return
  bridgeServer.close()
  bridgeServer = null
}
