import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { performance } from 'perf_hooks'

const ROOT = '/Users/wangyue/wangyue/XueMate'
const BRIDGE_URL = process.env.XUEMATE_RENDERER_BRIDGE_URL || 'http://127.0.0.1:8788'
const BIN =
  process.env.XUEMATE_MCP_GATEWAY_BIN ||
  resolve(ROOT, 'mcp-gateway-rs/target/release/xuemate-mcp-gateway')
const SAMPLES = Number(process.env.AGENT_MCP_BENCH_SAMPLES || 16)
const WARMUP = Number(process.env.AGENT_MCP_BENCH_WARMUP || 3)
const QUERY = process.env.AGENT_MCP_BENCH_QUERY || '函数单调性和导数有什么关系？'
const COLLECTION_ID = process.env.AGENT_MCP_BENCH_COLLECTION || 'all'

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

function stats(values) {
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
  return {
    samples: values.length,
    avgMs: Number(avg.toFixed(2)),
    minMs: Number(Math.min(...values).toFixed(2)),
    maxMs: Number(Math.max(...values).toFixed(2)),
    p50Ms: Number(percentile(values, 50).toFixed(2)),
    p95Ms: Number(percentile(values, 95).toFixed(2))
  }
}

async function timed(fn) {
  const start = performance.now()
  const value = await fn()
  return { duration: performance.now() - start, value }
}

async function bridgeGet(path) {
  const response = await fetch(`${BRIDGE_URL}${path}`)
  const text = await response.text()
  if (!response.ok) throw new Error(`Bridge GET ${path} ${response.status}: ${text}`)
  return JSON.parse(text)
}

