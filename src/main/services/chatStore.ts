import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const DATA_DIR = join(process.env.HOME || '/tmp', '.xuemate')
const STORE_FILE = join(DATA_DIR, 'conversations.json')

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface Store {
  conversations: Conversation[]
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function loadStore(): Store {
  ensureDir()
  if (!existsSync(STORE_FILE)) {
    return { conversations: [] }
  }
  try {
    return JSON.parse(readFileSync(STORE_FILE, 'utf-8'))
  } catch {
    return { conversations: [] }
  }
}

function saveStore(store: Store): void {
  ensureDir()
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2))
}

// 获取所有会话（不含完整消息，只返回摘要）
export function getConversations(): Omit<Conversation, 'messages'>[] {
  const store = loadStore()
  return store.conversations.map(c => ({
    id: c.id,
    title: c.title,
    messages: [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }))
}

// 获取单个会话（含完整消息）
export function getConversation(id: string): Conversation | null {
  const store = loadStore()
  return store.conversations.find(c => c.id === id) || null
}

// 新建会话
export function createConversation(): string {
  const store = loadStore()
  const conv: Conversation = {
    id: randomUUID(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  store.conversations.unshift(conv)
  saveStore(store)
  return conv.id
}

// 删除会话
export function deleteConversation(id: string): boolean {
  const store = loadStore()
  const idx = store.conversations.findIndex(c => c.id === id)
  if (idx === -1) return false
  store.conversations.splice(idx, 1)
  saveStore(store)
  return true
}

// 添加消息
export function addMessage(convId: string, msg: ChatMessage): boolean {
  const store = loadStore()
  const conv = store.conversations.find(c => c.id === convId)
  if (!conv) return false
  conv.messages.push(msg)
  // 第一条用户消息自动设为标题
  if (conv.title === '新对话' && msg.role === 'user') {
    conv.title = msg.content.slice(0, 20)
  }
  conv.updatedAt = Date.now()
  saveStore(store)
  return true
}

// 更新会话标题
export function updateTitle(convId: string, title: string): boolean {
  const store = loadStore()
  const conv = store.conversations.find(c => c.id === convId)
  if (!conv) return false
  conv.title = title
  saveStore(store)
  return true
}
