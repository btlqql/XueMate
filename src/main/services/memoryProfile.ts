import { randomUUID } from 'crypto'
import type { MemoryAtom, MemoryCategory, UserMemory } from '../domain/memory'
import {
  ACTIVE_CONFIDENCE_THRESHOLD,
  MAX_ATOMS,
  MAX_EVIDENCE_PER_ATOM
} from '../domain/memory'

export function uniqueStrings(items: string[]): string[] {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function normalizeAtoms(atoms: MemoryAtom[]): MemoryAtom[] {
  const now = Date.now()
  const normalized: MemoryAtom[] = []
  const seen = new Set<string>()

  for (const raw of atoms || []) {
    const category = raw.category || 'topic'
    const key = normalizeKey(raw.key || raw.value)
    const value = String(raw.value || raw.key || '').trim()
    if (!key || !value) continue
    const uniqueKey = `${category}:${key}`
    if (seen.has(uniqueKey)) continue
    seen.add(uniqueKey)
    normalized.push({
      id: raw.id || `${category}-${Math.abs(hashString(uniqueKey))}`,
      category,
      key,
      value: value.slice(0, 160),
      confidence: clamp01(Number(raw.confidence ?? 0.55)),
      importance: clamp01(Number(raw.importance ?? 0.5)),
      evidence: uniqueStrings(raw.evidence || []).slice(0, MAX_EVIDENCE_PER_ATOM),
      source: raw.source || 'chat',
      firstSeen: Number(raw.firstSeen || now),
      lastSeen: Number(raw.lastSeen || raw.firstSeen || now),
      hits: Math.max(1, Number(raw.hits || 1))
    })
  }

  return normalized
    .sort((a, b) => memoryPriority(b) - memoryPriority(a))
    .slice(0, MAX_ATOMS)
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0
  }
  return hash
}

function categoryHalfLifeDays(category: MemoryCategory): number {
  switch (category) {
    case 'profile':
    case 'preference':
      return 365
    case 'goal':
      return 120
    case 'weak_point':
    case 'misconception':
      return 45
    case 'strong_point':
      return 70
    case 'behavior':
      return 50
    case 'topic':
    default:
      return 30
  }
}

export function decayedConfidence(atom: MemoryAtom, now = Date.now()): number {
  const ageDays = Math.max(0, (now - atom.lastSeen) / (24 * 60 * 60 * 1000))
  const halfLife = categoryHalfLifeDays(atom.category) * (0.7 + atom.importance * 0.8)
  const decay = Math.pow(0.5, ageDays / Math.max(halfLife, 1))
  return clamp01(atom.confidence * decay)
}

export function memoryPriority(atom: MemoryAtom): number {
  return decayedConfidence(atom) * 0.55 + atom.importance * 0.3 + Math.min(atom.hits, 8) * 0.018
}

export function activeAtoms(memory: UserMemory): MemoryAtom[] {
  return (memory.atoms || [])
    .map((atom) => ({ ...atom, confidence: decayedConfidence(atom) }))
    .filter((atom) => atom.confidence >= ACTIVE_CONFIDENCE_THRESHOLD)
    .sort((a, b) => memoryPriority(b) - memoryPriority(a))
}

export function upsertMemoryAtom(
  memory: UserMemory,
  atom: Omit<MemoryAtom, 'id'> & { id?: string }
): void {
  const now = Date.now()
  const atoms = (memory.atoms ||= [])
  const key = normalizeKey(atom.key || atom.value)
  const value = String(atom.value || atom.key || '').trim()
  if (!key || !value) return

  const existing = atoms.find((item) => item.category === atom.category && item.key === key)
  if (existing) {
    existing.value = value.slice(0, 160)
    existing.confidence = clamp01(
      decayedConfidence(existing, now) * 0.72 + clamp01(atom.confidence) * 0.35 + 0.04
    )
    existing.importance = clamp01(Math.max(existing.importance, atom.importance))
    existing.evidence = uniqueStrings([...(atom.evidence || []), ...existing.evidence]).slice(
      0,
      MAX_EVIDENCE_PER_ATOM
    )
    existing.lastSeen = now
    existing.hits += 1
    return
  }

  atoms.push({
    id: atom.id || randomUUID(),
    category: atom.category,
    key,
    value: value.slice(0, 160),
    confidence: clamp01(atom.confidence),
    importance: clamp01(atom.importance),
    evidence: uniqueStrings(atom.evidence || []).slice(0, MAX_EVIDENCE_PER_ATOM),
    source: atom.source || 'chat',
    firstSeen: atom.firstSeen || now,
    lastSeen: atom.lastSeen || now,
    hits: Math.max(1, atom.hits || 1)
  })
}

