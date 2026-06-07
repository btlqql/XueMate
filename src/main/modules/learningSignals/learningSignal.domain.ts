export type LearningSignalType = 'todo' | 'weak_point' | 'material_gap'
export type LearningSignalStatus = 'suggested' | 'confirmed' | 'resolved' | 'dismissed'
export type LearningSignalSource = 'chat' | 'memory' | 'manual' | 'agent'

export interface LearningSignal {
  id: string
  conversationId: string
  type: LearningSignalType
  title: string
  normalizedTitle: string
  reason: string
  status: LearningSignalStatus
  source: LearningSignalSource
  createdAt: number
  updatedAt: number
}

export interface LearningSignalDraft {
  type: LearningSignalType
  title: string
  reason: string
  source?: LearningSignalSource
}

export interface LearningSignalUpdate {
  status?: LearningSignalStatus
  title?: string
  reason?: string
}

export interface LearningSignalRow {
  id: string
  conversation_id: string
  type: LearningSignalType
  title: string
  normalized_title: string
  reason: string | null
  status: LearningSignalStatus
  source: LearningSignalSource
  created_at: number
  updated_at: number
}
