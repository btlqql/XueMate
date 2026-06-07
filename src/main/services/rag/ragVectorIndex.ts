import {
  findChunkEmbeddings,
  findChunkEmbeddingsByCollection,
  type ChunkEmbeddingRow
} from '../../dao/ragDao'
import { ALL_COLLECTIONS_ID, DEFAULT_COLLECTION_ID } from '../../domain/rag'
import { embeddingBlobToFloat32, normalizeFloat32InPlace } from './vectorMath'

const ALL_COLLECTIONS_CACHE_KEY = '__all_collections__'

export interface RagVectorIndexEntry {
  chunkId: string
  collectionId: string
  vector: Float32Array
  norm?: number
}

export interface RagVectorIndex {
  collectionId?: string
  entries: RagVectorIndexEntry[]
  vectors: RagVectorIndexEntry[]
  byChunkId: Map<string, RagVectorIndexEntry>
  dimension: number
  size: number
  loadedAt: number
}

const vectorIndexCache = new Map<string, RagVectorIndex>()

export function getVectorIndex(collectionId?: string): RagVectorIndex {
  const normalizedCollectionId = normalizeCollectionId(collectionId)
  const key = cacheKey(normalizedCollectionId)
  const cached = vectorIndexCache.get(key)
  if (cached) return cached

  const rows = normalizedCollectionId
    ? findChunkEmbeddingsByCollection(normalizedCollectionId)
    : findChunkEmbeddings()
  const index = buildVectorIndex(rows, normalizedCollectionId)
  vectorIndexCache.set(key, index)
  return index
}

export function invalidateVectorIndex(collectionId?: string): void {
  const normalizedCollectionId = normalizeCollectionId(collectionId)
  if (!normalizedCollectionId) {
    clearVectorIndex()
    return
  }

  vectorIndexCache.delete(cacheKey(normalizedCollectionId))
  vectorIndexCache.delete(ALL_COLLECTIONS_CACHE_KEY)
}

export function clearVectorIndex(): void {
  vectorIndexCache.clear()
}

function buildVectorIndex(
  rows: ChunkEmbeddingRow[],
  collectionId: string | undefined
): RagVectorIndex {
  const entries: RagVectorIndexEntry[] = []

  for (const row of rows) {
    if (!row.embedding) continue

    const vector = embeddingBlobToFloat32(row.embedding, { copy: true })
    if (vector.length === 0) continue

    const norm = vectorNorm(vector)
    if (norm > 0 && Number.isFinite(norm)) {
      normalizeFloat32InPlace(vector)
    }

    entries.push({
      chunkId: row.id,
      collectionId: row.collection_id || DEFAULT_COLLECTION_ID,
      vector,
      norm
    })
  }

  return {
    collectionId,
    entries,
    vectors: entries,
    byChunkId: new Map(entries.map((entry) => [entry.chunkId, entry])),
    dimension: entries[0]?.vector.length ?? 0,
    size: entries.length,
    loadedAt: Date.now()
  }
}

function normalizeCollectionId(collectionId?: string): string | undefined {
  if (!collectionId || collectionId === ALL_COLLECTIONS_ID) return undefined
  return collectionId
}

function cacheKey(collectionId?: string): string {
  return collectionId || ALL_COLLECTIONS_CACHE_KEY
}

function vectorNorm(vector: Float32Array): number {
  let sum = 0
  for (let i = 0; i < vector.length; i++) {
    sum += vector[i] * vector[i]
  }
  return Math.sqrt(sum)
}
