import { getMemory, type MemoryAtom } from './memory'
import { ALL_COLLECTIONS_ID, RAG_OFF_ID } from '../domain/rag'
import type {
  LearningGraphData,
  LearningGraphEdge,
  LearningGraphEdgeType,
  LearningGraphNode,
  LearningGraphNodeType
} from '../domain/learningGraph'
import * as learningGraphDao from '../dao/learningGraphDao'
import type {
  LearningGraphChunkRow,
  LearningGraphCollectionRow,
  LearningGraphDocumentRow
} from '../dao/learningGraphDao'

export type {
  LearningGraphData,
  LearningGraphEdge,
  LearningGraphEdgeType,
  LearningGraphNode,
  LearningGraphNodeType
} from '../domain/learningGraph'

interface ConceptRule {
  id: string
  label: string
  subject: string
  aliases?: string[]
  source: 'content' | 'title' | 'memory' | 'fallback'
  confidence: number
}

interface ConceptExtractOptions {
  fileName?: string
  collectionName?: string
  maxTerms?: number
}

interface ConceptEvidenceRef {
  documentId: string
  collectionId: string
  collectionName?: string
  fileName: string
  chunkId: string
  startPos: number
  endPos: number
  snippet: string
}

const MAX_DOC_NODES = 32
const MAX_CHUNK_SCAN = 420
const MAX_CHUNK_NODES = 42
const MAX_CONCEPT_NODES = 42
const MAX_MEMORY_NODES = 28
const MAX_REVIEW_NODES = 14

const englishStopWords = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'into',
  'your',
  'their',
  'about',
  'of',
  'is',
  'using',
  'use',
  'can',
  'should',
  'will',
  'todo',
  'note',
  'notes',
  'version',
  'final',
  'demo',
  'page',
  'file',
  'data',
  'text',
  'true',
  'false',
  'null',
  'undefined',
  'xuemate'
])

const chineseStopWords = new Set([
  '我们',
  '你们',
  '他们',
  '这个',
  '那个',
  '这些',
  '那些',
  '可以',
  '需要',
  '进行',
  '通过',
  '如果',
  '然后',
  '因为',
  '所以',
  '以及',
  '包括',
  '一个',
  '一些',
  '内容',
  '资料',
  '演示',
  '文档',
  '文件',
  '学生',
  '老师',
  '学习',
  '课程',
  '课堂',
  '作业',
  '问题',
  '方法',
  '步骤',
  '说明',
  '要求',
  '系统',
  '平台',
  '功能',
  '支持',
  '展示',
  '核心',
  '核心展示',
  '重制版',
  '视觉',
  '增强版',
  '视觉增强版',
  '目录',
  '时候',
  '里面',
  '这里',
  '那里',
  '原来',
  '现在',
  '好处',
  '启动',
  '定位',
  '界面',
  '页面',
  '入口',
  '模块',
  '逻辑',
  '状态',
  '结果',
  '输入',
  '输出',
  '刷新',
  '打开',
  '关闭',
  '点击',
  '查看',
  '生成',
  '整理',
  '关联',
  '自动',
  '默认',
  '当前',
  '全部',
  '等于'
])

function normalizeCollectionId(collectionId?: string): string | null {
  if (!collectionId || collectionId === ALL_COLLECTIONS_ID) return null
  if (collectionId === RAG_OFF_ID) return RAG_OFF_ID
  return collectionId
}