async function bridgePost(path, body) {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Bridge POST ${path} ${response.status}: ${text}`)
  return JSON.parse(text)
}

async function clearBridgeCache(reason) {
  await bridgePost('/api/cache/clear', { reason })
}

class McpClient {
  constructor() {
    if (!existsSync(BIN)) throw new Error(`MCP binary missing: ${BIN}`)
    this.child = spawn(BIN, [], {
      cwd: ROOT,
      env: { ...process.env, XUEMATE_RENDERER_BRIDGE_URL: BRIDGE_URL },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.nextId = 1
    this.buffer = ''
    this.pending = new Map()
    this.stderr = ''
    this.child.stdout.on('data', (chunk) => this.onStdout(chunk))
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk.toString('utf8')
    })
  }

  onStdout(chunk) {
    this.buffer += chunk.toString('utf8')
    let index = this.buffer.indexOf('\n')
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line) {
        const message = JSON.parse(line)
        const pending = this.pending.get(message.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(message.id)
          pending.resolve(message)
        }
      }
      index = this.buffer.indexOf('\n')
    }
  }

  request(method, params = {}, timeoutMs = 10000) {
    const id = this.nextId++
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        rejectRequest(new Error(`MCP timeout ${method}; stderr=${this.stderr}`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer })
    }).then((message) => {
      if (message.error) throw new Error(message.error.message || `MCP error ${method}`)
      return message.result
    })
  }

  async init() {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'agent-mcp-bench', version: '1.0.0' }
    })
  }

  async tool(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args }, 20000)
    const text = result?.content?.find((item) => item.type === 'text')?.text
    if (!text) throw new Error(`MCP ${name} missing text content`)
    return JSON.parse(text)
  }

  close() {
    this.child.kill()
  }
}

const retrieveBody = {
  query: QUERY,
  collectionId: COLLECTION_ID,
  topK: 4,
  candidateK: 48,
  minScore: 0.16,
  useMmr: true,
  includeContext: true,
  maxChars: 3600,
  title: '以下是用户课程资料中的相关内容'
}

async function directAgentRagContext({ noCache }) {
  const suffix = noCache
    ? `?collectionId=${encodeURIComponent(COLLECTION_ID)}&noCache=1`
    : `?collectionId=${encodeURIComponent(COLLECTION_ID)}`
  const statsResponse = await bridgeGet(`/api/rag/stats${suffix}`)
  if ((statsResponse.data?.chunkCount || 0) <= 0)
    return { stats: statsResponse.data, retrieve: null }
  const retrieveResponse = await bridgePost(
    '/api/rag/retrieve',
    noCache ? { ...retrieveBody, noCache: true } : retrieveBody
  )
  return { stats: statsResponse.data, retrieve: retrieveResponse.data }
}

async function mcpAgentRagContext(mcp, { noCache }) {
  const response = await mcp.tool('xuemate.agent.ragContext', {
    ...retrieveBody,
    minInjectScore: 0.24,
    includeResults: false,
    noCache
  })
  return { stats: response.data?.stats, retrieve: response.data }
}

async function measure(label, fn, { clearEachTime }) {
  for (let i = 0; i < WARMUP; i++) {
    if (clearEachTime) await clearBridgeCache(`${label} warmup ${i}`)
    await fn()
  }
  const durations = []
  let lastValue = null
  for (let i = 0; i < SAMPLES; i++) {
    if (clearEachTime) await clearBridgeCache(`${label} sample ${i}`)
    const result = await timed(fn)
    durations.push(result.duration)
    lastValue = result.value
  }
  return { label, ...stats(durations), lastCount: lastValue?.retrieve?.count ?? 0 }
}

function markdown(report) {
  const rows = report.results
    .map(
      (item) =>
        `| ${item.label} | ${item.avgMs}ms | ${item.p50Ms}ms | ${item.p95Ms}ms | ${item.minMs}ms | ${item.maxMs}ms | ${item.lastCount} |`
    )
    .join('\n')
  const directCold = report.results.find((item) => item.label === 'direct cold')
  const directCached = report.results.find((item) => item.label === 'direct cached')
  const mcpCold = report.results.find((item) => item.label === 'internal MCP cold')
  const mcpCached = report.results.find((item) => item.label === 'internal MCP cached')
  const cachedVsDirect =
    directCached && mcpCached ? Number((directCached.avgMs - mcpCached.avgMs).toFixed(2)) : null
  const mcpCacheSaved =
    mcpCold && mcpCached ? Number((mcpCold.avgMs - mcpCached.avgMs).toFixed(2)) : null
  return [
    '# Internal Agent MCP Benchmark',
    '',
    `- Date: ${report.createdAt}`,
    `- Bridge: \`${report.bridgeUrl}\``,
    `- MCP Gateway: \`${report.gatewayBinary}\``,
    `- Query: ${report.query}`,
    `- Collection: ${report.collectionId}`,
    `- Samples: ${report.samples}, warmup: ${report.warmup}`,
    '',
    '| Scenario | Avg | P50 | P95 | Min | Max | Last result count |',
    '|---|---:|---:|---:|---:|---:|---:|',
    rows,
    '',
    '## Interpretation',
    '',
    `- MCP cached vs direct cached avg delta: ${cachedVsDirect === null ? '-' : `${cachedVsDirect}ms`} (${cachedVsDirect !== null && cachedVsDirect > 0 ? 'MCP faster' : 'MCP not faster'})`,
    `- MCP gateway cache saved avg: ${mcpCacheSaved === null ? '-' : `${mcpCacheSaved}ms`} compared with MCP cold.`,
    '- cold 场景每轮会清 Electron bridge cache；cached 场景保留 bridge + gateway cache，模拟内部 agent 对同一学习上下文的重复工具调用。',
    '- direct 场景代表旧的 bridge/direct 两步工具调用路径；internal MCP 场景代表现在内部 agent 走 RS compound MCP 工具 `xuemate.agent.ragContext`。',
    ''
  ].join('\n')
}

async function main() {
  await bridgeGet('/health')
  const mcp = new McpClient()
  try {
    await mcp.init()
    const results = []
    results.push(
      await measure('direct cold', () => directAgentRagContext({ noCache: true }), {
        clearEachTime: true
      })
    )
    results.push(
      await measure('direct cached', () => directAgentRagContext({ noCache: false }), {
        clearEachTime: false
      })
    )
    results.push(
      await measure('internal MCP cold', () => mcpAgentRagContext(mcp, { noCache: true }), {
        clearEachTime: true
      })
    )
    results.push(
      await measure('internal MCP cached', () => mcpAgentRagContext(mcp, { noCache: false }), {
        clearEachTime: false
      })
    )
    const report = {
      createdAt: new Date().toISOString(),
      bridgeUrl: BRIDGE_URL,
      gatewayBinary: BIN,
      query: QUERY,
      collectionId: COLLECTION_ID,
      samples: SAMPLES,
      warmup: WARMUP,
      results
    }
    const reportDir = resolve(ROOT, 'docs/reports')
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(
      resolve(reportDir, 'internal-agent-mcp-benchmark-latest.json'),
      JSON.stringify(report, null, 2)
    )
    writeFileSync(resolve(reportDir, 'internal-agent-mcp-benchmark-latest.md'), markdown(report))
    console.log(JSON.stringify(report, null, 2))
  } finally {
    mcp.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
