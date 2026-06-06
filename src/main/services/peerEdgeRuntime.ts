import { spawn, type ChildProcessByStdio } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import type { Readable } from 'stream'

export interface PeerEdgeRuntimeStatus {
  enabled: boolean
  running: boolean
  pid: number | null
  port: number
  bind: string
  group: string
  binaryPath: string | null
  reason: string
  lastExitCode: number | null
}

type PeerEdgeChildProcess = ChildProcessByStdio<null, Readable, Readable>
type ProcessWithResourcesPath = NodeJS.Process & { resourcesPath?: string }

let child: PeerEdgeChildProcess | null = null
let binaryPath: string | null = null
let lastExitCode: number | null = null
let startAttempted = false

function boolFlag(
  value: string | undefined,
  fallback: 'auto' | 'on' | 'off' = 'auto'
): 'auto' | 'on' | 'off' {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) return 'on'
  if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) return 'off'
  return 'auto'
}

function binName(): string {
  return process.platform === 'win32' ? 'xuemate-peer-edge.exe' : 'xuemate-peer-edge'
}

function candidateBinaryPaths(): string[] {
  const explicit = process.env.XUEMATE_PEEREDGE_BIN
  const name = binName()
  const cwd = process.cwd()
  const repoFromOut = resolve(__dirname, '../../../')
  const processWithResources = process as ProcessWithResourcesPath
  const resourcesPath =
    typeof processWithResources.resourcesPath === 'string'
      ? processWithResources.resourcesPath
      : undefined

  return [
    explicit,
    join(cwd, 'peer-edge-rs', 'target', 'release', name),
    join(cwd, 'peer-edge-rs', 'target', 'debug', name),
    join(repoFromOut, 'peer-edge-rs', 'target', 'release', name),
    join(repoFromOut, 'peer-edge-rs', 'target', 'debug', name),
    resourcesPath ? join(resourcesPath, 'peer-edge', name) : undefined
  ].filter(Boolean) as string[]
}

function resolveBinaryPath(): string | null {
  for (const candidate of candidateBinaryPaths()) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? parsed : fallback
}

export function startPeerEdgeRuntime(): PeerEdgeRuntimeStatus {
  const flag = boolFlag(process.env.XUEMATE_PEEREDGE, 'auto')
  const port = numberEnv('XUEMATE_PEEREDGE_PORT', 18888)
  const bind = process.env.XUEMATE_PEEREDGE_BIND || '127.0.0.1'
  const group = process.env.XUEMATE_PEEREDGE_GROUP || 'class-demo'

  if (child && !child.killed) {
    return getPeerEdgeRuntimeStatus('already running')
  }

  if (flag === 'off') {
    return {
      enabled: false,
      running: false,
      pid: null,
      port,
      bind,
      group,
      binaryPath: null,
      reason: 'disabled by XUEMATE_PEEREDGE',
      lastExitCode
    }
  }

  binaryPath = resolveBinaryPath()
  if (!binaryPath) {
    return {
      enabled: flag === 'on',
      running: false,
      pid: null,
      port,
      bind,
      group,
      binaryPath: null,
      reason:
        flag === 'on'
          ? 'PeerEdge binary not found; run npm run peeredge:build first'
          : 'PeerEdge binary not found; auto mode skipped',
      lastExitCode
    }
  }

  startAttempted = true
  const rendererBridgePort = numberEnv('XUEMATE_RENDERER_BRIDGE_PORT', 8788)
  const env = {
    ...process.env,
    XUEMATE_PEEREDGE_PORT: String(port),
    XUEMATE_PEEREDGE_BIND: bind,
    XUEMATE_PEEREDGE_GROUP: group,
    XUEMATE_RENDERER_BRIDGE_URL:
      process.env.XUEMATE_RENDERER_BRIDGE_URL || `http://127.0.0.1:${rendererBridgePort}`
  }

  const spawned = spawn(binaryPath, [], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child = spawned

  spawned.stdout.on('data', (chunk) => {
    const text = String(chunk).trim()
    if (text) console.log(`[PeerEdge] ${text}`)
  })

  spawned.stderr.on('data', (chunk) => {
    const text = String(chunk).trim()
    if (text) console.log(`[PeerEdge] ${text}`)
  })

  spawned.on('error', (error) => {
    console.warn('[PeerEdge] runtime error:', error.message)
  })

  spawned.on('exit', (code) => {
    lastExitCode = code
    console.log(`[PeerEdge] runtime exited, code=${code}`)
    if (child === spawned) child = null
  })

  console.log(`[PeerEdge] starting hidden Rust runtime: ${binaryPath}`)
  return getPeerEdgeRuntimeStatus('started')
}

export function stopPeerEdgeRuntime(): void {
  if (!child) return
  const target = child
  child = null
  if (!target.killed) {
    target.kill('SIGTERM')
    setTimeout(() => {
      if (!target.killed) target.kill('SIGKILL')
    }, 1500).unref()
  }
}

export function getPeerEdgeRuntimeStatus(reason = ''): PeerEdgeRuntimeStatus {
  const flag = boolFlag(process.env.XUEMATE_PEEREDGE, 'auto')
  return {
    enabled: flag !== 'off',
    running: Boolean(child && !child.killed),
    pid: child?.pid || null,
    port: numberEnv('XUEMATE_PEEREDGE_PORT', 18888),
    bind: process.env.XUEMATE_PEEREDGE_BIND || '127.0.0.1',
    group: process.env.XUEMATE_PEEREDGE_GROUP || 'class-demo',
    binaryPath,
    reason: reason || (startAttempted ? 'started before' : 'not started'),
    lastExitCode
  }
}
