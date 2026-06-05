import db from '../services/db'
import type { ChatRole } from '../domain/chat'

export interface ConversationRow {
  id: string
  title: string
  created_at: number
  updated_at: number
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: ChatRole
  content: string
  timestamp: number
}

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
  updateConversationTime: db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?'),
  updateTitle: db.prepare('UPDATE conversations SET title = ? WHERE id = ?'),
  countMessages: db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?'),
  trimMessages: db.prepare(`
    DELETE FROM messages WHERE conversation_id = ? AND id NOT IN (
      SELECT id FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?
    )
  `)
}

export function findConversations(): ConversationRow[] {
  return stmts.listConversations.all() as ConversationRow[]
}

export function findConversationById(id: string): ConversationRow | null {
  return (stmts.getConversation.get(id) as ConversationRow | undefined) ?? null
}

export function findMessagesByConversationId(conversationId: string): MessageRow[] {
  return stmts.getMessages.all(conversationId) as MessageRow[]
}

export function insertConversation(row: ConversationRow): void {
  stmts.insertConversation.run(row.id, row.title, row.created_at, row.updated_at)
}

export function deleteConversation(id: string): number {
  const result = stmts.deleteConversation.run(id)
  return result.changes
}

export function insertMessage(conversationId: string, row: Omit<MessageRow, 'conversation_id'>): void {
  stmts.insertMessage.run(row.id, conversationId, row.role, row.content, row.timestamp)
}

export function updateConversationTime(id: string, updatedAt: number): number {
  const result = stmts.updateConversationTime.run(updatedAt, id)
  return result.changes
}

export function updateTitle(id: string, title: string): number {
  const result = stmts.updateTitle.run(title, id)
  return result.changes
}

export function countMessages(conversationId: string): number {
  const row = stmts.countMessages.get(conversationId) as { cnt: number }
  return row.cnt
}

export function trimMessages(conversationId: string, maxMessages: number): number {
  const result = stmts.trimMessages.run(conversationId, conversationId, maxMessages)
  return result.changes
}
