import { randomUUID } from 'crypto'
import * as ragDao from '../dao/ragDao'
import type { Chunk, Collection, Document, RetrieveOptions, RetrieveResult } from '../domain/rag'
import { ALL_COLLECTIONS_ID, DEFAULT_COLLECTION_ID, RAG_OFF_ID } from '../domain/rag'
import { rowToChunk, rowToCollection, rowToDocument } from '../mappers/ragMapper'
import { clearBridgeCache } from './bridgeCache'
import { getCachedQueryEmbedding } from './ragQueryCache'
import { getVectorIndex, invalidateVectorIndex } from './ragVectorIndex'
import { dotProduct, float32ToEmbeddingBlob, normalizeVector } from './vectorMath'

export type { Chunk, Collection, Document, RetrieveOptions, RetrieveResult } from '../domain/rag'
export { ALL_COLLECTIONS_ID, DEFAULT_COLLECTION_ID, RAG_OFF_ID } from '../domain/rag'

// ── 配置 ──

const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || ''
const EMBEDDING_BASE_URL =
  process.env.EMBEDDING_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v3'

const CHUNK_MIN_SIZE = 260
const CHUNK_SIZE = 620
const CHUNK_OVERLAP = 80
const TOP_K = 5
const MAX_CHUNKS_PER_DOC = 2000
const RETRIEVAL_POOL_SIZE = 40
const MMR_LAMBDA = 0.74
const MAX_CONTEXT_CHARS = 3600

const HYBRID_WEIGHTS = {
  dense: 0.62,
  lexical: 0.28,
  structure: 0.1
}

const LEXICAL_ONLY_WEIGHTS = {
  dense: 0,
  lexical: 0.76,
  structure: 0.24
}

// ── Embedding API ──

export async function getEmbedding(text: string): Promise<number[]> {
  assertEmbeddingConfigured()
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
  const embedding = data?.data?.[0]?.embedding
  if (!isEmbeddingVector(embedding)) {
    throw new Error('Embedding API 返回格式异常：没有可用的向量数据')
  }
  return embedding
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  assertEmbeddingConfigured()
  if (texts.length === 0) return []

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
  const items = data?.data
  if (!Array.isArray(items)) {
    throw new Error('Embedding API 返回格式异常：data 不是数组')
  }

  const embeddings = items
    .slice()
    .sort((a: any, b: any) => Number(a?.index || 0) - Number(b?.index || 0))
    .map((item: any) => item?.embedding)

  if (embeddings.length !== texts.length || embeddings.some((item) => !isEmbeddingVector(item))) {
    throw new Error(
      `Embedding API 返回数量或格式异常：期望 ${texts.length} 个向量，实际 ${embeddings.length} 个`
    )
  }
  return embeddings
}

function assertEmbeddingConfigured(): void {
  if (!EMBEDDING_API_KEY || /^your_/i.test(EMBEDDING_API_KEY)) {
    throw new Error('缺少 EMBEDDING_API_KEY，请先在 .env 中配置向量模型密钥后再导入资料')
  }
}

function isEmbeddingVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => Number.isFinite(item))
}

// ── 文本分块 ──

export function chunkText(text: string): { content: string; start: number; end: number }[] {
  const normalizedText = normalizeDocumentText(text)
  const chunks: { content: string; start: number; end: number }[] = []
  let start = 0

  while (start < normalizedText.length) {
    let end = Math.min(start + CHUNK_SIZE, normalizedText.length)

    if (end < normalizedText.length) {
      const breakChars = ['\n\n', '\n', '。', '！', '？', '；', '：', '.', '!', '?', ';', ':']
      let bestBreak = -1
      for (const ch of breakChars) {
        const idx = normalizedText.lastIndexOf(ch, end)
        if (idx > start + CHUNK_SIZE * 0.3) {
          bestBreak = idx + ch.length
          break
        }
      }
      if (bestBreak > start) {
        end = bestBreak
      }
    }

    const rawContent = normalizedText.slice(start, end).trim()
    const sectionTitle = inferSectionTitle(normalizedText, start)
    const content =
      sectionTitle && !rawContent.includes(sectionTitle)
        ? `【章节】${sectionTitle}\n${rawContent}`
        : rawContent
    if (content.length > 0) {
      chunks.push({ content, start, end })
    }

    if (end >= normalizedText.length) break

    const nextStart = end - CHUNK_OVERLAP
    start = nextStart > start ? nextStart : end
  }

  return mergeSmallChunks(chunks)
}

