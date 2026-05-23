import { randomUUID } from 'crypto'
import db from './db'

// ── 配置 ──

const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || ''
const EMBEDDING_BASE_URL =
  process.env.EMBEDDING_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v3'

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 50
const TOP_K = 5
const MAX_CHUNKS_PER_DOC = 2000

export const DEFAULT_COLLECTION_ID = 'default'
export const ALL_COLLECTIONS_ID = 'all'
export const RAG_OFF_ID = 'off'

// ── 类型 ──

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
}

// ── 预编译 SQL ──

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

// ── Embedding BLOB 编解码 ──

function embeddingToBlob(arr: number[]): Buffer {
  const buf = Buffer.alloc(arr.length * 4)
  for (let i = 0; i < arr.length; i++) {
    buf.writeFloatLE(arr[i], i * 4)
  }
  return buf
}

function blobToEmbedding(buf: Buffer): number[] {
  const arr: number[] = new Array(buf.length / 4)
  for (let i = 0; i < buf.length / 4; i++) {
    arr[i] = buf.readFloatLE(i * 4)
  }
  return arr
}

// ── Embedding API ──

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(EMBEDDING_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EMBEDDING_API_KEY}`
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Embedding API error: ${response.status} - ${err}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch(EMBEDDING_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EMBEDDING_API_KEY}`
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Embedding API error: ${response.status} - ${err}`)
  }

  const data = await response.json()
  return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding)
}

// ── 文本分块 ──

export function chunkText(text: string): { content: string; start: number; end: number }[] {
  const chunks: { content: string; start: number; end: number }[] = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length)

    if (end < text.length) {
      const breakChars = ['\n\n', '\n', '。', '！', '？', '；', '.', '!', '?', ';']
      let bestBreak = -1
      for (const ch of breakChars) {
        const idx = text.lastIndexOf(ch, end)
        if (idx > start + CHUNK_SIZE * 0.3) {
          bestBreak = idx + ch.length
          break
        }
      }
      if (bestBreak > start) {
        end = bestBreak
      }
    }

    const content = text.slice(start, end).trim()
    if (content.length > 0) {
      chunks.push({ content, start, end })
    }

    if (end >= text.length) break

    const nextStart = end - CHUNK_OVERLAP
    start = nextStart > start ? nextStart : end
  }

  return chunks
}

// ── 余弦相似度 ──

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return -Infinity

  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return -Infinity
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function normalizeCollectionId(collectionId?: string): string | undefined {
  if (!collectionId || collectionId === ALL_COLLECTIONS_ID) return undefined
  return collectionId
}

function assertCollection(collectionId: string): void {
  const collection = stmts.getCollection.get(collectionId)
  if (!collection) {
    throw new Error(`资料库分区不存在：${collectionId}`)
  }
}

function rowToCollection(row: any): Collection {
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

function rowToDocument(row: any): Document {
  return {
    id: row.id,
    collectionId: row.collection_id || DEFAULT_COLLECTION_ID,
    fileName: row.file_name,
    chunkCount: row.chunk_count,
    createdAt: row.created_at
  }
}

function rowToChunk(row: any): Chunk {
  return {
    id: row.id,
    docId: row.document_id,
    collectionId: row.collection_id || DEFAULT_COLLECTION_ID,
    fileName: row.file_name,
    content: row.content,
    embedding: [],
    startPos: row.start_pos,
    endPos: row.end_pos,
    createdAt: row.created_at
  }
}

// ── 公开 API ──

export function getCollections(): Collection[] {
  return (stmts.getCollections.all() as any[]).map(rowToCollection)
}

export function createCollection(name: string, description = ''): Collection {
  const normalizedName = name.trim()
  if (!normalizedName) {
    throw new Error('分区名称不能为空')
  }

  const id = randomUUID()
  const now = Date.now()
  stmts.insertCollection.run(id, normalizedName, description.trim(), now, now)
  const row = {
    id,
    name: normalizedName,
    description: description.trim(),
    doc_count: 0,
    chunk_count: 0,
    created_at: now,
    updated_at: now
  }
  return rowToCollection(row)
}

export async function importDocument(
  fileName: string,
  text: string,
  onProgress?: (msg: string) => void,
  collectionId = DEFAULT_COLLECTION_ID
): Promise<Document> {
  assertCollection(collectionId)

  // 同一个分区内防重复；不同课程/分区允许导入同名资料。
  const existing = stmts.getDocByName.get(collectionId, fileName) as any
  if (existing) {
    throw new Error(`"${fileName}" 已导入到当前分区`)
  }

  onProgress?.('正在分块...')
  const textChunks = chunkText(text)
  if (textChunks.length === 0) {
    throw new Error('文档内容为空')
  }
  if (textChunks.length > MAX_CHUNKS_PER_DOC) {
    throw new Error(
      `文档过大，切分后 ${textChunks.length} 个片段，最大支持 ${MAX_CHUNKS_PER_DOC} 个片段`
    )
  }

  const docId = randomUUID()
  const now = Date.now()

  // 分批调 Embedding
  const BATCH_SIZE = 16

  // 先异步获取所有 embedding
  const allEmbeddings: number[][] = []
  for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
    const batch = textChunks.slice(i, i + BATCH_SIZE)
    onProgress?.(`正在向量化 (${i + 1}/${textChunks.length})...`)
    const embeddings = await getEmbeddings(batch.map((c) => c.content))
    allEmbeddings.push(...embeddings)
  }

  if (allEmbeddings.length !== textChunks.length) {
    throw new Error(
      `Embedding 返回数量异常：期望 ${textChunks.length}，实际 ${allEmbeddings.length}`
    )
  }

  // 事务写入
  const insertBatch = db.transaction(() => {
    stmts.insertDoc.run(docId, collectionId, fileName, textChunks.length, now)
    for (let j = 0; j < textChunks.length; j++) {
      stmts.insertChunk.run(
        randomUUID(),
        docId,
        collectionId,
        fileName,
        textChunks[j].content,
        embeddingToBlob(allEmbeddings[j]),
        textChunks[j].start,
        textChunks[j].end,
        now
      )
    }
    stmts.touchCollection.run(now, collectionId)
  })
  insertBatch()

  console.log(
    `[RAG] 导入完成: ${fileName}, ${textChunks.length} 个 chunk, collection=${collectionId}`
  )
  return { id: docId, collectionId, fileName, chunkCount: textChunks.length, createdAt: now }
}

export async function retrieve(
  query: string,
  options: number | RetrieveOptions = TOP_K
): Promise<{ chunk: Chunk; score: number }[]> {
  const topK = typeof options === 'number' ? options : options.topK || TOP_K
  const rawCollectionId = typeof options === 'number' ? undefined : options.collectionId
  if (rawCollectionId === RAG_OFF_ID) return []

  const collectionId = normalizeCollectionId(rawCollectionId)
  if (collectionId) assertCollection(collectionId)

  const rows = (
    collectionId ? stmts.getChunksByCollection.all(collectionId) : stmts.getAllChunks.all()
  ) as any[]
  if (rows.length === 0) return []

  const queryEmbedding = await getEmbedding(query)

  const scored = rows
    .filter((row) => row.embedding)
    .map((row) => {
      const embedding = blobToEmbedding(row.embedding)
      const score = cosineSimilarity(queryEmbedding, embedding)
      return {
        chunk: rowToChunk(row),
        score
      }
    })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

export function getDocuments(collectionId?: string): Document[] {
  const normalized = normalizeCollectionId(collectionId)
  if (normalized) assertCollection(normalized)

  const rows = (
    normalized ? stmts.getDocsByCollection.all(normalized) : stmts.getDocs.all()
  ) as any[]
  return rows.map(rowToDocument)
}

export function deleteDocument(docId: string): boolean {
  const doc = stmts.getDoc.get(docId) as any
  const result = stmts.deleteDoc.run(docId)
  if (result.changes > 0) {
    stmts.deleteChunksByDoc.run(docId)
    if (doc?.collection_id) {
      stmts.touchCollection.run(Date.now(), doc.collection_id)
    }
    return true
  }
  return false
}

export function getStats(collectionId?: string): { docCount: number; chunkCount: number } {
  const normalized = normalizeCollectionId(collectionId)
  if (normalized) assertCollection(normalized)

  const { cnt } = (
    normalized ? stmts.countDocsByCollection.get(normalized) : stmts.countDocs.get()
  ) as any
  const { total } = (
    normalized ? stmts.sumChunksByCollection.get(normalized) : stmts.sumChunks.get()
  ) as any
  return { docCount: cnt, chunkCount: total }
}
