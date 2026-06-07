import { createHash } from 'crypto'
import * as ragDao from '../../dao/ragDao'

export const PEEREDGE_SKETCH_VERSION = 'peeredge-sketch-v1' as const

const BLOOM_BITS = 4096
const BLOOM_HASHES = 4
const BLOOM_BYTES = BLOOM_BITS / 8
const SKETCH_TTL_MS = 5 * 60 * 1000
const MAX_SKETCH_CHUNKS = 500
const MAX_TERMS = 800
const MAX_CHUNK_TEXT_CHARS = 700

export interface PeerEdgeSketch {
  version: typeof PEEREDGE_SKETCH_VERSION
  nodeId: string
  group: string
  saltVersion: string
  m: number
  k: number
  lexicalBloom: string
  subjectBloom: string
  conceptBloom: string
  docCountBucket: string
  chunkCountBucket: string
  digest: string
  updatedAt: number
  ttlMs: number
}

export interface PeerEdgeQuerySketch {
  version: typeof PEEREDGE_SKETCH_VERSION
  group: string
  saltVersion: string
  m: number
  k: number
  lexicalBloom: string
  subjectBloom: string
  conceptBloom: string
  digest: string
  updatedAt: number
  ttlMs: number
}

interface TermBuckets {
  lexical: string[]
  subject: string[]
  concept: string[]
}

interface CachedSketch {
  value: PeerEdgeSketch
  expiresAt: number
  fingerprint: string
}

const STOPWORDS = new Set([
  '这个',
  '那个',
  '为什么',
  '怎么',
  '如何',
  '可以',
  '我们',
  '一个',
  '什么',
  '因为',
  '所以',
  '然后',
  '如果',
  '不是',
  '没有',
  '时候',
  '问题',
  '答案',
  '解释',
  '一下'
])

const SUBJECT_KEYWORDS: Record<string, string[]> = {
  math: ['数学', '分数', '小数', '加法', '减法', '乘法', '除法', '几何', '面积', '周长', '方程'],
  programming: [
    '编程',
    'python',
    'scratch',
    '循环',
    '变量',
    '列表',
    '数组',
    '函数',
    '排序',
    '算法',
    '代码'
  ],
  chinese: ['语文', '作文', '阅读', '古诗', '修辞', '拼音', '词语', '句子'],
  english: ['英语', '单词', '语法', '时态', '句型', 'english', 'word', 'grammar'],
  science: ['科学', '实验', '植物', '动物', '电路', '磁铁', '空气', '水', '地球']
}

let cachedSketch: CachedSketch | null = null

export function getLocalPeerEdgeSketch(noCache = false): PeerEdgeSketch {
  const fingerprint = localRagFingerprint()
  const now = Date.now()
  if (
    !noCache &&
    cachedSketch &&
    cachedSketch.expiresAt > now &&
    cachedSketch.fingerprint === fingerprint
  ) {
    return cachedSketch.value
  }

  const documents = ragDao.findDocuments()
  const chunks = ragDao.findRecentChunks(undefined, MAX_SKETCH_CHUNKS)
  const weightedTerms = new Map<string, number>()

  for (const doc of documents) {
    addWeightedTerms(weightedTerms, tokenize(doc.file_name), 6)
  }

  for (const chunk of chunks) {
    addWeightedTerms(weightedTerms, tokenize(chunk.file_name), 4)
    addWeightedTerms(weightedTerms, tokenize(chunk.content.slice(0, MAX_CHUNK_TEXT_CHARS)), 1)
  }

  const buckets = bucketTerms(topTerms(weightedTerms, MAX_TERMS))
  const sketch = buildSketchFromBuckets<PeerEdgeSketch>(buckets, {
    nodeId: process.env.XUEMATE_PEEREDGE_NODE_ID || 'local-xuemate',
    includeNode: true,
    docCountBucket: bucketNumber(ragDao.countDocuments()),
    chunkCountBucket: bucketNumber(ragDao.sumDocumentChunks())
  })

  cachedSketch = {
    value: sketch,
    expiresAt: now + SKETCH_TTL_MS,
    fingerprint
  }
  return sketch
}

export function buildQuerySketch(query: string): PeerEdgeQuerySketch {
  const buckets = bucketTerms(tokenize(query).slice(0, 160))
  return buildSketchFromBuckets<PeerEdgeQuerySketch>(buckets, {
    includeNode: false
  })
}