function normalizeDocumentText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function inferSectionTitle(text: string, start: number): string {
  const before = text.slice(Math.max(0, start - 1400), start)
  const lines = before
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-16)
    .reverse()

  for (const line of lines) {
    const cleaned = line.replace(/^#+\s*/, '').replace(/^[一二三四五六七八九十\d]+[、.)．]\s*/, '')
    if (
      cleaned.length >= 2 &&
      cleaned.length <= 48 &&
      (/^(第.+[章节课]|[一二三四五六七八九十\d]+[、.．])/.test(line) ||
        /^#+\s+/.test(line) ||
        /目标|重点|难点|概念|公式|步骤|例题|练习|总结|作业|实验|方法/.test(cleaned))
    ) {
      return cleaned.slice(0, 48)
    }
  }
  return ''
}

function mergeSmallChunks(
  chunks: { content: string; start: number; end: number }[]
): { content: string; start: number; end: number }[] {
  const merged: { content: string; start: number; end: number }[] = []
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1]
    if (prev && (chunk.content.length < CHUNK_MIN_SIZE || prev.content.length < CHUNK_MIN_SIZE)) {
      const combined = `${prev.content}\n${chunk.content}`.trim()
      if (combined.length <= CHUNK_SIZE + CHUNK_OVERLAP * 2) {
        prev.content = combined
        prev.end = chunk.end
        continue
      }
    }
    merged.push({ ...chunk })
  }
  return merged
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function tokenizeForSearch(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .trim()
  const tokens: string[] = []

  for (const token of normalized.split(/\s+/).filter(Boolean)) {
    if (/[\u4e00-\u9fff]/.test(token)) {
      const chars = Array.from(token)
      if (chars.length <= 2) {
        tokens.push(token)
      } else {
        for (let i = 0; i < chars.length - 1; i++) tokens.push(chars.slice(i, i + 2).join(''))
        for (let i = 0; i < chars.length - 2; i++) tokens.push(chars.slice(i, i + 3).join(''))
      }
    } else if (token.length >= 2) {
      tokens.push(token)
    }
  }

  return unique(tokens).filter(
    (token) =>
      token.length >= 2 &&
      !['这个', '那个', '什么', '如何', '怎么', '请问', '帮我', '一下', '资料'].includes(token)
  )
}

function keywordTerms(text: string): string[] {
  return tokenizeForSearch(text)
    .filter((token) => token.length >= 2)
    .slice(0, 16)
}

function lexicalScore(queryTokens: string[], content: string): number {
  if (queryTokens.length === 0) return 0
  const contentText = content.toLowerCase()
  const contentTokens = new Set(tokenizeForSearch(contentText))
  let weightedHits = 0
  let maxWeight = 0

  for (const token of queryTokens) {
    const weight = Math.min(2.2, 0.7 + token.length / 4)
    maxWeight += weight
    if (contentTokens.has(token) || contentText.includes(token)) {
      weightedHits += weight
    }
  }

  const coverage = weightedHits / Math.max(maxWeight, 1)
  const density =
    queryTokens.filter((token) => contentText.includes(token)).length / queryTokens.length
  return clamp01(coverage * 0.75 + density * 0.25)
}

