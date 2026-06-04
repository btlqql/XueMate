import type { UserMemory } from '../domain/memory'
import { DEFAULT_MEMORY, MEMORY_VERSION } from '../domain/memory'
import {
  normalizeAtoms,
  refreshMemoryDerivedState,
  uniqueStrings,
  upsertMemoryAtom
} from './memoryProfile'

export function normalizeMemory(raw: Partial<UserMemory> | any): UserMemory {
  const memory: UserMemory = {
    ...DEFAULT_MEMORY,
    ...raw,
    profile: { ...DEFAULT_MEMORY.profile, ...(raw?.profile || {}) },
    preferences: { ...DEFAULT_MEMORY.preferences, ...(raw?.preferences || {}) },
    history: { ...DEFAULT_MEMORY.history, ...(raw?.history || {}) },
    atoms: Array.isArray(raw?.atoms) ? raw.atoms : [],
    learningProfile: {
      ...DEFAULT_MEMORY.learningProfile!,
      ...(raw?.learningProfile || {})
    },
    metrics: { ...DEFAULT_MEMORY.metrics!, ...(raw?.metrics || {}) },
    version: MEMORY_VERSION
  }

  memory.preferences.subjects = uniqueStrings(memory.preferences.subjects || []).slice(0, 12)
  memory.profile.learningGoals = uniqueStrings(memory.profile.learningGoals || []).slice(0, 12)
  memory.history.topics = uniqueStrings(memory.history.topics || []).slice(-40)
  memory.history.weakPoints = uniqueStrings(memory.history.weakPoints || []).slice(-40)
  memory.history.strongPoints = uniqueStrings(memory.history.strongPoints || []).slice(-40)
  memory.atoms = normalizeAtoms(memory.atoms || [])

  // 兼容旧版 history：第一次升级时把历史数组迁移成可解释 memory atoms。
  if (memory.atoms.length === 0) {
    const now = memory.lastUpdated || Date.now()
    for (const item of memory.history.topics || []) {
      upsertMemoryAtom(memory, {
        category: 'topic',
        key: item,
        value: item,
        confidence: 0.58,
        importance: 0.46,
        evidence: ['来自旧版学习历史'],
        source: 'system',
        firstSeen: now,
        lastSeen: now,
        hits: 1
      })
    }
    for (const item of memory.history.weakPoints || []) {
      upsertMemoryAtom(memory, {
        category: 'weak_point',
        key: item,
        value: item,
        confidence: 0.66,
        importance: 0.74,
        evidence: ['来自旧版薄弱点记录'],
        source: 'system',
        firstSeen: now,
        lastSeen: now,
        hits: 1
      })
    }
    for (const item of memory.history.strongPoints || []) {
      upsertMemoryAtom(memory, {
        category: 'strong_point',
        key: item,
        value: item,
        confidence: 0.62,
        importance: 0.54,
        evidence: ['来自旧版掌握点记录'],
        source: 'system',
        firstSeen: now,
        lastSeen: now,
        hits: 1
      })
    }
  }

  refreshMemoryDerivedState(memory)
  return memory
}
