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
  onUpdate: (callback: (data: AgentUpdate) => void) => () => void
  onConfirm: (callback: (data: { command: string; reason: string }) => void) => () => void
}

interface AgentUpdate {
  state?: string
  steps?: unknown[]
  stepCount?: number
  [key: string]: unknown
}

interface ChatSendOptions {
  collectionId?: string
  requestId?: string
}

type ChatStreamEventType = 'token' | 'done' | 'error'

interface ChatStreamEvent<T = unknown> {
  requestId: string
  convId: string
  source: 'chat'
  type: ChatStreamEventType
  payload: T
  ts: number
}

interface ChatAPI {
  getConversations: () => Promise<{ success: boolean; data?: Conversation[]; error?: string }>
  getConversation: (
    id: string
  ) => Promise<{ success: boolean; data?: Conversation | null; error?: string }>
  createConversation: () => Promise<{ success: boolean; data?: string; error?: string }>
  deleteConversation: (id: string) => Promise<{ success: boolean; error?: string }>
  sendMessage: (
    convId: string,
    content: string,
    options?: ChatSendOptions
  ) => Promise<{ success: boolean; streaming?: boolean; requestId?: string; error?: string }>
  getMemory: () => Promise<{ success: boolean; data?: UserMemory; error?: string }>
  onStreamEvent: (callback: (event: ChatStreamEvent) => void) => () => void
}

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: number
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface UserMemory {
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
    language: string
  }
  history: {
    topics: string[]
    weakPoints: string[]
    strongPoints: string[]
  }
  lastUpdated: number
  [key: string]: unknown
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
  meta?: Record<string, unknown>
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
  ) => Promise<{ success: boolean; data?: RagDocument; error?: string }>
  selectAndImport: (
    collectionId?: string
  ) => Promise<{
    success: boolean
    data?: { imported: RagDocument[]; errors: string[] }
    error?: string
  }>
  documents: (
    collectionId?: string
  ) => Promise<{ success: boolean; data?: RagDocument[]; error?: string }>
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

interface RagDocument {
  id: string
  collectionId: string
  fileName: string
  chunkCount: number
  createdAt: number
}

interface QuickSearchSourceScore {
  relevance: number
  readability: number
  ageFit: number
  trust: number
  adNoise: number
  overall: number
  level: string
  reason: string
}

interface QuickSearchSource {
  title: string
  url: string
  text: string
  level?: string
  scores?: QuickSearchSourceScore
}

interface QuickSearchResult {
  query: string
  summary: string
  mode?: 'local'
  taskId?: string
  elapsedMs?: number
  cacheHit?: boolean
  stages?: { name: string; status: string; detail: string; at: string }[]
  sources: QuickSearchSource[]
}

type QuickSearchKind = 'foreground' | 'background'
type QuickSearchStatus = 'done' | 'error' | 'skipped'

interface QuickSearchRecord {
  id: string
  runId: string
  query: string
  normalizedQuery: string
  kind: QuickSearchKind
  status: QuickSearchStatus
  mode: string
  taskId: string
  summary: string
  resultJson: unknown
  error: string
  createdAt: number
  updatedAt: number
}

interface QuickSearchHistoryFilters {
  limit?: number
  runId?: string
  query?: string
  kind?: QuickSearchKind
  status?: QuickSearchStatus
}

interface QuickSearchBackgroundUpdate {
  runId?: string
  recordId?: string
  query: string
  status: 'running' | 'done' | 'error' | 'skipped'
  message?: string
  result?: QuickSearchResult
  error?: string
}

interface QuickSearchAPI {
  run: (query: string) => Promise<{
    success: boolean
    data?: QuickSearchResult
    runId?: string
    recordId?: string
    error?: string
  }>
  history: (
    filters?: QuickSearchHistoryFilters
  ) => Promise<{ success: boolean; data?: QuickSearchRecord[]; error?: string }>
  get: (
    id: string
  ) => Promise<{ success: boolean; data?: QuickSearchRecord | null; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; data?: boolean; error?: string }>
  onBackgroundUpdate: (callback: (data: QuickSearchBackgroundUpdate) => void) => () => void
}

interface WebAssistantAPI {
  start: (goal: string) => Promise<{
    success: boolean
    answer?: string
    error?: string
    steps?: WebAssistantStep[]
  }>
  stop: () => Promise<{ success: boolean }>
  setLiveBounds: (
    bounds: { x: number; y: number; width: number; height: number } | null
  ) => Promise<{ success: boolean }>
  onUpdate: (callback: (data: WebAssistantUpdate) => void) => () => void
}

interface WebAssistantStep {
  id: number
  thought: string
  actionLabel: string
  status: 'running' | 'done' | 'error'
}

interface WebAssistantUpdate {
  state?: string
  step?: number
  maxSteps?: number
  steps?: WebAssistantStep[]
  screenshot?: string
  screenshotMime?: string
  url?: string
  title?: string
  answer?: string
  error?: string
  domElementCount?: number
  domCandidates?: unknown[]
  [key: string]: unknown
}

type TaskStatus = 'pending' | 'done'

interface Task {
  id: string
  title: string
  deadline: string
  deadlineTs: number
  format: string
  naming: string
  note: string
  status: TaskStatus
  sourceText: string
  createdAt: number
  reminded24h: boolean
  reminded1h: boolean
}

type NewTask = Omit<Task, 'id' | 'createdAt'>
type TaskEditableFields = Partial<
  Pick<Task, 'title' | 'deadline' | 'deadlineTs' | 'format' | 'naming' | 'note'>
>

interface TaskAPI {
  getAll: () => Promise<{ success: boolean; data?: Task[]; error?: string }>
  add: (tasks: NewTask[]) => Promise<{ success: boolean; data?: Task[]; error?: string }>
  update: (
    id: string,
    fields: TaskEditableFields
  ) => Promise<{ success: boolean; data?: boolean; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; data?: boolean; error?: string }>
  toggle: (id: string) => Promise<{ success: boolean; data?: boolean; error?: string }>
}

declare global {
  interface Window {
    electron: unknown
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