function safeText(value: string, max = 120): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function stripExt(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

function nodeId(type: LearningGraphNodeType, raw: string): string {
  return `${type}:${raw.replace(/[^a-z0-9\u4e00-\u9fff_-]+/gi, '-').slice(0, 96)}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getCollectionName(collectionId?: string): string {
  const normalized = normalizeCollectionId(collectionId)
  if (!normalized) return '全部资料'
  if (normalized === RAG_OFF_ID) return '未使用资料'
  const row = learningGraphDao.findCollectionById(normalized)
  return row?.name || '当前资料夹'
}

function getCollectionsForGraph(collectionId?: string): LearningGraphCollectionRow[] {
  const normalized = normalizeCollectionId(collectionId)
  if (normalized === RAG_OFF_ID) return []
  if (normalized) {
    const row = learningGraphDao.findCollectionById(normalized)
    return row ? [row] : []
  }
  return learningGraphDao.findCollections()
}

function getDocsForGraph(collectionId?: string): LearningGraphDocumentRow[] {
  const normalized = normalizeCollectionId(collectionId)
  if (normalized === RAG_OFF_ID) return []
  return normalized
    ? learningGraphDao.findDocumentsByCollection(normalized, MAX_DOC_NODES)
    : learningGraphDao.findDocuments(MAX_DOC_NODES)
}

function getChunksForGraph(collectionId?: string): LearningGraphChunkRow[] {
  const normalized = normalizeCollectionId(collectionId)
  if (normalized === RAG_OFF_ID) return []
  return normalized
    ? learningGraphDao.findChunksByCollection(normalized, MAX_CHUNK_SCAN)
    : learningGraphDao.findChunks(MAX_CHUNK_SCAN)
}

function normalizeConceptLabel(value: string): string {
  return safeText(value.replace(/[_-]+/g, ' '), 36)
    .replace(/^[\s:：,，.。/|]+|[\s:：,，.。/|]+$/g, '')
    .trim()
}

function conceptKey(label: string): string {
  return normalizeConceptLabel(label).toLowerCase().replace(/\s+/g, '-')
}

function isGoodEnglishTerm(term: string): boolean {
  const normalized = term.toLowerCase()
  if (englishStopWords.has(normalized)) return false
  if (/^\d+$/.test(normalized)) return false
  if (normalized.length < 2 || normalized.length > 32) return false
  if (/^[a-z]{2,3}$/.test(normalized) && term !== term.toUpperCase()) return false
  return /[a-z]/i.test(normalized)
}

function isGoodChineseTerm(term: string): boolean {
  const label = normalizeConceptLabel(term)
  if (label.length < 2 || label.length > 12) return false
  if (chineseStopWords.has(label)) return false
  if ([...chineseStopWords].some((stop) => label === stop || label.startsWith(stop + '的'))) return false
  if (/(目录|展示|视觉|增强版|重制版)/.test(label)) return false
  if (/^(原|现|好|启|定|页|模|状|结|输|刷|打|关|点|查|生|整|关|自|默|当|全)/.test(label) && label.length <= 3) return false
  return /[\u4e00-\u9fff]/.test(label)
}

function addCandidate(
  candidates: Map<string, { label: string; score: number; source: ConceptRule['source'] }>,
  rawLabel: string,
  score: number,
  source: ConceptRule['source']
): void {
  const label = normalizeConceptLabel(rawLabel)
  if (!label) return
  const hasChinese = /[\u4e00-\u9fff]/.test(label)
  const valid = hasChinese ? isGoodChineseTerm(label) : isGoodEnglishTerm(label)
  if (!valid) return

  const key = conceptKey(label)
  const existing = candidates.get(key)
  if (existing) {
    existing.score += score
    if (source === 'title') existing.source = 'title'
    return
  }
  candidates.set(key, { label, score, source })
}

function addTitleTerms(
  candidates: Map<string, { label: string; score: number; source: ConceptRule['source'] }>,
  text: string,
  score = 2.6
): void {
  const normalized = text
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[()（）\[\]【】]/g, ' ')
  for (const part of normalized.split(/[\s/|,，:：]+/)) {
    addCandidate(candidates, part, score, 'title')
  }
  const cjk = normalized.match(/[\u4e00-\u9fff]{2,12}/g) || []
  for (const term of cjk) addCandidate(candidates, term, score + 0.4, 'title')
}

function addTechnicalTerms(
  candidates: Map<string, { label: string; score: number; source: ConceptRule['source'] }>,
  text: string
): void {
  const matches = text.match(/[A-Za-z][A-Za-z0-9_+#.\-]{1,31}/g) || []
  for (const raw of matches) {
    const parts = raw.includes('_') ? raw.split('_') : [raw]
    for (const part of parts) {
      const label = part.length <= 4 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)
      addCandidate(candidates, label, /[A-Z]{2,}|\+|#|\d/.test(part) ? 2.2 : 1.3, 'content')
    }
  }
}

function addHeadingTerms(
  candidates: Map<string, { label: string; score: number; source: ConceptRule['source'] }>,
  text: string
): void {
  const lines = text.split(/\n+/).slice(0, 80)
  for (const line of lines) {
    const clean = line.replace(/^#{1,6}\s*/, '').trim()
    if (!clean || clean.length > 80) continue
    if (/^[-*\d.\s]+$/.test(clean)) continue

    const titleLike = /^#{1,6}\s*/.test(line) || /[:：]$/.test(clean) || clean.length <= 24
    if (!titleLike) continue

    for (const part of clean.split(/[，,、/|:：()（）\[\]【】]+/)) {
      addCandidate(candidates, part, 2.0, 'title')
    }
  }
}

function addChineseNgrams(
  candidates: Map<string, { label: string; score: number; source: ConceptRule['source'] }>,
  text: string
): void {
  const compact = text.replace(/\s+/g, '')
  const counts = new Map<string, number>()
  const sequences = compact.match(/[\u4e00-\u9fff]{2,40}/g) || []
  for (const seq of sequences) {
    for (let n = 2; n <= 6; n++) {
      for (let i = 0; i <= seq.length - n; i++) {
        const gram = seq.slice(i, i + n)
        if (!isGoodChineseTerm(gram)) continue
        counts.set(gram, (counts.get(gram) || 0) + 1)
      }
    }
  }

  for (const [term, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
    if (count < 2 && term.length <= 3) continue
    addCandidate(candidates, term, Math.min(3.2, 0.7 + count * 0.45 + term.length * 0.08), 'content')
  }
}

function subjectFromContext(options: ConceptExtractOptions, label: string): string {
  const collection = normalizeConceptLabel(options.collectionName || '')
  if (collection && !/^默认资料库|全部资料|当前资料夹$/.test(collection)) return collection

  const title = normalizeConceptLabel(stripExt(options.fileName || ''))
  const titleParts = title.split(/[\s_\-/|]+/).filter(Boolean)
  const technical = titleParts.find((part) => /[A-Za-z][A-Za-z0-9+#.\-]*/.test(part))
  if (technical) return normalizeConceptLabel(technical).slice(0, 18)

  if (/[A-Za-z]/.test(label)) return '技术词'
  return '自动抽取'
}

function extractConcepts(text: string, options: ConceptExtractOptions = {}): ConceptRule[] {
  const candidates = new Map<string, { label: string; score: number; source: ConceptRule['source'] }>()
  const fullText = `${options.fileName || ''}\n${text || ''}`.slice(0, 12000)

  if (options.fileName) addTitleTerms(candidates, stripExt(options.fileName), 0.75)
  addHeadingTerms(candidates, fullText)
  addTechnicalTerms(candidates, fullText)
  addChineseNgrams(candidates, fullText)

  return [...candidates.values()]
    .filter((item) => item.score >= 1.35 || /[A-Z]{2,}|\+|#|\d/.test(item.label))
    .sort((a, b) => b.score - a.score || a.label.length - b.label.length)
    .slice(0, options.maxTerms || 6)
    .map((item) => ({
      id: nodeId('concept', conceptKey(item.label)),
      label: item.label,
      subject: subjectFromContext(options, item.label),
      aliases: [],
      source: item.source,
      confidence: clamp(item.score / 6, 0.22, 0.92)
    }))
}

function dynamicConceptFromFile(fileName: string, collectionName?: string): ConceptRule {
  const extracted = extractConcepts(fileName, { fileName, collectionName, maxTerms: 1 })
  if (extracted.length > 0) return { ...extracted[0], source: 'fallback' }

  const label = safeText(stripExt(fileName), 18) || '课程资料'
  return {
    id: nodeId('concept', conceptKey(label)),
    label,
    subject: subjectFromContext({ fileName, collectionName }, label),
    aliases: [],
    source: 'fallback',
    confidence: 0.28
  }
}

function findBestConceptForMemory(atom: MemoryAtom, conceptById: Map<string, ConceptRule>): ConceptRule {
  const text = `${atom.key} ${atom.value} ${(atom.evidence || []).join(' ')}`
  const normalizedText = text.toLowerCase()
  for (const concept of conceptById.values()) {
    if (normalizedText.includes(concept.label.toLowerCase())) return concept
    if ((concept.aliases || []).some((alias) => normalizedText.includes(alias.toLowerCase()))) {
      return concept
    }
  }

  const extracted = extractConcepts(text, { maxTerms: 1 })
  if (extracted.length > 0) return { ...extracted[0], source: 'memory' }

  const label = safeText(atom.value || atom.key, 16)
  return {
    id: nodeId('concept', conceptKey(label)),
    label,
    subject: subjectFromContext({}, label),
    aliases: [],
    source: 'memory',
    confidence: 0.35
  }
}

function edgeId(source: string, target: string, type: LearningGraphEdgeType): string {
  return `${type}:${source}->${target}`
}

export function buildLearningGraph(collectionId?: string): LearningGraphData {
  const normalized = normalizeCollectionId(collectionId)
  const effectiveCollectionId = normalized || ALL_COLLECTIONS_ID
  const collectionName = getCollectionName(collectionId)
  const collections = getCollectionsForGraph(collectionId)
  const docs = getDocsForGraph(collectionId)
  const chunks = getChunksForGraph(collectionId)
  const memory = getMemory()

  const nodes = new Map<string, LearningGraphNode>()
  const edges = new Map<string, LearningGraphEdge>()
  const conceptById = new Map<string, ConceptRule>()
  const conceptScore = new Map<string, number>()
  const docConceptWeight = new Map<string, Map<string, number>>()
  const chunkConcepts = new Map<string, ConceptRule[]>()
  const conceptEvidence = new Map<string, ConceptEvidenceRef[]>()

  const addNode = (node: LearningGraphNode): void => {
    const existing = nodes.get(node.id)
    if (!existing) {
      nodes.set(node.id, node)
      return
    }
    existing.size = Math.max(existing.size, node.size)
    existing.score = Math.max(existing.score, node.score)
    existing.meta = { ...(existing.meta || {}), ...(node.meta || {}) }
  }

  const addEdge = (
    source: string,
    target: string,
    type: LearningGraphEdgeType,
    label: string,
    weight = 1
  ): void => {
    if (!nodes.has(source) || !nodes.has(target) || source === target) return
    const id = edgeId(source, target, type)
    const existing = edges.get(id)
    if (existing) {
      existing.weight = clamp(existing.weight + weight, 1, 12)
      return
    }
    edges.set(id, { id, source, target, type, label, weight: clamp(weight, 1, 12) })
  }

  const rootId = nodeId('collection', effectiveCollectionId)
  addNode({
    id: rootId,
    label: collectionName,
    type: 'collection',
    size: 18,
    score: 1,
    meta: {
      description: normalized ? '当前资料夹的学习网络' : '跨资料夹的整体学习网络',
      collectionId: effectiveCollectionId
    }
  })

  for (const collection of collections) {
    if (collection.id === effectiveCollectionId || normalized) continue
    const id = nodeId('collection', collection.id)
    addNode({
      id,
      label: collection.name,
      type: 'collection',
      size: 12,
      score: 0.7,
      meta: { description: collection.description || '资料夹', collectionId: collection.id }
    })
    addEdge(rootId, id, 'owns', '包含资料夹', 1)
  }

  const docsById = new Map<string, LearningGraphDocumentRow>()
  for (const doc of docs) {
    docsById.set(doc.id, doc)
    const id = nodeId('document', doc.id)
    const collectionNodeId = normalized ? rootId : nodeId('collection', doc.collection_id)
    addNode({
      id,
      label: safeText(stripExt(doc.file_name), 22),
      type: 'document',
      size: clamp(7 + Math.sqrt(doc.chunk_count || 1), 8, 18),
      score: clamp((doc.chunk_count || 1) / 40, 0.2, 1),
      meta: {
        documentId: doc.id,
        fileName: doc.file_name,
        chunkCount: doc.chunk_count,
        collectionId: doc.collection_id,
        collectionName: doc.collection_name,
        createdAt: doc.created_at
      }
    })
    addEdge(collectionNodeId, id, 'owns', '收录资料', 1)
  }

  for (const chunk of chunks) {
    const doc = docsById.get(chunk.document_id)
    let concepts = extractConcepts(chunk.content, {
      fileName: chunk.file_name,
      collectionName: doc?.collection_name,
      maxTerms: 6
    })
    if (concepts.length === 0) {
      concepts = [dynamicConceptFromFile(chunk.file_name, doc?.collection_name)]
    }
    chunkConcepts.set(chunk.id, concepts)

    for (const concept of concepts) {
      conceptById.set(concept.id, concept)
      conceptScore.set(concept.id, (conceptScore.get(concept.id) || 0) + concept.confidence)
      const docMap = docConceptWeight.get(chunk.document_id) || new Map<string, number>()
      docMap.set(concept.id, (docMap.get(concept.id) || 0) + concept.confidence)
      docConceptWeight.set(chunk.document_id, docMap)

      const refs = conceptEvidence.get(concept.id) || []
      if (refs.length < 6 && !refs.some((ref) => ref.chunkId === chunk.id)) {
        refs.push({
          documentId: chunk.document_id,
          collectionId: chunk.collection_id,
          collectionName: doc?.collection_name,
          fileName: chunk.file_name,
          chunkId: chunk.id,
          startPos: chunk.start_pos,
          endPos: chunk.end_pos,
          snippet: safeText(chunk.content, 180)
        })
        conceptEvidence.set(concept.id, refs)
      }
    }
  }

  const topConceptIds = [...conceptScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CONCEPT_NODES)
    .map(([id]) => id)
  const topConceptSet = new Set(topConceptIds)

  for (const conceptId of topConceptIds) {
    const concept = conceptById.get(conceptId)
    if (!concept) continue
    const score = conceptScore.get(conceptId) || 1
    const evidenceRefs = conceptEvidence.get(concept.id) || []
    const primaryEvidence = evidenceRefs[0]
    addNode({
      id: concept.id,
      label: concept.label,
      type: 'concept',
      size: clamp(8 + Math.sqrt(score) * 2.6, 9, 24),
      score: clamp(score / 18, 0.25, 1),
      meta: {
        subject: concept.subject,
        mentions: Number(score.toFixed(2)),
        aliases: concept.aliases || [],
        source: concept.source,
        confidence: concept.confidence,
        documentId: primaryEvidence?.documentId,
        collectionId: primaryEvidence?.collectionId,
        collectionName: primaryEvidence?.collectionName,
        fileName: primaryEvidence?.fileName,
        evidenceRefs,
        dynamic: true
      }
    })
  }

  for (const [docId, weights] of docConceptWeight.entries()) {
    const docNodeId = nodeId('document', docId)
    for (const [conceptId, weight] of [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      if (!topConceptSet.has(conceptId)) continue
      addEdge(docNodeId, conceptId, 'mentions', '提到知识点', clamp(weight, 1, 8))
    }
  }

  const chunkCandidates = chunks
    .map((chunk) => ({
      chunk,
      concepts: (chunkConcepts.get(chunk.id) || []).filter((concept) => topConceptSet.has(concept.id))
    }))
    .filter((item) => item.concepts.length > 0)
    .sort((a, b) => b.concepts.length - a.concepts.length || a.chunk.start_pos - b.chunk.start_pos)
    .slice(0, MAX_CHUNK_NODES)

  for (const { chunk, concepts } of chunkCandidates) {
    const id = nodeId('chunk', chunk.id)
    addNode({
      id,
      label: `片段 ${Math.floor(chunk.start_pos / 1000) + 1}`,
      type: 'chunk',
      size: clamp(5 + concepts.length * 1.4, 6, 12),
      score: clamp(concepts.length / 6, 0.2, 1),
      meta: {
        chunkId: chunk.id,
        documentId: chunk.document_id,
        collectionId: chunk.collection_id,
        collectionName: docsById.get(chunk.document_id)?.collection_name,
        fileName: chunk.file_name,
        snippet: safeText(chunk.content, 180),
        startPos: chunk.start_pos,
        endPos: chunk.end_pos,
        position: `${chunk.start_pos}-${chunk.end_pos}`
      }
    })
    addEdge(nodeId('document', chunk.document_id), id, 'contains', '包含片段', 1)
    for (const concept of concepts.slice(0, 5)) {
      addEdge(id, concept.id, 'contains', '解释知识点', 1)
    }
  }

  const atoms = (memory.atoms || [])
    .filter((atom) =>
      ['topic', 'weak_point', 'strong_point', 'goal', 'misconception', 'preference'].includes(
        atom.category
      )
    )
    .sort(
      (a, b) =>
        b.importance * b.confidence + Math.min(b.hits, 8) * 0.03 -
        (a.importance * a.confidence + Math.min(a.hits, 8) * 0.03)
    )
    .slice(0, MAX_MEMORY_NODES)

  for (const atom of atoms) {
    const concept = findBestConceptForMemory(atom, conceptById)
    if (!nodes.has(concept.id)) {
      addNode({
        id: concept.id,
        label: concept.label,
        type: 'concept',
        size: 9,
        score: 0.35,
        meta: { subject: concept.subject, mentions: 0, source: concept.source, confidence: concept.confidence, dynamic: true }
      })
    }

    const id = nodeId('memory', atom.id)
    addNode({
      id,
      label:
        atom.category === 'weak_point'
          ? `薄弱：${safeText(atom.value, 12)}`
          : atom.category === 'misconception'
            ? `误区：${safeText(atom.value, 12)}`
            : atom.category === 'strong_point'
              ? `掌握：${safeText(atom.value, 12)}`
              : safeText(atom.value, 16),
      type: 'memory',
      size: clamp(6 + atom.importance * 8 + atom.confidence * 5, 7, 18),
      score: clamp(atom.importance * 0.56 + atom.confidence * 0.44, 0.2, 1),
      meta: {
        category: atom.category,
        value: atom.value,
        confidence: atom.confidence,
        importance: atom.importance,
        hits: atom.hits,
        evidence: atom.evidence,
        lastSeen: atom.lastSeen
      }
    })

    if (atom.category === 'weak_point' || atom.category === 'misconception') {
      addEdge(id, concept.id, 'weak_at', '薄弱/误区', clamp(2 + atom.importance * 5, 2, 8))
    } else if (atom.category === 'strong_point') {
      addEdge(id, concept.id, 'strong_at', '掌握较好', clamp(2 + atom.importance * 4, 2, 7))
    } else {
      addEdge(id, concept.id, 'related_to', '学习相关', 1)
    }
  }

  const reviewQueue = (memory.learningProfile?.reviewQueue || []).slice(0, MAX_REVIEW_NODES)
  for (const review of reviewQueue) {
    const fakeAtom = {
      key: review.key,
      value: review.key,
      evidence: [review.reason],
      category: 'weak_point',
      confidence: 0.72,
      importance: review.priority / 100,
      hits: 1
    } as MemoryAtom
    const concept = findBestConceptForMemory(fakeAtom, conceptById)
    if (!nodes.has(concept.id)) {
      addNode({
        id: concept.id,
        label: concept.label,
        type: 'concept',
        size: 9,
        score: 0.35,
        meta: { subject: concept.subject, source: concept.source, confidence: concept.confidence, dynamic: true }
      })
    }
    const id = nodeId('review', review.key)
    addNode({
      id,
      label: `复习：${safeText(review.key, 12)}`,
      type: 'review',
      size: clamp(7 + review.priority / 10, 8, 18),
      score: clamp(review.priority / 100, 0.2, 1),
      meta: {
        reason: review.reason,
        dueAt: review.dueAt,
        priority: review.priority
      }
    })
    addEdge(id, concept.id, 'reviews', '推荐复习', clamp(2 + review.priority / 20, 2, 8))
  }

  const resultNodes = [...nodes.values()]
  const resultEdges = [...edges.values()]
  const possibleEdges = resultNodes.length > 1 ? (resultNodes.length * (resultNodes.length - 1)) / 2 : 1
  const weakPointCount = resultNodes.filter(
    (node) =>
      node.type === 'memory' &&
      (node.meta?.category === 'weak_point' || node.meta?.category === 'misconception')
  ).length

  return {
    collectionId: effectiveCollectionId,
    collectionName,
    generatedAt: Date.now(),
    nodes: resultNodes,
    edges: resultEdges,
    stats: {
      nodeCount: resultNodes.length,
      edgeCount: resultEdges.length,
      collectionCount: resultNodes.filter((node) => node.type === 'collection').length,
      documentCount: resultNodes.filter((node) => node.type === 'document').length,
      chunkCount: resultNodes.filter((node) => node.type === 'chunk').length,
      conceptCount: resultNodes.filter((node) => node.type === 'concept').length,
      memoryAtomCount: resultNodes.filter((node) => node.type === 'memory').length,
      reviewTaskCount: resultNodes.filter((node) => node.type === 'review').length,
      weakPointCount,
      density: Number((resultEdges.length / possibleEdges).toFixed(4))
    }
  }
}