function structureScore(queryTokens: string[], chunk: Chunk): number {
  const fileName = chunk.fileName.toLowerCase()
  const firstLine = chunk.content.split('\n')[0]?.toLowerCase() || ''
  const head = chunk.content.slice(0, 180).toLowerCase()
  let score = 0

  for (const token of queryTokens) {
    if (fileName.includes(token)) score += 0.18
    if (firstLine.includes(token)) score += 0.12
    if (head.includes(token)) score += 0.06
  }

  if (
    /【章节】|第.+[章节课]|目标|重点|难点|公式|步骤|例题|练习/.test(chunk.content.slice(0, 120))
  ) {
    score += 0.18
  }
  if (chunk.startPos < 1200) score += 0.08
  if (chunk.content.length >= 180 && chunk.content.length <= 900) score += 0.08

  return clamp01(score)
}

function explainRank(
  denseScore: number,
  lexical: number,
  structure: number,
  diversityPenalty: number
): string[] {
  const reasons: string[] = []
  if (denseScore >= 0.72) reasons.push('语义相似度高')
  else if (denseScore >= 0.58) reasons.push('语义相关')
  if (lexical >= 0.45) reasons.push('关键词覆盖好')
  if (structure >= 0.25) reasons.push('章节/文件名命中')
  if (diversityPenalty > 0.08) reasons.push('与已选片段相近，已做去重降权')
  if (reasons.length === 0) reasons.push('综合得分入选')
  return reasons
}

function lexicalSimilarity(a: string, b: string): number {
  const setA = new Set(tokenizeForSearch(a))
  const setB = new Set(tokenizeForSearch(b))
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection++
  }
  return intersection / (setA.size + setB.size - intersection)
}

function chunkDiversitySimilarity(a: Chunk, b: Chunk): number {
  const lexical = lexicalSimilarity(a.content, b.content)
  const sameDoc = a.docId === b.docId ? 0.12 : 0
  const nearPosition =
    a.docId === b.docId && Math.abs(a.startPos - b.startPos) < CHUNK_SIZE * 1.5 ? 0.2 : 0
  return clamp01(lexical + sameDoc + nearPosition)
}

function normalizeCollectionId(collectionId?: string): string | undefined {
  if (!collectionId || collectionId === ALL_COLLECTIONS_ID) return undefined
  return collectionId
}

function queryEmbeddingCacheKey(query: string): string {
  return JSON.stringify([
    'rag-query-embedding-v1',
    EMBEDDING_BASE_URL,
    EMBEDDING_MODEL,
    query.trim()
  ])
}

function assertCollection(collectionId: string): void {
  const collection = ragDao.findCollectionById(collectionId)
  if (!collection) {
    throw new Error(`资料库分区不存在：${collectionId}`)
  }
}

// ── 公开 API ──

export function getCollections(): Collection[] {
  return ragDao.findCollectionsWithStats().map(rowToCollection)
}

export function createCollection(name: string, description = ''): Collection {
  const normalizedName = name.trim()
  if (!normalizedName) {
    throw new Error('分区名称不能为空')
  }

  const id = randomUUID()
  const now = Date.now()
  ragDao.insertCollection({
    id,
    name: normalizedName,
    description: description.trim(),
    created_at: now,
    updated_at: now
  })
  const row = {
    id,
    name: normalizedName,
    description: description.trim(),
    doc_count: 0,
    chunk_count: 0,
    created_at: now,
    updated_at: now
  }
  clearBridgeCache('rag:createCollection')
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
  const existing = ragDao.findDocumentByCollectionAndName(collectionId, fileName)
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
  ragDao.insertDocumentWithChunks(
    {
      id: docId,
      collection_id: collectionId,
      file_name: fileName,
      chunk_count: textChunks.length,
      created_at: now
    },
    textChunks.map((chunk, index) => ({
      id: randomUUID(),
      document_id: docId,
      collection_id: collectionId,
      file_name: fileName,
      content: chunk.content,
      embedding: float32ToEmbeddingBlob(normalizeVector(allEmbeddings[index])),
      start_pos: chunk.start,
      end_pos: chunk.end,
      created_at: now
    }))
  )

  invalidateVectorIndex(collectionId)
  clearBridgeCache('rag:importDocument')
  console.log(
    `[RAG] 导入完成: ${fileName}, ${textChunks.length} 个 chunk, collection=${collectionId}`
  )
  return { id: docId, collectionId, fileName, chunkCount: textChunks.length, createdAt: now }
}