function inferSubject(text: string): string {
  if (/数学|分数|方程|几何|小数|计算|公式/.test(text)) return '数学'
  if (/英语|单词|语法|拼读|作文|阅读/.test(text)) return '英语'
  if (/科学|实验|植物|磁铁|过滤|物理|化学/.test(text)) return '科学'
  if (/语文|作文|阅读|古诗|拼音/.test(text)) return '语文'
  if (/python|代码|编程|算法|列表|循环/i.test(text)) return '编程'
  return '综合'
}

export function refreshMemoryDerivedState(memory: UserMemory): void {
  const atoms = normalizeAtoms(memory.atoms || [])
  memory.atoms = atoms
  const now = Date.now()
  const active = activeAtoms(memory)

  const topicAtoms = active.filter((atom) => atom.category === 'topic')
  const weakAtoms = active.filter(
    (atom) => atom.category === 'weak_point' || atom.category === 'misconception'
  )
  const strongAtoms = active.filter((atom) => atom.category === 'strong_point')
  const goalAtoms = active.filter((atom) => atom.category === 'goal')

  memory.learningProfile = {
    recentTopics: uniqueStrings(topicAtoms.map((atom) => atom.value)).slice(0, 12),
    weakSkills: weakAtoms.slice(0, 12).map((atom) => ({
      key: atom.value,
      subject: inferSubject(atom.value),
      mastery: clamp01(0.5 - decayedConfidence(atom) * 0.35),
      evidenceCount: atom.hits,
      lastPracticed: atom.lastSeen
    })),
    strongSkills: strongAtoms.slice(0, 10).map((atom) => ({
      key: atom.value,
      subject: inferSubject(atom.value),
      mastery: clamp01(0.62 + decayedConfidence(atom) * 0.28),
      evidenceCount: atom.hits,
      lastPracticed: atom.lastSeen
    })),
    goals: uniqueStrings([...memory.profile.learningGoals, ...goalAtoms.map((atom) => atom.value)]).slice(
      0,
      10
    ),
    reviewQueue: weakAtoms.slice(0, 8).map((atom) => ({
      key: atom.value,
      reason: atom.category === 'misconception' ? '疑似误区，需要纠正' : '薄弱点需要复习',
      dueAt: now + Math.max(1, 7 - Math.round(atom.importance * 5)) * 24 * 60 * 60 * 1000,
      priority: Math.round((atom.importance * 0.5 + decayedConfidence(atom) * 0.5) * 100)
    }))
  }

  memory.metrics = {
    atomCount: atoms.length,
    activeAtomCount: active.length,
    avgConfidence:
      active.length > 0
        ? Number((active.reduce((sum, atom) => sum + atom.confidence, 0) / active.length).toFixed(3))
        : 0,
    weakPointCount: weakAtoms.length,
    strongPointCount: strongAtoms.length,
    reviewQueueCount: memory.learningProfile.reviewQueue.length
  }
}

export function normalizeMemoryCategory(value: string): MemoryCategory | null {
  const category = String(value || '').trim() as MemoryCategory
  if (
    [
      'profile',
      'preference',
      'topic',
      'weak_point',
      'strong_point',
      'goal',
      'behavior',
      'misconception'
    ].includes(category)
  ) {
    return category
  }
  return null
}

export function addListMemories(
  memory: UserMemory,
  category: MemoryCategory,
  values: string[] | undefined,
  evidence: string,
  confidence: number,
  importance: number
): void {
  for (const value of uniqueStrings(values || []).slice(0, 10)) {
    upsertMemoryAtom(memory, {
      category,
      key: value,
      value,
      confidence,
      importance,
      evidence: [evidence],
      source: 'chat',
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      hits: 1
    })
  }
}
