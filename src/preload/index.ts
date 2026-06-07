import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type ChatStreamEventType = 'token' | 'done' | 'error'

interface ChatStreamEvent<T = unknown> {
  requestId: string
  convId: string
  source: 'chat'
  type: ChatStreamEventType
  payload: T
  ts: number
}

type WebAssistantUpdate = Record<string, unknown>
type AgentUpdate = Record<string, unknown>
type LearningSignalType = 'todo' | 'weak_point' | 'material_gap'
type LearningSignalStatus = 'suggested' | 'confirmed' | 'resolved' | 'dismissed'

interface LearningSignalDraft {
  type: LearningSignalType
  title: string
  reason: string
  source?: 'chat' | 'memory' | 'manual' | 'agent'
}

interface LearningSignalUpdate {
  status?: LearningSignalStatus
  title?: string
  reason?: string
}

interface TaskDraft {
  title: string
  deadline: string
  deadlineTs: number
  format: string
  naming: string
  note: string
  status?: 'pending' | 'done'
  sourceText: string
  reminded24h?: boolean
  reminded1h?: boolean
}

type TaskEditableFields = Partial<
  Pick<TaskDraft, 'title' | 'deadline' | 'deadlineTs' | 'format' | 'naming' | 'note'>
>

const llmAPI = {
  parseTask: (text: string) => ipcRenderer.invoke('llm:parseTask', text),
  tutorCode: (code: string, type: 'code' | 'report') =>
    ipcRenderer.invoke('llm:tutorCode', code, type),
  generateReview: (courseName: string) => ipcRenderer.invoke('llm:generateReview', courseName),
  judgeCode: (problem: string, code: string, language: string) =>
    ipcRenderer.invoke('llm:judgeCode', problem, code, language),
  generateProblems: (topic: string, count: number) =>
    ipcRenderer.invoke('llm:generateProblems', topic, count)
}

const fileAPI = {
  selectPDF: () => ipcRenderer.invoke('file:selectPDF'),
  checkPDF: (filePath: string) => ipcRenderer.invoke('file:checkPDF', filePath)
}

const chatAPI = {
  getConversations: () => ipcRenderer.invoke('chat:getConversations'),
  getConversation: (id: string) => ipcRenderer.invoke('chat:getConversation', id),
  createConversation: () => ipcRenderer.invoke('chat:createConversation'),
  deleteConversation: (id: string) => ipcRenderer.invoke('chat:deleteConversation', id),
  sendMessage: (
    convId: string,
    content: string,
    options?: { collectionId?: string; requestId?: string }
  ) => ipcRenderer.invoke('chat:sendMessage', convId, content, options),
  getMemory: () => ipcRenderer.invoke('chat:getMemory'),
  onStreamEvent: (callback: (event: ChatStreamEvent) => void) => {
    const handler = (_event: IpcRendererEvent, streamEvent: ChatStreamEvent) =>
      callback(streamEvent)
    ipcRenderer.on('chat:stream-event', handler)
    return () => ipcRenderer.removeListener('chat:stream-event', handler)
  }
}

const ragAPI = {
  collections: () => ipcRenderer.invoke('rag:collections'),
  createCollection: (name: string, description?: string) =>
    ipcRenderer.invoke('rag:createCollection', name, description),
  importFile: (filePath: string, collectionId?: string) =>
    ipcRenderer.invoke('rag:importFile', filePath, collectionId),
  selectAndImport: (collectionId?: string) =>
    ipcRenderer.invoke('rag:selectAndImport', collectionId),
  documents: (collectionId?: string) => ipcRenderer.invoke('rag:documents', collectionId),
  delete: (docId: string) => ipcRenderer.invoke('rag:delete', docId),
  stats: (collectionId?: string) => ipcRenderer.invoke('rag:stats', collectionId),
  learningGraph: (collectionId?: string) => ipcRenderer.invoke('rag:learningGraph', collectionId)
}