function buildSketchFromBuckets<T extends PeerEdgeSketch | PeerEdgeQuerySketch>(
  buckets: TermBuckets,
  options: {
    includeNode: boolean
    nodeId?: string
    docCountBucket?: string
    chunkCountBucket?: string
  }
): T {
  const saltVersion = peerEdgeSaltVersion()
  const lexicalBits = new Uint8Array(BLOOM_BYTES)
  const subjectBits = new Uint8Array(BLOOM_BYTES)
  const conceptBits = new Uint8Array(BLOOM_BYTES)

  for (const term of buckets.lexical) addBloom(lexicalBits, term, saltVersion)
  for (const term of buckets.subject) addBloom(subjectBits, term, saltVersion)
  for (const term of buckets.concept) addBloom(conceptBits, term, saltVersion)

  const base = {
    version: PEEREDGE_SKETCH_VERSION,
    group: process.env.XUEMATE_PEEREDGE_GROUP || 'class-demo',
    saltVersion,
    m: BLOOM_BITS,
    k: BLOOM_HASHES,
    lexicalBloom: bloomToBase64(lexicalBits),
    subjectBloom: bloomToBase64(subjectBits),
    conceptBloom: bloomToBase64(conceptBits),
    updatedAt: Date.now(),
    ttlMs: SKETCH_TTL_MS
  }

  const withNode = options.includeNode
    ? {
        ...base,
        nodeId: options.nodeId || 'local-xuemate',
        docCountBucket: options.docCountBucket || '0',
        chunkCountBucket: options.chunkCountBucket || '0'
      }
    : base

  return {
    ...withNode,
    digest: digestPayload(withNode)
  } as T
}

function localRagFingerprint(): string {
  const docs = ragDao.findDocuments().slice(0, 80)
  const stats = `${ragDao.countDocuments()}:${ragDao.sumDocumentChunks()}`
  const recent = docs
    .map((doc) => `${doc.id}:${doc.file_name}:${doc.chunk_count}:${doc.created_at}`)
    .join('|')
  return createHash('sha256').update(`${stats}|${recent}`).digest('hex').slice(0, 16)
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[\u3000\s]+/g, ' ')
  const ascii = normalized.match(/[a-z0-9_+\-.]{2,}/g) || []
  const chinese = [...normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)].flatMap((match) =>
    chineseNgrams(match[0])
  )

  return [...ascii, ...chinese]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 32)
    .filter((term) => !STOPWORDS.has(term))
}

function chineseNgrams(text: string): string[] {
  const output: string[] = []
  for (const n of [2, 3, 4]) {
    for (let i = 0; i + n <= text.length; i++) {
      output.push(text.slice(i, i + n))
    }
  }
  return output
}

function addWeightedTerms(target: Map<string, number>, terms: string[], weight: number): void {
  for (const term of terms) {
    target.set(term, (target.get(term) || 0) + weight)
  }
}

function topTerms(weightedTerms: Map<string, number>, limit: number): string[] {
  return [...weightedTerms.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term)
}

function bucketTerms(terms: string[]): TermBuckets {
  const lexical = new Set<string>()
  const subject = new Set<string>()
  const concept = new Set<string>()

  for (const term of terms) {
    lexical.add(term)
    if (isSubjectTerm(term)) subject.add(term)
    if (isConceptTerm(term)) concept.add(term)
  }

  return {
    lexical: [...lexical],
    subject: [...subject],
    concept: [...concept]
  }
}

function isSubjectTerm(term: string): boolean {
  return Object.values(SUBJECT_KEYWORDS).some((keywords) =>
    keywords.some((keyword) => term.includes(keyword) || keyword.includes(term))
  )
}

function isConceptTerm(term: string): boolean {
  if (isSubjectTerm(term)) return true
  if (/^[a-z0-9_+\-.]{2,}$/.test(term)) return true
  return term.length >= 3
}

function addBloom(bits: Uint8Array, term: string, saltVersion: string): void {
  for (let i = 0; i < BLOOM_HASHES; i++) {
    const bit = hashTerm(term, saltVersion, i, BLOOM_BITS)
    bits[bit >> 3] |= 1 << (bit & 7)
  }
}

function hashTerm(term: string, saltVersion: string, seed: number, m: number): number {
  const digest = createHash('sha256').update(`${saltVersion}:${seed}:${term}`).digest()
  return digest.readUInt32BE(0) % m
}

function bloomToBase64(bits: Uint8Array): string {
  return Buffer.from(bits).toString('base64')
}

function digestPayload(payload: object): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
}

function bucketNumber(value: number): string {
  if (value <= 0) return '0'
  if (value <= 5) return '1-5'
  if (value <= 10) return '6-10'
  if (value <= 30) return '11-30'
  if (value <= 100) return '31-100'
  if (value <= 300) return '101-300'
  return '300+'
}

function peerEdgeSaltVersion(): string {
  const explicit = process.env.XUEMATE_PEEREDGE_SALT_VERSION?.trim()
  if (explicit) return explicit

  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000)
  const week = Math.floor(day / 7) + 1
  return `${now.getUTCFullYear()}w${String(week).padStart(2, '0')}`
}
