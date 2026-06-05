#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BRIDGE_URL = (process.env.XUEMATE_RENDERER_BRIDGE_URL || 'http://127.0.0.1:8788').replace(
  /\/$/,
  ''
)
const SAMPLES = Number(process.env.MCP_BENCH_SAMPLES || 12)
const WARMUP = Number(process.env.MCP_BENCH_WARMUP || 2)
const BIN =
  process.env.XUEMATE_MCP_GATEWAY_BIN ||
  resolve(ROOT, 'mcp-gateway-rs/target/release/xuemate-mcp-gateway')

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

function stats(values) {
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
  return {
    samples: values.length,
    avgMs: Number(avg.toFixed(2)),
    minMs: Number(Math.min(...values).toFixed(2)),
    p50Ms: Number(percentile(values, 50).toFixed(2)),
    p95Ms: Number(percentile(values, 95).toFixed(2)),
    maxMs: Number(Math.max(...values).toFixed(2))
  }
}

async function timed(fn) {
  const start = performance.now()
  const result = await fn()
  const duration = performance.now() - start
  return { duration, result }
}

async function bridgeGet(path) {
  const res = await fetch(`${BRIDGE_URL}${path}`)
  const json = await res.json()
  if (!res.ok || json.success === false)
    throw new Error(`GET ${path} failed: ${JSON.stringify(json)}`)
  return json
}

async function bridgePost(path, body) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const json = await res.json()
  if (!res.ok || json.success === false)
    throw new Error(`POST ${path} failed: ${JSON.stringify(json)}`)
  return json
}

function ensureGatewayBinary() {
  if (existsSync(BIN) && process.env.MCP_BENCH_BUILD !== '1') return

  console.log('[bench:mcp] building Rust MCP gateway...')
  const result = spawnSync(
    'cargo',
    ['build', '--release', '--manifest-path', 'mcp-gateway-rs/Cargo.toml'],
    {
      cwd: ROOT,
      stdio: 'inherit'
    }
  )
  if (result.status !== 0) {
    throw new Error('cargo build failed')
  }
}

class McpClient {
  constructor() {
    this.nextId = 1
    this.pending = new Map()
    this.buffer = ''
    this.child = spawn(BIN, [], {
      cwd: ROOT,
      env: {
        ...process.env,
        XUEMATE_RENDERER_BRIDGE_URL: BRIDGE_URL
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk
      let index
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim()
        this.buffer = this.buffer.slice(index + 1)
        if (!line) continue
        this.handleLine(line)
      }
    })

    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk) => {
      if (process.env.MCP_BENCH_VERBOSE === '1') process.stderr.write(chunk)
    })

    this.child.on('exit', (code, signal) => {
      const error = new Error(`MCP gateway exited code=${code} signal=${signal}`)
      for (const { reject } of this.pending.values()) reject(error)
      this.pending.clear()
    })
  }

  handleLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch (error) {
      throw new Error(`bad MCP JSON line: ${line}\n${error.message}`)
    }
    const id = String(message.id)
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    if (message.error)
      pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
    else pending.resolve(message.result)
  }

  request(method, params = {}) {
    const id = this.nextId++
    const payload = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolvePromise, reject) => {
      this.pending.set(String(id), { resolve: resolvePromise, reject })
      this.child.stdin.write(JSON.stringify(payload) + '\n')
    })
  }

  notify(method, params = {}) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  async tool(name, args = {}) {
    return this.request('tools/call', { name, arguments: args })
  }

  close() {
    this.child.stdin.end()
    this.child.kill('SIGTERM')
  }
}

