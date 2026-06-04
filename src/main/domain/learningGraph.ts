export type LearningGraphNodeType =
  | 'collection'
  | 'document'
  | 'chunk'
  | 'concept'
  | 'memory'
  | 'review'

export type LearningGraphEdgeType =
  | 'owns'
  | 'contains'
  | 'mentions'
  | 'weak_at'
  | 'strong_at'
  | 'related_to'
  | 'reviews'

export interface LearningGraphNode {
  id: string
  label: string
  type: LearningGraphNodeType
  size: number
  score: number
  meta?: Record<string, any>
}

export interface LearningGraphEdge {
  id: string
  source: string
  target: string
  type: LearningGraphEdgeType
  label: string
  weight: number
}

export interface LearningGraphData {
  collectionId: string
  collectionName: string
  generatedAt: number
  nodes: LearningGraphNode[]
  edges: LearningGraphEdge[]
  stats: {
    nodeCount: number
    edgeCount: number
    collectionCount: number
    documentCount: number
    chunkCount: number
    conceptCount: number
    memoryAtomCount: number
    reviewTaskCount: number
    weakPointCount: number
    density: number
  }
}
