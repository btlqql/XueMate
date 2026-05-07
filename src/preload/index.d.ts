interface LLMResult {
  success: boolean
  data?: string
  error?: string
}

interface LLMAPI {
  parseTask: (text: string) => Promise<LLMResult>
  tutorCode: (code: string, type: 'code' | 'report') => Promise<LLMResult>
  organizeFiles: (fileNames: string[]) => Promise<LLMResult>
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

interface ChatAPI {
  getConversations: () => Promise<{ success: boolean; data?: any[]; error?: string }>
  getConversation: (id: string) => Promise<{ success: boolean; data?: any; error?: string }>
  createConversation: () => Promise<{ success: boolean; data?: string; error?: string }>
  deleteConversation: (id: string) => Promise<{ success: boolean; error?: string }>
  sendMessage: (convId: string, content: string) => Promise<{ success: boolean; data?: string; error?: string }>
  getMemory: () => Promise<{ success: boolean; data?: any; error?: string }>
}

declare global {
  interface Window {
    llm: LLMAPI
    file: FileAPI
    agent: AgentAPI
    chat: ChatAPI
  }
}

export {}
