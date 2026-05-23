import { randomUUID } from 'crypto'
import db from './db'

const MAX_MESSAGES = 500

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

// ── 预编译 SQL ──

const stmts = {
  listConversations: db.prepare(
    'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
  ),
  getConversation: db.prepare('SELECT * FROM conversations WHERE id = ?'),
  getMessages: db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
  ),
  insertConversation: db.prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ),
  deleteConversation: db.prepare('DELETE FROM conversations WHERE id = ?'),
  insertMessage: db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
  ),
  updateConvTime: db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?'),
  updateTitle: db.prepare('UPDATE conversations SET title = ? WHERE id = ?'),
  countMessages: db.prepare(
    'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?'
  ),
  trimMessages: db.prepare(`
    DELETE FROM messages WHERE conversation_id = ? AND id NOT IN (
      SELECT id FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?
    )
  `)
}

// 获取所有会话（不含消息）
export function getConversations(): Omit<Conversation, 'messages'>[] {
  const rows = stmts.listConversations.all() as any[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messages: [],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

// 获取单个会话（含完整消息）
export function getConversation(id: string): Conversation | null {
  const row = stmts.getConversation.get(id) as any
  if (!row) return null
  const msgs = stmts.getMessages.all(id) as any[]
  return {
    id: row.id,
    title: row.title,
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// 新建会话
export function createConversation(): string {
  const id = randomUUID()
  const now = Date.now()
  stmts.insertConversation.run(id, '新对话', now, now)
  return id
}

// 删除会话（CASCADE 自动删消息）
export function deleteConversation(id: string): boolean {
  const result = stmts.deleteConversation.run(id)
  return result.changes > 0
}

// 添加消息
export function addMessage(convId: string, msg: ChatMessage): boolean {
  stmts.insertMessage.run(msg.id, convId, msg.role, msg.content, msg.timestamp)

  // 消息上限
  const { cnt } = stmts.countMessages.get(convId) as any
  if (cnt > MAX_MESSAGES) {
    stmts.trimMessages.run(convId, convId, MAX_MESSAGES)
  }

  // 第一条用户消息自动设为标题
  if (msg.role === 'user') {
    const conv = stmts.getConversation.get(convId) as any
    if (conv && conv.title === '新对话') {
      stmts.updateTitle.run(msg.content.slice(0, 20), convId)
    }
  }

  stmts.updateConvTime.run(Date.now(), convId)
  return true
}

// 更新会话标题
export function updateTitle(convId: string, title: string): boolean {
  const result = stmts.updateTitle.run(title, convId)
  return result.changes > 0
}