async function measureCase(label, directColdFn, directCachedFn, mcpColdFn, mcpCachedFn = null) {
  const directColdDurations = []
  const directCachedDurations = []
  const mcpColdDurations = []
  const mcpCachedDurations = []

  for (let i = 0; i < WARMUP; i += 1) {
    await directColdFn()
    await mcpColdFn()
  }

  for (let i = 0; i < SAMPLES; i += 1) {
    directColdDurations.push((await timed(directColdFn)).duration)
    mcpColdDurations.push((await timed(mcpColdFn)).duration)
  }

  if (directCachedFn) {
    await directCachedFn() // fill Electron bridge cache once
    for (let i = 0; i < SAMPLES; i += 1) {
      directCachedDurations.push((await timed(directCachedFn)).duration)
    }
  }

  if (mcpCachedFn) {
    await mcpCachedFn() // fill Rust MCP cache once
    for (let i = 0; i < SAMPLES; i += 1) {
      mcpCachedDurations.push((await timed(mcpCachedFn)).duration)
    }
  }

  const directCold = stats(directColdDurations)
  const directCached = directCachedDurations.length ? stats(directCachedDurations) : null
  const mcpCold = stats(mcpColdDurations)
  const mcpCached = mcpCachedDurations.length ? stats(mcpCachedDurations) : null

  const overheadMs = Number((mcpCold.avgMs - directCold.avgMs).toFixed(2))
  const overheadPct = Number(((overheadMs / Math.max(directCold.avgMs, 0.01)) * 100).toFixed(1))
  const bridgeCacheSpeedupMs = directCached
    ? Number((directCold.avgMs - directCached.avgMs).toFixed(2))
    : null
  const bridgeCacheSpeedupPct = directCached
    ? Number(((bridgeCacheSpeedupMs / Math.max(directCold.avgMs, 0.01)) * 100).toFixed(1))
    : null
  const mcpCacheSpeedupMs = mcpCached ? Number((mcpCold.avgMs - mcpCached.avgMs).toFixed(2)) : null
  const mcpCacheSpeedupPct = mcpCached
    ? Number(((mcpCacheSpeedupMs / Math.max(mcpCold.avgMs, 0.01)) * 100).toFixed(1))
    : null

  return {
    label,
    directCold,
    directCached,
    mcpCold,
    mcpCached,
    overheadMs,
    overheadPct,
    bridgeCacheSpeedupMs,
    bridgeCacheSpeedupPct,
    mcpCacheSpeedupMs,
    mcpCacheSpeedupPct
  }
}

