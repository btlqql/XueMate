interface LLMResult {
  success: boolean
  data?: string
  error?: string
}

interface LLMAPI {
  parseTask: (text: string) => Promise<LLMResult>
  tutorCode: (code: string, type: 'code' | 'report') => Promise<LLMResult>
  generateReview: (courseName: string) => Promise<LLMResult>
  judgeCode: (problem: string, code: string, language: string) => Promise<LLMResult>
  generateProblems: (topic: string, count: number) => Promise<LLMResult>
}

interface FileAPI {
  selectPDF: () => Promise<{ success: boolean; data?: string; error?: string }>
  checkPDF: (filePath: string) => Promise<LLMResult>
}

interface AgentAPI {
  start: (task: string) => Promise<{ success: boolean; error?: string }>
  stop: () => Promise<{ success: boolean }>
  confirmResult: (approved: boolean) => Promise<{ success: boolean }>
  onUpdate: (callback: (data: any) => void) => () => void
  onConfirm: (callback: (data: { command: string; reason: string }) => void) => () => void
}

interface ChatSendOptions {
  collectionId?: string
}

interface ChatAPI {
  getConversations: () => Promise<{ success: boolean; data?: any[]; error?: string }>
  getConversation: (id: string) => Promise<{ success: boolean; data?: any; error?: string }>
  createConversation: () => Promise<{ success: boolean; data?: string; error?: string }>
  deleteConversation: (id: string) => Promise<{ success: boolean; error?: string }>
  sendMessage: (
    convId: string,
    content: string,
    options?: ChatSendOptions
  ) => Promise<{ success: boolean; data?: string; error?: string }>
  getMemory: () => Promise<{ success: boolean; data?: any; error?: string }>
  onStreamToken: (callback: (token: string) => void) => () => void
  onStreamDone: (callback: (fullContent: string) => void) => () => void
  onStreamError: (callback: (error: string) => void) => () => void
}

interface RagCollection {
  id: string
  name: string
  description: string
  docCount: number
  chunkCount: number
  createdAt: number
  updatedAt: number
}

type LearningGraphNodeType = 'collection' | 'document' | 'chunk' | 'concept' | 'memory' | 'review'

interface LearningGraphNode {
  id: string
  label: string
  type: LearningGraphNodeType
  size: number
  score: number
  meta?: Record<string, any>
}

interface LearningGraphEdge {
  id: string
  source: string
  target: string
  type: string
  label: string
  weight: number
}

interface LearningGraphData {
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

interface RagAPI {
  collections: () => Promise<{ success: boolean; data?: RagCollection[]; error?: string }>
  createCollection: (
    name: string,
    description?: string
  ) => Promise<{ success: boolean; data?: RagCollection; error?: string }>
  importFile: (
    filePath: string,
    collectionId?: string
  ) => Promise<{ success: boolean; data?: any; error?: string }>
  selectAndImport: (
    collectionId?: string
  ) => Promise<{ success: boolean; data?: { imported: any[]; errors: string[] }; error?: string }>
  documents: (collectionId?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
  delete: (docId: string) => Promise<{ success: boolean; error?: string }>
  stats: (collectionId?: string) => Promise<{
    success: boolean
    data?: { docCount: number; chunkCount: number }
    error?: string
  }>
  learningGraph: (
    collectionId?: string
  ) => Promise<{ success: boolean; data?: LearningGraphData; error?: string }>
}

interface QuickSearchAPI {
  run: (query: string) => Promise<{
    success: boolean
    data?: {
      query: string
      summary: string
      mode?: 'cloud' | 'local'
      taskId?: string
      elapsedMs?: number
      cacheHit?: boolean
      stages?: { name: string; status: string; detail: string; at: string }[]
      sources: {
        title: string
        url: string
        text: string
        level?: string
        scores?: {
          relevance: number
          readability: number
          ageFit: number
          trust: number
          adNoise: number
          overall: number
          level: string
          reason: string
        }
      }[]
    }
    error?: string
  }>
}

interface WebAssistantAPI {
  start: (goal: string) => Promise<{
    success: boolean
    answer?: string
    error?: string
    steps?: any[]
  }>
  stop: () => Promise<{ success: boolean }>
  setLiveBounds: (
    bounds: { x: number; y: number; width: number; height: number } | null
  ) => Promise<{ success: boolean }>
  onUpdate: (callback: (data: any) => void) => () => void
}

interface TaskAPI {
  getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>
  add: (tasks: any[]) => Promise<{ success: boolean; data?: any[]; error?: string }>
  update: (
    id: string,
    fields: Record<string, any>
  ) => Promise<{ success: boolean; data?: boolean; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; data?: boolean; error?: string }>
  toggle: (id: string) => Promise<{ success: boolean; data?: boolean; error?: string }>
}

declare global {
  interface Window {
    electron: any
    llm: LLMAPI
    file: FileAPI
    agent: AgentAPI
    chat: ChatAPI
    rag: RagAPI
    task: TaskAPI
    webAssistant: WebAssistantAPI
    quickSearch: QuickSearchAPI
  }
}

export {}
