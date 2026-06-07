import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type McpToolArguments = { [key: string]: JsonValue }

interface JsonRpcError {
  code?: number
  message?: string
  data?: JsonValue
}

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number
  result?: JsonValue
  error?: JsonRpcError
}

interface PendingRequest {
  resolve: (value: JsonRpcResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface McpTextContent {
  type?: unknown
  text?: unknown
}

interface McpToolResultEnvelope {
  content?: unknown
  isError?: unknown
}

interface XueMateBridgeEnvelope {
  success?: unknown
  data?: unknown
  error?: unknown
}

export interface InternalMcpStatus {
  enabled: boolean
  running: boolean
  binaryPath: string
  reason?: string
}

let child: ChildProcessWithoutNullStreams | null = null
let stdoutBuffer = ''
let nextId = 1
let initializePromise: Promise<void> | null = null
let disabledReason: string | null = null
const pending = new Map<number, PendingRequest>()

function internalMcpEnabled(): boolean {
  return process.env.XUEMATE_INTERNAL_MCP !== 'off'
}

function gatewayBinaryPath(): string {
  return (
    process.env.XUEMATE_MCP_GATEWAY_BIN ||
    resolve(process.cwd(), 'mcp-gateway-rs/target/release/xuemate-mcp-gateway')
  )
}

function rendererBridgeUrl(): string {
  return (
    process.env.XUEMATE_RENDERER_BRIDGE_URL ||
    `http://127.0.0.1:${process.env.XUEMATE_RENDERER_BRIDGE_PORT || 8788}`
  )
}

function isJsonObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeJsonRpcResponse(value: unknown): JsonRpcResponse | null {
  if (!isJsonObject(value)) return null
  const response: JsonRpcResponse = {}
  if (typeof value.jsonrpc === 'string') response.jsonrpc = value.jsonrpc
  if (typeof value.id === 'number') response.id = value.id
  if ('result' in value) response.result = value.result as JsonValue
  if (isJsonObject(value.error)) {
    response.error = {
      code: typeof value.error.code === 'number' ? value.error.code : undefined,
      message: typeof value.error.message === 'string' ? value.error.message : undefined,
      data: 'data' in value.error ? (value.error.data as JsonValue) : undefined
    }
  }
  return response
}

function rejectAllPending(error: Error): void {
  for (const request of pending.values()) {
    clearTimeout(request.timer)
    request.reject(error)
  }
  pending.clear()
}

function handleStdout(chunk: Buffer): void {
  stdoutBuffer += chunk.toString('utf8')
  let newlineIndex = stdoutBuffer.indexOf('\n')
  while (newlineIndex >= 0) {
    const line = stdoutBuffer.slice(0, newlineIndex).trim()
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
    if (line) {
      try {
        const response = normalizeJsonRpcResponse(JSON.parse(line))
        if (response?.id !== undefined) {
          const request = pending.get(response.id)
          if (request) {
            pending.delete(response.id)
            clearTimeout(request.timer)
            request.resolve(response)
          }
        }
      } catch (error) {
        console.warn('[InternalMCP] 忽略无法解析的 stdout:', error)
      }
    }
    newlineIndex = stdoutBuffer.indexOf('\n')
  }
}

function ensureChild(): ChildProcessWithoutNullStreams | null {
  if (!internalMcpEnabled()) {
    disabledReason = 'XUEMATE_INTERNAL_MCP=off'
    return null
  }
  if (child && !child.killed) return child

  const binaryPath = gatewayBinaryPath()
  if (!existsSync(binaryPath)) {
    disabledReason = `MCP gateway binary not found: ${binaryPath}`
    return null
  }

  disabledReason = null
  stdoutBuffer = ''
  child = spawn(binaryPath, [], {
    env: {
      ...process.env,
      XUEMATE_RENDERER_BRIDGE_URL: rendererBridgeUrl()
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })

  child.stdout.on('data', handleStdout)
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8').trim()
    if (text) console.log(`[InternalMCP] ${text}`)
  })
  child.on('exit', (code, signal) => {
    child = null
    initializePromise = null
    rejectAllPending(new Error(`Internal MCP exited code=${code} signal=${signal}`))
  })
  child.on('error', (error) => {
    disabledReason = error.message
    child = null
    initializePromise = null
    rejectAllPending(error)
  })

  return child
}

async function request(
  method: string,
  params: McpToolArguments = {},
  timeoutMs = 5000
): Promise<JsonValue> {
  const activeChild = ensureChild()
  if (!activeChild) {
    throw new Error(disabledReason || 'Internal MCP unavailable')
  }

  const id = nextId++
  const payload = {
    jsonrpc: '2.0',
    id,
    method,
    params
  }

  const response = await new Promise<JsonRpcResponse>((resolveResponse, rejectResponse) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      rejectResponse(new Error(`Internal MCP request timeout: ${method}`))
    }, timeoutMs)
    pending.set(id, { resolve: resolveResponse, reject: rejectResponse, timer })
    activeChild.stdin.write(`${JSON.stringify(payload)}\n`)
  })

  if (response.error) {
    throw new Error(response.error.message || `Internal MCP error: ${method}`)
  }
  return response.result ?? null
}

export async function warmInternalMcpClient(): Promise<void> {
  if (!internalMcpEnabled()) return
  if (!initializePromise) {
    initializePromise = request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'xuemate-internal-agent',
        version: '1.0.0'
      }
    }).then(() => undefined)
  }
  await initializePromise
}

function extractToolText(result: JsonValue): string {
  if (!isJsonObject(result)) throw new Error('Internal MCP tool result must be an object')
  const envelope = result as McpToolResultEnvelope
  if (envelope.isError === true) throw new Error('Internal MCP tool returned isError=true')
  if (!Array.isArray(envelope.content)) throw new Error('Internal MCP tool result missing content')
  const textItem = envelope.content.find((item): item is McpTextContent => {
    return isJsonObject(item) && item.type === 'text' && typeof item.text === 'string'
  })
  if (!textItem || typeof textItem.text !== 'string') {
    throw new Error('Internal MCP tool result missing text content')
  }
  return textItem.text
}

export async function callInternalMcpTool<T>(
  name: string,
  args: McpToolArguments = {},
  timeoutMs = 8000
): Promise<T> {
  await warmInternalMcpClient()
  const result = await request('tools/call', { name, arguments: args }, timeoutMs)
  const text = extractToolText(result)
  const parsed: unknown = JSON.parse(text)
  if (!isJsonObject(parsed)) throw new Error(`Internal MCP ${name} returned non-object JSON`)
  const envelope = parsed as XueMateBridgeEnvelope
  if (envelope.success !== true) {
    throw new Error(
      typeof envelope.error === 'string' ? envelope.error : `Internal MCP ${name} bridge failed`
    )
  }
  return envelope.data as T
}

export function getInternalMcpStatus(): InternalMcpStatus {
  return {
    enabled: internalMcpEnabled(),
    running: !!child && !child.killed,
    binaryPath: gatewayBinaryPath(),
    reason: disabledReason || undefined
  }
}

export function stopInternalMcpClient(): void {
  rejectAllPending(new Error('Internal MCP stopped'))
  initializePromise = null
  if (child && !child.killed) {
    child.kill()
  }
  child = null
}
