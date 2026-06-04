export type ArchiveModule = 'topics' | 'weak' | 'strong'

export type MemoryCategory =
  | 'profile'
  | 'preference'
  | 'topic'
  | 'weak_point'
  | 'strong_point'
  | 'goal'
  | 'behavior'
  | 'misconception'

export interface MemoryAtom {
  id: string
  category: MemoryCategory
  key: string
  value: string
  confidence: number
  importance: number
  evidence: string[]
  source: 'chat' | 'system' | 'import'
  firstSeen: number
  lastSeen: number
  hits: number
}

export interface LearningSkillMemory {
  key: string
  subject: string
  mastery: number
  evidenceCount: number
  lastPracticed: number
}

export interface LearningProfileMemory {
  recentTopics: string[]
  weakSkills: LearningSkillMemory[]
  strongSkills: LearningSkillMemory[]
  goals: string[]
  reviewQueue: { key: string; reason: string; dueAt: number; priority: number }[]
}

export interface MemoryMetrics {
  atomCount: number
  activeAtomCount: number
  avgConfidence: number
  weakPointCount: number
  strongPointCount: number
  reviewQueueCount: number
}

export interface UserMemory {
  version?: number
  profile: {
    name: string
    school: string
    grade: string
    major: string
    learningGoals: string[]
  }
  preferences: {
    subjects: string[]
    difficulty: 'easy' | 'medium' | 'hard'
    language: 'zh' | 'en'
  }
  history: {
    topics: string[]
    weakPoints: string[]
    strongPoints: string[]
  }
  atoms?: MemoryAtom[]
  learningProfile?: LearningProfileMemory
  metrics?: MemoryMetrics
  lastUpdated: number
}

export const DEFAULT_MEMORY: UserMemory = {
  version: 2,
  profile: { name: '', school: '', grade: '', major: '', learningGoals: [] },
  preferences: { subjects: [], difficulty: 'medium', language: 'zh' },
  history: { topics: [], weakPoints: [], strongPoints: [] },
  atoms: [],
  learningProfile: { recentTopics: [], weakSkills: [], strongSkills: [], goals: [], reviewQueue: [] },
  metrics: {
    atomCount: 0,
    activeAtomCount: 0,
    avgConfidence: 0,
    weakPointCount: 0,
    strongPointCount: 0,
    reviewQueueCount: 0
  },
  lastUpdated: 0
}

export const MEMORY_VERSION = 2
export const ACTIVE_CONFIDENCE_THRESHOLD = 0.38
export const MAX_ATOMS = 180
export const MAX_EVIDENCE_PER_ATOM = 3