const quickSearchAPI = {
  run: (query: string) => ipcRenderer.invoke('quickSearch:run', query),
  history: (filters?: Record<string, unknown>) =>
    ipcRenderer.invoke('quickSearch:history', filters),
  get: (id: string) => ipcRenderer.invoke('quickSearch:get', id),
  delete: (id: string) => ipcRenderer.invoke('quickSearch:delete', id),
  onBackgroundUpdate: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_event: IpcRendererEvent, data: Record<string, unknown>) => callback(data)
    ipcRenderer.on('quickSearch:background', handler)
    return () => ipcRenderer.removeListener('quickSearch:background', handler)
  }
}

const learningSignalsAPI = {
  list: (conversationId: string) => ipcRenderer.invoke('learningSignals:list', conversationId),
  add: (conversationId: string, draft: LearningSignalDraft) =>
    ipcRenderer.invoke('learningSignals:add', conversationId, draft),
  update: (id: string, fields: LearningSignalUpdate) =>
    ipcRenderer.invoke('learningSignals:update', id, fields)
}

const webAssistantAPI = {
  start: (goal: string) => ipcRenderer.invoke('webAssistant:start', goal),
  stop: (runId?: string) => ipcRenderer.invoke('webAssistant:stop', runId),
  setLiveBounds: (bounds: { x: number; y: number; width: number; height: number } | null) =>
    ipcRenderer.invoke('webAssistant:setLiveBounds', bounds),
  onUpdate: (callback: (data: WebAssistantUpdate) => void) => {
    const handler = (_event: IpcRendererEvent, data: WebAssistantUpdate) => callback(data)
    ipcRenderer.on('webAssistant:update', handler)
    return () => ipcRenderer.removeListener('webAssistant:update', handler)
  }
}

const taskAPI = {
  getAll: () => ipcRenderer.invoke('task:getAll'),
  add: (tasks: TaskDraft[]) => ipcRenderer.invoke('task:add', tasks),
  update: (id: string, fields: TaskEditableFields) => ipcRenderer.invoke('task:update', id, fields),
  delete: (id: string) => ipcRenderer.invoke('task:delete', id),
  toggle: (id: string) => ipcRenderer.invoke('task:toggle', id)
}

const agentAPI = {
  start: (task: string) => ipcRenderer.invoke('agent:start', task),
  stop: () => ipcRenderer.invoke('agent:stop'),
  confirmResult: (approved: boolean) => ipcRenderer.invoke('agent:confirmResult', approved),
  onUpdate: (callback: (data: AgentUpdate) => void) => {
    const handler = (_event: IpcRendererEvent, data: AgentUpdate) => callback(data)
    ipcRenderer.on('agent:update', handler)
    return () => ipcRenderer.removeListener('agent:update', handler)
  },
  onConfirm: (callback: (data: { command: string; reason: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { command: string; reason: string }) =>
      callback(data)
    ipcRenderer.on('agent:confirm', handler)
    return () => ipcRenderer.removeListener('agent:confirm', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('llm', llmAPI)
    contextBridge.exposeInMainWorld('file', fileAPI)
    contextBridge.exposeInMainWorld('agent', agentAPI)
    contextBridge.exposeInMainWorld('chat', chatAPI)
    contextBridge.exposeInMainWorld('rag', ragAPI)
    contextBridge.exposeInMainWorld('task', taskAPI)
    contextBridge.exposeInMainWorld('webAssistant', webAssistantAPI)
    contextBridge.exposeInMainWorld('quickSearch', quickSearchAPI)
    contextBridge.exposeInMainWorld('learningSignals', learningSignalsAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  const globalWindow = window as typeof window & {
    electron: typeof electronAPI
    llm: typeof llmAPI
    file: typeof fileAPI
    agent: typeof agentAPI
    chat: typeof chatAPI
    rag: typeof ragAPI
    task: typeof taskAPI
    webAssistant: typeof webAssistantAPI
    quickSearch: typeof quickSearchAPI
    learningSignals: typeof learningSignalsAPI
  }
  globalWindow.electron = electronAPI
  globalWindow.llm = llmAPI
  globalWindow.file = fileAPI
  globalWindow.agent = agentAPI
  globalWindow.chat = chatAPI
  globalWindow.rag = ragAPI
  globalWindow.task = taskAPI
  globalWindow.webAssistant = webAssistantAPI
  globalWindow.quickSearch = quickSearchAPI
  globalWindow.learningSignals = learningSignalsAPI
}