export async function retrieve(
  query: string,
  options: number | RetrieveOptions = TOP_K
): Promise<RetrieveResult[]> {
  const topK = typeof options === 'number' ? options : options.topK || TOP_K
  const candidateK =
    typeof options === 'number'
      ? Math.max(RETRIEVAL_POOL_SIZE, topK * 6)
      : options.candidateK || Math.max(RETRIEVAL_POOL_SIZE, topK * 6)
  const minScore = typeof options === 'number' ? 0.18 : (options.minScore ?? 0.18)
  const useMmr = typeof options === 'number' ? true : options.useMmr !== false
  const rawCollectionId = typeof options === 'number' ? undefined : options.collectionId
  if (rawCollectionId === RAG_OFF_ID) return []

  const collectionId = normalizeCollectionId(rawCollectionId)
  if (collectionId) assertCollection(collectionId)

  const queryTokens = keywordTerms(query)
  let queryEmbedding: number[] | null = null
  let weights = HYBRID_WEIGHTS

  try {
    queryEmbedding =
      typeof options !== 'number' && options.noCache
        ? await getEmbedding(query)
        : await getCachedQueryEmbedding(queryEmbeddingCacheKey(query), () => getEmbedding(query))
  } catch (error: any) {
    console.warn('[RAG] dense embedding 失败，降级到 bounded lexical 检索:', error.message)
    weights = LEXICAL_ONLY_WEIGHTS
  }

  const denseScores = queryEmbedding ? scoreChunkEmbeddings(queryEmbedding, collectionId) : null
  const fullRows = denseScores
    ? ragDao.findChunksByIds(denseScores.rankedIds.slice(0, Math.max(candidateK * 3, topK * 12)))
    : ragDao.findChunksByKeywordTerms(
        queryTokens,
        collectionId,
        Math.max(candidateK * 8, RETRIEVAL_POOL_SIZE * 4)
      )

  if (fullRows.length === 0) return []

  const denseByChunkId = denseScores?.denseByChunkId || new Map<string, number>()

  const scored: RetrieveResult[] = fullRows
    .filter((row) => row.embedding)
    .map((row) => {
      const chunk = rowToChunk(row)
      const denseScore = queryEmbedding ? denseByChunkId.get(row.id) || 0 : 0
      const lexical = lexicalScore(queryTokens, chunk.content)
      const structure = structureScore(queryTokens, chunk)
      const score = clamp01(
        denseScore * weights.dense + lexical * weights.lexical + structure * weights.structure
      )
      return {
        chunk,
        score,
        denseScore,
        lexicalScore: lexical,
        structureScore: structure,
        diversityPenalty: 0,
        rankReason: explainRank(denseScore, lexical, structure, 0)
      }
    })
    .filter((item) => item.score >= minScore || item.lexicalScore >= 0.2)

  scored.sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, Math.max(candidateK, topK))

  if (!useMmr) {
    return candidates.slice(0, topK)
  }

  const selected: RetrieveResult[] = []
  const remaining = [...candidates]
  while (selected.length < topK && remaining.length > 0) {
    let bestIndex = 0
    let bestMmr = -Infinity
    let bestPenalty = 0

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      const diversityPenalty =
        selected.length === 0
          ? 0
          : Math.max(
              ...selected.map((item) => chunkDiversitySimilarity(candidate.chunk, item.chunk))
            )
      const mmrScore = MMR_LAMBDA * candidate.score - (1 - MMR_LAMBDA) * diversityPenalty
      if (mmrScore > bestMmr) {
        bestMmr = mmrScore
        bestIndex = i
        bestPenalty = diversityPenalty
      }
    }

    const [picked] = remaining.splice(bestIndex, 1)
    picked.diversityPenalty = bestPenalty
    picked.score = clamp01(picked.score - bestPenalty * 0.08)
    picked.rankReason = explainRank(
      picked.denseScore,
      picked.lexicalScore,
      picked.structureScore,
      picked.diversityPenalty
    )
    selected.push(picked)
  }

  return selected
}

