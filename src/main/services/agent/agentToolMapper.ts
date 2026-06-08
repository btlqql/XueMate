import { callInternalMcpTool, type McpToolArguments } from '../mcp/internalMcpClient'

export type AgentToolRoute =
  | 'bridge.health'
  | 'rag.collections'
  | 'rag.documents'
  | 'rag.stats'
  | 'rag.retrieve'
  | 'agent.ragContext'
  | 'learningGraph.get'
  | 'memory.get'
  | 'quickSearch.run'

interface AgentToolDefinition {
  route: AgentToolRoute
  rsToolName: string
  timeoutMs: number
  cacheable: boolean
}

export interface AgentToolCallOptions {
  noCache?: boolean
  timeoutMs?: number
}

export interface AgentToolCallResult<T> {
  data: T
  route: AgentToolRoute
  rsToolName: string
  elapsedMs: number
  source: 'rs-mcp'
}

const AGENT_TOOL_DEFINITIONS: Record<AgentToolRoute, AgentToolDefinition> = {
  'bridge.health': {
    route: 'bridge.health',
    rsToolName: 'xuemate.bridge.health',
    timeoutMs: 3000,
    cacheable: false
  },
  'rag.collections': {
    route: 'rag.collections',
    rsToolName: 'xuemate.rag.collections',
    timeoutMs: 5000,
    cacheable: true
  },
  'rag.documents': {
    route: 'rag.documents',
    rsToolName: 'xuemate.rag.documents',
    timeoutMs: 5000,
    cacheable: true
  },
  'rag.stats': {
    route: 'rag.stats',
    rsToolName: 'xuemate.rag.stats',
    timeoutMs: 5000,
    cacheable: true
  },
  'rag.retrieve': {
    route: 'rag.retrieve',
    rsToolName: 'xuemate.rag.retrieve',
    timeoutMs: 12000,
    cacheable: true
  },
  'agent.ragContext': {
    route: 'agent.ragContext',
    rsToolName: 'xuemate.agent.ragContext',
    timeoutMs: 12000,
    cacheable: true
  },
  'learningGraph.get': {
    route: 'learningGraph.get',
    rsToolName: 'xuemate.learningGraph.get',
    timeoutMs: 8000,
    cacheable: true
  },
  'memory.get': {
    route: 'memory.get',
    rsToolName: 'xuemate.memory.get',
    timeoutMs: 5000,
    cacheable: true
  },
  'quickSearch.run': {
    route: 'quickSearch.run',
    rsToolName: 'xuemate.quickSearch.run',
    timeoutMs: 20000,
    cacheable: false
  }
}

export function listAgentToolDefinitions(): AgentToolDefinition[] {
  return Object.values(AGENT_TOOL_DEFINITIONS)
}

function withCacheOption(
  args: McpToolArguments,
  definition: AgentToolDefinition,
  options?: AgentToolCallOptions
): McpToolArguments {
  if (!definition.cacheable || options?.noCache !== true) return args
  return {
    ...args,
    noCache: true
  }
}

export async function callAgentToolViaRs<T>(
  route: AgentToolRoute,
  args: McpToolArguments = {},
  options?: AgentToolCallOptions
): Promise<AgentToolCallResult<T>> {
  const definition = AGENT_TOOL_DEFINITIONS[route]
  const startedAt = Date.now()
  const data = await callInternalMcpTool<T>(
    definition.rsToolName,
    withCacheOption(args, definition, options),
    options?.timeoutMs || definition.timeoutMs
  )
  return {
    data,
    route,
    rsToolName: definition.rsToolName,
    elapsedMs: Date.now() - startedAt,
    source: 'rs-mcp'
  }
}
