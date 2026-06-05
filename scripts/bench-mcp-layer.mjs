#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BRIDGE_URL = (process.env.XUEMATE_RENDERER_BRIDGE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '')
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
  if (!res.ok || json.success === false) throw new Error(`GET ${path} failed: ${JSON.stringify(json)}`)
  return json
}

async function bridgePost(path, body) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const json = await res.json()
  if (!res.ok || json.success === false) throw new Error(`POST ${path} failed: ${JSON.stringify(json)}`)
  return json
}

function ensureGatewayBinary() {
  if (existsSync(BIN) && process.env.MCP_BENCH_BUILD !== '1') return

  console.log('[bench:mcp] building Rust MCP gateway...')
  const result = spawnSync('cargo', ['build', '--release', '--manifest-path', 'mcp-gateway-rs/Cargo.toml'], {
    cwd: ROOT,
    stdio: 'inherit'
  })
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
    if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
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

async function measureCase(label, directFn, mcpFn) {
  const directDurations = []
  const mcpDurations = []

  for (let i = 0; i < WARMUP; i += 1) {
    await directFn()
    await mcpFn()
  }

  for (let i = 0; i < SAMPLES; i += 1) {
    directDurations.push((await timed(directFn)).duration)
    mcpDurations.push((await timed(mcpFn)).duration)
  }

  const direct = stats(directDurations)
  const mcp = stats(mcpDurations)
  const overheadMs = Number((mcp.avgMs - direct.avgMs).toFixed(2))
  const overheadPct = Number(((overheadMs / Math.max(direct.avgMs, 0.01)) * 100).toFixed(1))
  return { label, direct, mcp, overheadMs, overheadPct }
}

function markdownReport(report) {
  const lines = [
    '# XueMate Rust MCP Gateway 真实链路对比测试',
    '',
    `- 时间：${report.generatedAt}`,
    `- Bridge：\`${report.bridgeUrl}\``,
    `- 样本：warmup=${report.warmup}, samples=${report.samples}`,
    `- Rust binary：\`${report.gatewayBinary}\``,
    '',
    '## 结果',
    '',
    '| 场景 | Direct HTTP avg | MCP avg | MCP额外耗时 | p95 Direct | p95 MCP |',
    '|---|---:|---:|---:|---:|---:|'
  ]

  for (const item of report.results) {
    lines.push(
      `| ${item.label} | ${item.direct.avgMs}ms | ${item.mcp.avgMs}ms | ${item.overheadMs}ms (${item.overheadPct}%) | ${item.direct.p95Ms}ms | ${item.mcp.p95Ms}ms |`
    )
  }

  lines.push(
    '',
    '## 结论口径',
    '',
    '- Direct HTTP：Node benchmark 直接请求 Electron `rendererBridge`。',
    '- MCP：Node benchmark 通过 stdio JSON-RPC 调 Rust MCP Gateway，再由 Gateway 请求同一个 Electron `rendererBridge`。',
    '- 这个测试不使用 mock；要求本地 XueMate dev app 和真实 SQLite/服务已启动。',
    '- MCP 路径多一跳，单次延迟通常略高；它的价值在工具标准化、外部 Agent 接入、并发编排和动作队列。'
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

    const cases = [
      {
        label: 'health',
        direct: () => bridgeGet('/health'),
        mcp: () => mcp.tool('xuemate.bridge.health')
      },
      {
        label: 'rag.collections',
        direct: () => bridgeGet('/api/rag/collections'),
        mcp: () => mcp.tool('xuemate.rag.collections')
      },
      {
        label: 'learningGraph.default',
        direct: () => bridgeGet('/api/rag/learningGraph?collectionId=default'),
        mcp: () => mcp.tool('xuemate.learningGraph.get', { collectionId: 'default' })
      },
      {
        label: 'rag.retrieve',
        direct: () =>
          bridgePost('/api/rag/retrieve', {
            query: '分数 学习路径 知识图谱',
            collectionId: 'all',
            topK: 4,
            candidateK: 32,
            minScore: 0.12,
            includeContext: true,
            maxChars: 2600
          }),
        mcp: () =>
          mcp.tool('xuemate.rag.retrieve', {
            query: '分数 学习路径 知识图谱',
            collectionId: 'all',
            topK: 4,
            candidateK: 32,
            minScore: 0.12,
            includeContext: true,
            maxChars: 2600
          })
      }
    ]

    const results = []
    for (const item of cases) {
      console.log(`[bench:mcp] ${item.label}`)
      results.push(await measureCase(item.label, item.direct, item.mcp))
    }

    const report = {
      generatedAt: new Date().toISOString(),
      bridgeUrl: BRIDGE_URL,
      gatewayBinary: BIN,
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
        direct_avg_ms: item.direct.avgMs,
        mcp_avg_ms: item.mcp.avgMs,
        overhead_ms: item.overheadMs,
        overhead_pct: item.overheadPct,
        direct_p95_ms: item.direct.p95Ms,
        mcp_p95_ms: item.mcp.p95Ms
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
