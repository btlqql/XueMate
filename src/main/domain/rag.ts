export const DEFAULT_COLLECTION_ID = 'default'
export const ALL_COLLECTIONS_ID = 'all'
export const RAG_OFF_ID = 'off'

export interface Collection {
  id: string
  name: string
  description: string
  docCount: number
  chunkCount: number
  createdAt: number
  updatedAt: number
}

export interface Chunk {
  id: string
  docId: string
  collectionId: string
  fileName: string
  content: string
  embedding: number[]
  startPos: number
  endPos: number
  createdAt: number
}

export interface Document {
  id: string
  collectionId: string
  fileName: string
  chunkCount: number
  createdAt: number
}

export interface RetrieveOptions {
  collectionId?: string
  topK?: number
  candidateK?: number
  minScore?: number
  useMmr?: boolean
}

export interface RetrieveResult {
  chunk: Chunk
  score: number
  denseScore: number
  lexicalScore: number
  structureScore: number
  diversityPenalty: number
  rankReason: string[]
}
