import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const llmAPI = {
  parseTask: (text: string) => ipcRenderer.invoke('llm:parseTask', text),
  tutorCode: (code: string, type: 'code' | 'report') => ipcRenderer.invoke('llm:tutorCode', code, type),
  organizeFiles: (fileNames: string[]) => ipcRenderer.invoke('llm:organizeFiles', fileNames),
  generateReview: (courseName: string) => ipcRenderer.invoke('llm:generateReview', courseName),
  judgeCode: (problem: string, code: string, language: string) => ipcRenderer.invoke('llm:judgeCode', problem, code, language),
  generateProblems: (topic: string, count: number) => ipcRenderer.invoke('llm:generateProblems', topic, count)
}

const fileAPI = {
  selectPDF: () => ipcRenderer.invoke('file:selectPDF'),
  checkPDF: (filePath: string) => ipcRenderer.invoke('file:checkPDF', filePath),
  scanDir: (dirPath?: string) => ipcRenderer.invoke('file:scanDir', dirPath),
  organize: (fileNames: string[]) => ipcRenderer.invoke('file:organize', fileNames),
  renameBatch: (operations: { from: string; to: string }[]) => ipcRenderer.invoke('file:renameBatch', operations)
}

const chatAPI = {
  getConversations: () => ipcRenderer.invoke('chat:getConversations'),
  getConversation: (id: string) => ipcRenderer.invoke('chat:getConversation', id),
  createConversation: () => ipcRenderer.invoke('chat:createConversation'),
  deleteConversation: (id: string) => ipcRenderer.invoke('chat:deleteConversation', id),
  sendMessage: (convId: string, content: string) => ipcRenderer.invoke('chat:sendMessage', convId, content),
  getMemory: () => ipcRenderer.invoke('chat:getMemory')
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
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.llm = llmAPI
  window.file = fileAPI
  window.agent = agentAPI
  window.chat = chatAPI
}
