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
  patterns: RegExp[]
  aliases?: string[]
}

const MAX_DOC_NODES = 32
const MAX_CHUNK_SCAN = 420
const MAX_CHUNK_NODES = 42
const MAX_CONCEPT_NODES = 56
const MAX_MEMORY_NODES = 28
const MAX_REVIEW_NODES = 14

const conceptRules: ConceptRule[] = [
  {
    id: 'concept:bubble-sort',
    label: '冒泡排序',
    subject: '编程',
    patterns: [/冒泡排序|bubble\s*sort/i],
    aliases: ['bubble sort', '排序算法']
  },
  {
    id: 'concept:nested-loop',
    label: '循环嵌套',
    subject: '编程',
    patterns: [/循环嵌套|嵌套循环|两层循环|双重循环|nested\s*loop/i]
  },
  {
    id: 'concept:list-index',
    label: '列表索引',
    subject: '编程',
    patterns: [/列表索引|数组索引|下标|越界|index|arr\[[^\]]+\]|j\s*\+\s*1/i]
  },
  {
    id: 'concept:variable',
    label: '变量',
    subject: '编程',
    patterns: [/变量|赋值|variable|let|const|var/i]
  },
  {
    id: 'concept:condition',
    label: '条件判断',
    subject: '编程',
    patterns: [/条件判断|如果|if\s|else|比较大小/i]
  },
  {
    id: 'concept:function',
    label: '函数',
    subject: '编程',
    patterns: [/函数|def\s+|function\s+|参数|返回值/i]
  },
  {
    id: 'concept:python',
    label: 'Python',
    subject: '编程',
    patterns: [/python|py\b|range\(|len\(|print\(/i]
  },
  {
    id: 'concept:algorithm',
    label: '算法步骤',
    subject: '编程',
    patterns: [/算法|步骤|流程|伪代码|复杂度|algorithm/i]
  },
  {
    id: 'concept:fraction',
    label: '分数',
    subject: '数学',
    patterns: [/分数|分子|分母|通分|约分/]
  },
  {
    id: 'concept:equation',
    label: '方程',
    subject: '数学',
    patterns: [/方程|未知数|解方程|等式/]
  },
  {
    id: 'concept:geometry',
    label: '几何图形',
    subject: '数学',
    patterns: [/几何|面积|周长|三角形|长方形|正方形|圆形|角度/]
  },
  {
    id: 'concept:decimal',
    label: '小数',
    subject: '数学',
    patterns: [/小数|百分数|百分比/]
  },
  {
    id: 'concept:word-problem',
    label: '应用题',
    subject: '数学',
    patterns: [/应用题|数量关系|单位换算|路程|速度|时间/]
  },
  {
    id: 'concept:reading',
    label: '阅读理解',
    subject: '语文',
    patterns: [/阅读理解|中心思想|段落大意|文章主旨|修辞/]
  },
  {
    id: 'concept:writing',
    label: '作文表达',
    subject: '语文',
    patterns: [/作文|写作|开头|结尾|描写|叙事/]
  },
  {
    id: 'concept:vocabulary',
    label: '单词记忆',
    subject: '英语',
    patterns: [/单词|词汇|vocabulary|拼读|音标|phonics/i]
  },
  {
    id: 'concept:grammar',
    label: '英语语法',
    subject: '英语',
    patterns: [/语法|grammar|时态|一般现在时|过去式|句型/i]
  },
  {
    id: 'concept:experiment',
    label: '科学实验',
    subject: '科学',
    patterns: [/实验|观察|假设|结论|变量控制|记录表/]
  },
  {
    id: 'concept:plant',
    label: '植物生长',
    subject: '科学',
    patterns: [/植物|种子|发芽|光合作用|根茎叶/]
  },
  {
    id: 'concept:force',
    label: '力与运动',
    subject: '科学',
    patterns: [/力|运动|摩擦|磁铁|重力|速度/]
  }
]

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

function matchConcepts(text: string): ConceptRule[] {
  const haystack = `${text || ''}`.slice(0, 6000)
  const matched: ConceptRule[] = []
  for (const rule of conceptRules) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      matched.push(rule)
    }
  }
  return matched
}

function dynamicConceptFromFile(fileName: string): ConceptRule {
  const label = safeText(stripExt(fileName), 18) || '课程资料'
  return {
    id: nodeId('concept', label),
    label,
    subject: inferSubject(label),
    patterns: []
  }
}

function inferSubject(text: string): string {
  if (/数学|分数|方程|几何|小数|计算|公式|面积|周长/.test(text)) return '数学'
  if (/英语|单词|语法|拼读|作文|阅读|grammar|vocabulary|phonics/i.test(text)) return '英语'
  if (/科学|实验|植物|磁铁|过滤|物理|化学|运动|力/.test(text)) return '科学'
  if (/语文|作文|阅读|古诗|拼音|修辞/.test(text)) return '语文'
  if (/python|代码|编程|算法|列表|循环|排序|index|function|variable/i.test(text)) return '编程'
  return '综合'
}

function findBestConceptForMemory(atom: MemoryAtom, conceptById: Map<string, ConceptRule>): ConceptRule {
  const text = `${atom.key} ${atom.value} ${(atom.evidence || []).join(' ')}`
  for (const concept of conceptById.values()) {
    if (text.includes(concept.label)) return concept
    if ((concept.aliases || []).some((alias) => text.toLowerCase().includes(alias.toLowerCase()))) {
      return concept
    }
    if (matchConcepts(text).some((item) => item.id === concept.id)) return concept
  }

  const label = safeText(atom.value || atom.key, 16)
  return {
    id: nodeId('concept', label),
    label,
    subject: inferSubject(label),
    patterns: []
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
    let concepts = matchConcepts(`${chunk.file_name}\n${chunk.content}`)
    if (concepts.length === 0) {
      concepts = [dynamicConceptFromFile(chunk.file_name)]
    }
    chunkConcepts.set(chunk.id, concepts)

    for (const concept of concepts) {
      conceptById.set(concept.id, concept)
      conceptScore.set(concept.id, (conceptScore.get(concept.id) || 0) + 1)
      const docMap = docConceptWeight.get(chunk.document_id) || new Map<string, number>()
      docMap.set(concept.id, (docMap.get(concept.id) || 0) + 1)
      docConceptWeight.set(chunk.document_id, docMap)
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
    addNode({
      id: concept.id,
      label: concept.label,
      type: 'concept',
      size: clamp(8 + Math.sqrt(score) * 2.6, 9, 24),
      score: clamp(score / 18, 0.25, 1),
      meta: {
        subject: concept.subject,
        mentions: score,
        aliases: concept.aliases || []
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
        fileName: chunk.file_name,
        snippet: safeText(chunk.content, 180),
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
        meta: { subject: concept.subject, mentions: 0, source: 'memory' }
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
        meta: { subject: concept.subject, source: 'review' }
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
