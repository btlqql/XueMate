import http from 'http'
import type { Server } from 'http'
import * as rag from './rag'
import { buildLearningGraph } from './learningGraph'

let bridgeServer: Server | null = null

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(payload))
}

function collectionIdOf(url: URL): string | undefined {
  return url.searchParams.get('collectionId') || undefined
}

export function startRendererBridge(port = 8788): void {
  if (bridgeServer) return

  bridgeServer = http.createServer((req, res) => {
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
        sendJson(res, 200, { success: true, data: rag.getCollections() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/rag/documents') {
        sendJson(res, 200, { success: true, data: rag.getDocuments(collectionIdOf(url)) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/rag/stats') {
        sendJson(res, 200, { success: true, data: rag.getStats(collectionIdOf(url)) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/rag/learningGraph') {
        sendJson(res, 200, { success: true, data: buildLearningGraph(collectionIdOf(url)) })
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
