import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  sendMessage: (convId: string, content: string, options?: { collectionId?: string }) =>
    ipcRenderer.invoke('chat:sendMessage', convId, content, options),
  getMemory: () => ipcRenderer.invoke('chat:getMemory'),
  onStreamToken: (callback: (token: string) => void) => {
    const handler = (_event: any, token: string) => callback(token)
    ipcRenderer.on('chat:stream-token', handler)
    return () => ipcRenderer.removeListener('chat:stream-token', handler)
  },
  onStreamDone: (callback: (fullContent: string) => void) => {
    const handler = (_event: any, content: string) => callback(content)
    ipcRenderer.on('chat:stream-done', handler)
    return () => ipcRenderer.removeListener('chat:stream-done', handler)
  },
  onStreamError: (callback: (error: string) => void) => {
    const handler = (_event: any, error: string) => callback(error)
    ipcRenderer.on('chat:stream-error', handler)
    return () => ipcRenderer.removeListener('chat:stream-error', handler)
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
  run: (query: string) => ipcRenderer.invoke('quickSearch:run', query)
}

const webAssistantAPI = {
  start: (goal: string) => ipcRenderer.invoke('webAssistant:start', goal),
  stop: () => ipcRenderer.invoke('webAssistant:stop'),
  setLiveBounds: (bounds: { x: number; y: number; width: number; height: number } | null) =>
    ipcRenderer.invoke('webAssistant:setLiveBounds', bounds),
  onUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('webAssistant:update', handler)
    return () => ipcRenderer.removeListener('webAssistant:update', handler)
  }
}

const taskAPI = {
  getAll: () => ipcRenderer.invoke('task:getAll'),
  add: (tasks: any[]) => ipcRenderer.invoke('task:add', tasks),
  update: (id: string, fields: Record<string, any>) =>
    ipcRenderer.invoke('task:update', id, fields),
  delete: (id: string) => ipcRenderer.invoke('task:delete', id),
  toggle: (id: string) => ipcRenderer.invoke('task:toggle', id)
}

const agentAPI = {
  start: (task: string) => ipcRenderer.invoke('agent:start', task),
  stop: () => ipcRenderer.invoke('agent:stop'),
  confirmResult: (approved: boolean) => ipcRenderer.invoke('agent:confirmResult', approved),
  onUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('agent:update', handler)
    return () => ipcRenderer.removeListener('agent:update', handler)
  },
  onConfirm: (callback: (data: { command: string; reason: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
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
}
