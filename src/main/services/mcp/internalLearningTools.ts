import type { RetrieveResult } from '../../domain/rag'
import { callInternalMcpTool } from './internalMcpClient'

export interface InternalRagStats {
  docCount: number
  chunkCount: number
}

export interface InternalRagRetrieveOptions {
  collectionId: string
  topK: number
  candidateK: number
  minScore: number
  title: string
  maxChars?: number
}

export interface InternalRagRetrieveResult {
  query: string
  count: number
  results: RetrieveResult[]
  context: string
}

export async function getInternalRagStats(collectionId: string): Promise<InternalRagStats> {
  return callInternalMcpTool<InternalRagStats>(
    'xuemate.rag.stats',
    {
      collectionId
    },
    5000
  )
}

export async function retrieveInternalRag(
  query: string,
  options: InternalRagRetrieveOptions
): Promise<InternalRagRetrieveResult> {
  return callInternalMcpTool<InternalRagRetrieveResult>(
    'xuemate.rag.retrieve',
    {
      query,
      collectionId: options.collectionId,
      topK: options.topK,
      candidateK: options.candidateK,
      minScore: options.minScore,
      useMmr: true,
      includeContext: true,
      maxChars: options.maxChars || 3600,
      title: options.title
    },
    12000
  )
}