function scoreChunkEmbeddings(
  queryEmbedding: number[],
  collectionId: string | undefined
): { denseByChunkId: Map<string, number>; rankedIds: string[] } {
  const queryVector = normalizeVector(queryEmbedding)
  const index = getVectorIndex(collectionId)

  const scored = index.entries
    .map((entry) => {
      const denseRaw = dotProduct(queryVector, entry.vector)
      return {
        id: entry.chunkId,
        denseScore: clamp01((denseRaw + 1) / 2)
      }
    })
    .sort((a, b) => b.denseScore - a.denseScore)

  return {
    denseByChunkId: new Map(scored.map((item) => [item.id, item.denseScore])),
    rankedIds: scored.map((item) => item.id)
  }
}

export function buildRagContext(
  results: RetrieveResult[],
  options: { maxChars?: number; title?: string } = {}
): string {
  if (results.length === 0) return ''

  const maxChars = options.maxChars || MAX_CONTEXT_CHARS
  const title = options.title || '以下是用户课程资料中的相关内容'
  let usedChars = 0
  const blocks: string[] = []
  const citations: string[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const citationId = `资料${i + 1}`
    const budgetLeft = maxChars - usedChars
    if (budgetLeft < 220) break

    const clipped = result.chunk.content.slice(0, Math.min(1100, budgetLeft))
    usedChars += clipped.length
    citations.push(
      `${citationId}: ${result.chunk.fileName} / 综合${Math.round(result.score * 100)} / 语义${Math.round(
        result.denseScore * 100
      )} / 词面${Math.round(result.lexicalScore * 100)}`
    )
    blocks.push(
      `[${citationId}] 来源: ${result.chunk.fileName}\n` +
        `综合相关度: ${Math.round(result.score * 100)}%; ` +
        `入选原因: ${result.rankReason.join('、')}\n` +
        `位置: ${result.chunk.startPos}-${result.chunk.endPos}\n` +
        `${clipped}`
    )
  }

  return (
    `\n\n${title}（已用混合检索 + MMR 去重筛选，回答时请标注 [资料1] 这种引用）：\n` +
    blocks.join('\n\n---\n\n') +
    `\n\n引用索引：\n${citations.join('\n')}` +
    '\n\n请优先基于以上资料回答；如果资料不足，请明确说“资料里没有直接说明”，再补充通用知识。'
  )
}

export function getDocuments(collectionId?: string): Document[] {
  const normalized = normalizeCollectionId(collectionId)
  if (normalized) assertCollection(normalized)

  const rows = (
    normalized ? ragDao.findDocumentsByCollection(normalized) : ragDao.findDocuments()
  ) as any[]
  return rows.map(rowToDocument)
}

export function deleteDocument(docId: string): boolean {
  const doc = ragDao.findDocumentById(docId)
  const deletedCount = ragDao.deleteDocumentById(docId)
  if (deletedCount <= 0) return false

  ragDao.deleteChunksByDocumentId(docId)
  if (doc?.collection_id) {
    ragDao.touchCollection(doc.collection_id, Date.now())
    invalidateVectorIndex(doc.collection_id)
  } else {
    invalidateVectorIndex()
  }
  clearBridgeCache('rag:deleteDocument')
  return true
}

export function getStats(collectionId?: string): { docCount: number; chunkCount: number } {
  const normalized = normalizeCollectionId(collectionId)
  if (normalized) assertCollection(normalized)

  return {
    docCount: ragDao.countDocuments(normalized),
    chunkCount: ragDao.sumDocumentChunks(normalized)
  }
}
