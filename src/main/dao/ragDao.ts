import db from '../services/infrastructure/db'

export interface CollectionRow {
  id: string
  name: string
  description: string
  doc_count?: number
  chunk_count?: number
  created_at: number
  updated_at: number
}

export interface DocumentRow {
  id: string
  collection_id?: string
  file_name: string
  chunk_count: number
  created_at: number
}

export interface ChunkEmbeddingRow {
  id: string
  document_id: string
  collection_id?: string
  file_name: string
  embedding?: Buffer | null
  start_pos: number
  end_pos: number
  created_at: number
}

export interface ChunkRow {
  id: string
  document_id: string
  collection_id?: string
  file_name: string
  content: string
  embedding?: Buffer | null
  start_pos: number
  end_pos: number
  created_at: number
}

export interface InsertDocumentRow {
  id: string
  collection_id: string
  file_name: string
  chunk_count: number
  created_at: number
}

export interface InsertChunkRow {
  id: string
  document_id: string
  collection_id: string
  file_name: string
  content: string
  embedding: Buffer
  start_pos: number
  end_pos: number
  created_at: number
}

const stmts = {
  insertCollection: db.prepare(
    `INSERT INTO collections (id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ),
  getCollection: db.prepare('SELECT * FROM collections WHERE id = ?'),
  getCollections: db.prepare(`
    SELECT
      c.*,
      COUNT(d.id) AS doc_count,
      COALESCE(SUM(d.chunk_count), 0) AS chunk_count
    FROM collections c
    LEFT JOIN documents d ON d.collection_id = c.id
    GROUP BY c.id
    ORDER BY CASE WHEN c.id = 'default' THEN 0 ELSE 1 END, c.updated_at DESC
  `),
  touchCollection: db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?'),
  insertDoc: db.prepare(
    `INSERT INTO documents (id, collection_id, file_name, chunk_count, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ),
  getDocs: db.prepare('SELECT * FROM documents ORDER BY created_at DESC'),
  getDocsByCollection: db.prepare(
    'SELECT * FROM documents WHERE collection_id = ? ORDER BY created_at DESC'
  ),
  getDoc: db.prepare('SELECT * FROM documents WHERE id = ?'),
  getDocByName: db.prepare('SELECT * FROM documents WHERE collection_id = ? AND file_name = ?'),
  deleteDoc: db.prepare('DELETE FROM documents WHERE id = ?'),
  deleteChunksByDoc: db.prepare('DELETE FROM chunks WHERE document_id = ?'),
  insertChunk: db.prepare(
    `INSERT INTO chunks (id, document_id, collection_id, file_name, content, embedding, start_pos, end_pos, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  getAllChunkEmbeddings: db.prepare(
    'SELECT id, document_id, collection_id, file_name, embedding, start_pos, end_pos, created_at FROM chunks WHERE embedding IS NOT NULL'
  ),
  getChunkEmbeddingsByCollection: db.prepare(
    'SELECT id, document_id, collection_id, file_name, embedding, start_pos, end_pos, created_at FROM chunks WHERE collection_id = ? AND embedding IS NOT NULL'
  ),
  getAllChunks: db.prepare('SELECT * FROM chunks'),
  getChunksByCollection: db.prepare('SELECT * FROM chunks WHERE collection_id = ?'),
  countDocs: db.prepare('SELECT COUNT(*) as cnt FROM documents'),
  countDocsByCollection: db.prepare(
    'SELECT COUNT(*) as cnt FROM documents WHERE collection_id = ?'
  ),
  sumChunks: db.prepare('SELECT COALESCE(SUM(chunk_count), 0) as total FROM documents'),
  sumChunksByCollection: db.prepare(
    'SELECT COALESCE(SUM(chunk_count), 0) as total FROM documents WHERE collection_id = ?'
  )
}

const insertDocumentWithChunksTx = db.transaction(
  (document: InsertDocumentRow, chunks: InsertChunkRow[]) => {
    stmts.insertDoc.run(
      document.id,
      document.collection_id,
      document.file_name,
      document.chunk_count,
      document.created_at
    )

    for (const chunk of chunks) {
      stmts.insertChunk.run(
        chunk.id,
        chunk.document_id,
        chunk.collection_id,
        chunk.file_name,
        chunk.content,
        chunk.embedding,
        chunk.start_pos,
        chunk.end_pos,
        chunk.created_at
      )
    }

    stmts.touchCollection.run(document.created_at, document.collection_id)
  }
)

export function insertCollection(row: CollectionRow): void {
  stmts.insertCollection.run(row.id, row.name, row.description, row.created_at, row.updated_at)
}

export function findCollectionById(id: string): CollectionRow | null {
  return (stmts.getCollection.get(id) as CollectionRow | undefined) ?? null
}

export function findCollectionsWithStats(): CollectionRow[] {
  return stmts.getCollections.all() as CollectionRow[]
}

export function touchCollection(id: string, updatedAt: number): number {
  const result = stmts.touchCollection.run(updatedAt, id)
  return result.changes
}

export function findDocumentByCollectionAndName(
  collectionId: string,
  fileName: string
): DocumentRow | null {
  return (stmts.getDocByName.get(collectionId, fileName) as DocumentRow | undefined) ?? null
}

export function insertDocumentWithChunks(
  document: InsertDocumentRow,
  chunks: InsertChunkRow[]
): void {
  insertDocumentWithChunksTx(document, chunks)
}

export function findAllChunks(): ChunkRow[] {
  return stmts.getAllChunks.all() as ChunkRow[]
}

export function findChunksByCollection(collectionId: string): ChunkRow[] {
  return stmts.getChunksByCollection.all(collectionId) as ChunkRow[]
}

export function findChunkEmbeddings(): ChunkEmbeddingRow[] {
  return stmts.getAllChunkEmbeddings.all() as ChunkEmbeddingRow[]
}

export function findChunkEmbeddingsByCollection(collectionId: string): ChunkEmbeddingRow[] {
  return stmts.getChunkEmbeddingsByCollection.all(collectionId) as ChunkEmbeddingRow[]
}

export function findChunksByIds(ids: string[]): ChunkRow[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT * FROM chunks WHERE id IN (${placeholders})`)
    .all(...ids) as ChunkRow[]
  const rank = new Map(ids.map((id, index) => [id, index]))
  return rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
}

export function findRecentChunks(collectionId: string | undefined, limit: number): ChunkRow[] {
  if (collectionId) {
    return db
      .prepare(
        'SELECT * FROM chunks WHERE collection_id = ? ORDER BY created_at DESC, start_pos ASC LIMIT ?'
      )
      .all(collectionId, limit) as ChunkRow[]
  }
  return db
    .prepare('SELECT * FROM chunks ORDER BY created_at DESC, start_pos ASC LIMIT ?')
    .all(limit) as ChunkRow[]
}

export function findChunksByKeywordTerms(
  terms: string[],
  collectionId: string | undefined,
  limit: number
): ChunkRow[] {
  const normalizedTerms = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 8)
  if (normalizedTerms.length === 0) return findRecentChunks(collectionId, limit)

  const clauses = normalizedTerms.map(() => '(content LIKE ? OR file_name LIKE ?)').join(' OR ')
  const params = normalizedTerms.flatMap((term) => [`%${term}%`, `%${term}%`])

  if (collectionId) {
    return db
      .prepare(
        `SELECT * FROM chunks WHERE collection_id = ? AND (${clauses}) ORDER BY created_at DESC, start_pos ASC LIMIT ?`
      )
      .all(collectionId, ...params, limit) as ChunkRow[]
  }

  return db
    .prepare(
      `SELECT * FROM chunks WHERE ${clauses} ORDER BY created_at DESC, start_pos ASC LIMIT ?`
    )
    .all(...params, limit) as ChunkRow[]
}

export function findDocuments(): DocumentRow[] {
  return stmts.getDocs.all() as DocumentRow[]
}

export function findDocumentsByCollection(collectionId: string): DocumentRow[] {
  return stmts.getDocsByCollection.all(collectionId) as DocumentRow[]
}

export function findDocumentById(id: string): DocumentRow | null {
  return (stmts.getDoc.get(id) as DocumentRow | undefined) ?? null
}

export function deleteDocumentById(id: string): number {
  const result = stmts.deleteDoc.run(id)
  return result.changes
}

export function deleteChunksByDocumentId(documentId: string): number {
  const result = stmts.deleteChunksByDoc.run(documentId)
  return result.changes
}

export function countDocuments(collectionId?: string): number {
  const row = (
    collectionId ? stmts.countDocsByCollection.get(collectionId) : stmts.countDocs.get()
  ) as { cnt: number }
  return row.cnt
}

export function sumDocumentChunks(collectionId?: string): number {
  const row = (
    collectionId ? stmts.sumChunksByCollection.get(collectionId) : stmts.sumChunks.get()
  ) as { total: number }
  return row.total
}
