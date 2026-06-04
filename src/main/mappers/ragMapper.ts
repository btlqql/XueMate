import type { Chunk, Collection, Document } from '../domain/rag'
import type { ChunkRow, CollectionRow, DocumentRow } from '../dao/ragDao'
import { DEFAULT_COLLECTION_ID } from '../domain/rag'

export function embeddingToBlob(embedding: number[]): Buffer {
  const buf = Buffer.alloc(embedding.length * 4)
  for (let i = 0; i < embedding.length; i++) {
    buf.writeFloatLE(embedding[i], i * 4)
  }
  return buf
}

export function blobToEmbedding(buf: Buffer): number[] {
  const embedding: number[] = new Array(buf.length / 4)
  for (let i = 0; i < buf.length / 4; i++) {
    embedding[i] = buf.readFloatLE(i * 4)
  }
  return embedding
}

export function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    docCount: row.doc_count || 0,
    chunkCount: row.chunk_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    collectionId: row.collection_id || DEFAULT_COLLECTION_ID,
    fileName: row.file_name,
    chunkCount: row.chunk_count,
    createdAt: row.created_at
  }
}

export function rowToChunk(row: ChunkRow): Chunk {
  return {
    id: row.id,
    docId: row.document_id,
    collectionId: row.collection_id || DEFAULT_COLLECTION_ID,
    fileName: row.file_name,
    content: row.content,
    embedding: row.embedding ? blobToEmbedding(row.embedding) : [],
    startPos: row.start_pos,
    endPos: row.end_pos,
    createdAt: row.created_at
  }
}
