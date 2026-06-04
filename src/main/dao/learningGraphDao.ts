import db from '../services/db'

export interface LearningGraphCollectionRow {
  id: string
  name: string
  description: string
  created_at: number
  updated_at: number
}

export interface LearningGraphDocumentRow {
  id: string
  collection_id: string
  collection_name?: string
  file_name: string
  chunk_count: number
  created_at: number
}

export interface LearningGraphChunkRow {
  id: string
  document_id: string
  collection_id: string
  file_name: string
  content: string
  start_pos: number
  end_pos: number
  created_at: number
}

const stmts = {
  getCollection: db.prepare('SELECT * FROM collections WHERE id = ?'),
  getCollections: db.prepare('SELECT * FROM collections ORDER BY updated_at DESC'),
  getDocsAll: db.prepare(`
    SELECT d.*, c.name AS collection_name
    FROM documents d
    LEFT JOIN collections c ON c.id = d.collection_id
    ORDER BY d.created_at DESC
    LIMIT ?
  `),
  getDocsByCollection: db.prepare(`
    SELECT d.*, c.name AS collection_name
    FROM documents d
    LEFT JOIN collections c ON c.id = d.collection_id
    WHERE d.collection_id = ?
    ORDER BY d.created_at DESC
    LIMIT ?
  `),
  getChunksAll: db.prepare(`
    SELECT *
    FROM chunks
    ORDER BY created_at DESC, start_pos ASC
    LIMIT ?
  `),
  getChunksByCollection: db.prepare(`
    SELECT *
    FROM chunks
    WHERE collection_id = ?
    ORDER BY created_at DESC, start_pos ASC
    LIMIT ?
  `)
}

export function findCollectionById(id: string): LearningGraphCollectionRow | null {
  return (stmts.getCollection.get(id) as LearningGraphCollectionRow | undefined) ?? null
}

export function findCollections(): LearningGraphCollectionRow[] {
  return stmts.getCollections.all() as LearningGraphCollectionRow[]
}

export function findDocuments(limit: number): LearningGraphDocumentRow[] {
  return stmts.getDocsAll.all(limit) as LearningGraphDocumentRow[]
}

export function findDocumentsByCollection(
  collectionId: string,
  limit: number
): LearningGraphDocumentRow[] {
  return stmts.getDocsByCollection.all(collectionId, limit) as LearningGraphDocumentRow[]
}

export function findChunks(limit: number): LearningGraphChunkRow[] {
  return stmts.getChunksAll.all(limit) as LearningGraphChunkRow[]
}

export function findChunksByCollection(
  collectionId: string,
  limit: number
): LearningGraphChunkRow[] {
  return stmts.getChunksByCollection.all(collectionId, limit) as LearningGraphChunkRow[]
}