function markdownReport(report) {
  const lines = [
    '# XueMate Rust MCP Gateway 真实链路对比测试',
    '',
    `- 时间：${report.generatedAt}`,
    `- Bridge：\`${report.bridgeUrl}\``,
    `- 样本：warmup=${report.warmup}, samples=${report.samples}`,
    `- Rust binary：\`${report.gatewayBinary}\``,
    `- Electron bridge 缓存：TTL ${report.bridgeCacheTtlMs}ms，可用 \`XUEMATE_BRIDGE_CACHE=off\` 关闭。`,
    `- MCP 缓存：进程内 TTL 缓存，默认 ${report.cacheTtlMs}ms，可用 \`XUEMATE_MCP_CACHE=off\` 关闭。`,
    '',
    '## 结果',
    '',
    '| 场景 | Direct cold avg | Direct bridge cached avg | MCP cold avg | MCP cached avg | MCP额外耗时 | Bridge缓存节省 | MCP缓存节省 | p95 Direct cold | p95 MCP cold |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  ]

  for (const item of report.results) {
    lines.push(
      `| ${item.label} | ${item.directCold.avgMs}ms | ${item.directCached ? `${item.directCached.avgMs}ms` : '-'} | ${item.mcpCold.avgMs}ms | ${item.mcpCached ? `${item.mcpCached.avgMs}ms` : '-'} | ${item.overheadMs}ms (${item.overheadPct}%) | ${item.bridgeCacheSpeedupMs === null ? '-' : `${item.bridgeCacheSpeedupMs}ms (${item.bridgeCacheSpeedupPct}%)`} | ${item.mcpCacheSpeedupMs === null ? '-' : `${item.mcpCacheSpeedupMs}ms (${item.mcpCacheSpeedupPct}%)`} | ${item.directCold.p95Ms}ms | ${item.mcpCold.p95Ms}ms |`
    )
  }

  lines.push(
    '',
    '## 结论口径',
    '',
    '- Direct cold：Node benchmark 直接请求 Electron `rendererBridge`，并传 `noCache=true` 跳过 bridge 缓存。',
    '- Direct bridge cached：Node benchmark 直接请求 Electron `rendererBridge`，命中 bridge 二级缓存。',
    '- MCP cold：Node benchmark 通过 stdio JSON-RPC 调 Rust MCP Gateway，并传 `noCache=true` 跳过 Gateway 与 bridge 缓存。',
    '- MCP cached：同一个 Rust MCP Gateway 进程内重复调用同一 tool，命中 Gateway TTL 缓存。',
    '- 这个测试不使用 mock；要求本地 XueMate dev app 和真实 SQLite/服务已启动。',
    '- 缓存适合 RAG 检索、知识图谱、资料夹/记忆等短时间重复调用；写操作和 quickSearch 默认不缓存。'
  )

  return lines.join('\n')
}

async function main() {
  ensureGatewayBinary()
  await bridgeGet('/health')

  const mcp = new McpClient()
  try {
    await mcp.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'xuemate-benchmark', version: '0.1.0' }
    })
    mcp.notify('notifications/initialized')

    const retrieveArgs = {
      query: '分数 学习路径 知识图谱',
      collectionId: 'all',
      topK: 4,
      candidateK: 32,
      minScore: 0.12,
      includeContext: true,
      maxChars: 2600
    }

    const cases = [
      {
        label: 'health',
        directCold: () => bridgeGet('/health?noCache=1'),
        directCached: null,
        mcpCold: () => mcp.tool('xuemate.bridge.health')
      },
      {
        label: 'rag.collections',
        directCold: () => bridgeGet('/api/rag/collections?noCache=1'),
        directCached: () => bridgeGet('/api/rag/collections'),
        mcpCold: () => mcp.tool('xuemate.rag.collections', { noCache: true }),
        mcpCached: () => mcp.tool('xuemate.rag.collections')
      },
      {
        label: 'learningGraph.default',
        directCold: () => bridgeGet('/api/rag/learningGraph?collectionId=default&noCache=1'),
        directCached: () => bridgeGet('/api/rag/learningGraph?collectionId=default'),
        mcpCold: () =>
          mcp.tool('xuemate.learningGraph.get', { collectionId: 'default', noCache: true }),
        mcpCached: () => mcp.tool('xuemate.learningGraph.get', { collectionId: 'default' })
      },
      {
        label: 'rag.retrieve',
        directCold: () => bridgePost('/api/rag/retrieve', { ...retrieveArgs, noCache: true }),
        directCached: () => bridgePost('/api/rag/retrieve', retrieveArgs),
        mcpCold: () => mcp.tool('xuemate.rag.retrieve', { ...retrieveArgs, noCache: true }),
        mcpCached: () => mcp.tool('xuemate.rag.retrieve', retrieveArgs)
      }
    ]

    const results = []
    for (const item of cases) {
      console.log(`[bench:mcp] ${item.label}`)
      results.push(
        await measureCase(
          item.label,
          item.directCold,
          item.directCached,
          item.mcpCold,
          item.mcpCached
        )
      )
    }

    const report = {
      generatedAt: new Date().toISOString(),
      bridgeUrl: BRIDGE_URL,
      gatewayBinary: BIN,
      cacheTtlMs: Number(process.env.XUEMATE_MCP_CACHE_TTL_MS || 15000),
      bridgeCacheTtlMs: Number(process.env.XUEMATE_BRIDGE_CACHE_TTL_MS || 30000),
      warmup: WARMUP,
      samples: SAMPLES,
      results
    }

    const reportDir = resolve(ROOT, 'docs/reports')
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(resolve(reportDir, 'mcp-benchmark-latest.json'), JSON.stringify(report, null, 2))
    writeFileSync(resolve(reportDir, 'mcp-benchmark-latest.md'), markdownReport(report))

    console.table(
      results.map((item) => ({
        case: item.label,
        direct_cold_avg_ms: item.directCold.avgMs,
        direct_cached_avg_ms: item.directCached?.avgMs ?? null,
        mcp_cold_avg_ms: item.mcpCold.avgMs,
        mcp_cached_avg_ms: item.mcpCached?.avgMs ?? null,
        overhead_ms: item.overheadMs,
        bridge_cache_saved_ms: item.bridgeCacheSpeedupMs,
        mcp_cache_saved_ms: item.mcpCacheSpeedupMs,
        direct_cold_p95_ms: item.directCold.p95Ms,
        mcp_cold_p95_ms: item.mcpCold.p95Ms
      }))
    )
    console.log('[bench:mcp] wrote docs/reports/mcp-benchmark-latest.{json,md}')
  } finally {
    mcp.close()
  }
}

main().catch((error) => {
  console.error('[bench:mcp] failed:', error.message)
  process.exit(1)
})
