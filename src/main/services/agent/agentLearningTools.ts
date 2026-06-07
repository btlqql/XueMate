import * as rag from '../rag/rag'
import type { RetrieveResult } from '../../domain/rag'
import { callAgentToolViaRs } from './agentToolMapper'

export interface AgentRagContextOptions {
  collectionId: string
  topK: number
  candidateK: number
  minScore: number
  minInjectScore: number
  title: string
  maxChars?: number
}

export interface AgentRagContextResult {
  context: string
  localCount: number
  localTopScore: number
  source: 'mcp' | 'direct' | 'off' | 'empty'
}

interface AgentRagStats {
  docCount: number
  chunkCount: number
}

interface AgentRagRetrieveResult {
  query: string
  count: number
  results: RetrieveResult[]
  context: string
}

function internalMcpAgentEnabled(): boolean {
  return process.env.XUEMATE_INTERNAL_MCP !== 'off'
}

function emptyRagContext(source: AgentRagContextResult['source']): AgentRagContextResult {
  return {
    context: '',
    localCount: 0,
    localTopScore: 0,
    source
  }
}

async function retrieveViaMcp(
  query: string,
  options: AgentRagContextOptions
): Promise<AgentRagContextResult> {
  const statsResult = await callAgentToolViaRs<AgentRagStats>('rag.stats', {
    collectionId: options.collectionId
  })
  const stats = statsResult.data
  if (stats.chunkCount <= 0) return emptyRagContext('empty')

  const retrieveResult = await callAgentToolViaRs<AgentRagRetrieveResult>('rag.retrieve', {
    query,
    collectionId: options.collectionId,
    topK: options.topK,
    candidateK: options.candidateK,
    minScore: options.minScore,
    useMmr: true,
    includeContext: true,
    maxChars: options.maxChars || 3600,
    title: options.title
  })
  const mcpResult = retrieveResult.data
  const localTopScore = mcpResult.results[0]?.score || 0
  return {
    context:
      mcpResult.results.length > 0 && localTopScore > options.minInjectScore
        ? mcpResult.context
        : '',
    localCount: mcpResult.results.length,
    localTopScore,
    source: 'mcp'
  }
}

async function retrieveViaDirect(
  query: string,
  options: AgentRagContextOptions
): Promise<AgentRagContextResult> {
  const stats = rag.getStats(options.collectionId)
  if (stats.chunkCount <= 0) return emptyRagContext('empty')

  const results = await rag.retrieve(query, {
    topK: options.topK,
    candidateK: options.candidateK,
    minScore: options.minScore,
    collectionId: options.collectionId
  })
  const localTopScore = results[0]?.score || 0
  return {
    context:
      results.length > 0 && localTopScore > options.minInjectScore
        ? rag.buildRagContext(results, { title: options.title })
        : '',
    localCount: results.length,
    localTopScore,
    source: 'direct'
  }
}

export async function buildAgentRagContext(
  query: string,
  options: AgentRagContextOptions
): Promise<AgentRagContextResult> {
  if (options.collectionId === rag.RAG_OFF_ID) return emptyRagContext('off')

  if (internalMcpAgentEnabled()) {
    try {
      return await retrieveViaMcp(query, options)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[InternalMCP] agent RAG fallback direct: ${message}`)
    }
  }

  try {
    return await retrieveViaDirect(query, options)
  } catch (error) {
    console.error('[RAG] agent RAG retrieve failed:', error)
    return emptyRagContext('empty')
  }
}
