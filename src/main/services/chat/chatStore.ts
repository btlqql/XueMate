import { randomUUID } from 'crypto'
import type { ChatMessage, Conversation } from '../../domain/chat'
import * as chatDao from '../../dao/chatDao'
import { rowToChatMessage, rowToConversation } from '../../mappers/chatMapper'

export type { ChatMessage, Conversation } from '../../domain/chat'

const MAX_MESSAGES = 500
const DEFAULT_TITLE = '新对话'
const TITLE_PREVIEW_LENGTH = 20

// 获取所有会话（不含消息内容，但保留空 messages 兼容前端预览逻辑）
export function getConversations(): Conversation[] {
  return chatDao.findConversations().map((row) => rowToConversation(row, []))
}

// 获取单个会话（含完整消息）
export function getConversation(id: string): Conversation | null {
  const row = chatDao.findConversationById(id)
  if (!row) return null

  const messages = chatDao.findMessagesByConversationId(id).map(rowToChatMessage)
  return rowToConversation(row, messages)
}

// 新建会话
export function createConversation(): string {
  const id = randomUUID()
  const now = Date.now()

  chatDao.insertConversation({
    id,
    title: DEFAULT_TITLE,
    created_at: now,
    updated_at: now
  })

  return id
}

// 删除会话（CASCADE 自动删消息）
export function deleteConversation(id: string): boolean {
  return chatDao.deleteConversation(id) > 0
}

// 添加消息
export function addMessage(conversationId: string, message: ChatMessage): boolean {
  chatDao.insertMessage(conversationId, message)
  trimOldMessagesIfNeeded(conversationId)
  updateDefaultTitleIfFirstUserMessage(conversationId, message)
  chatDao.updateConversationTime(conversationId, Date.now())
  return true
}

// 更新会话标题
export function updateTitle(conversationId: string, title: string): boolean {
  return chatDao.updateTitle(conversationId, title) > 0
}

function trimOldMessagesIfNeeded(conversationId: string): void {
  const messageCount = chatDao.countMessages(conversationId)
  if (messageCount > MAX_MESSAGES) {
    chatDao.trimMessages(conversationId, MAX_MESSAGES)
  }
}

function updateDefaultTitleIfFirstUserMessage(conversationId: string, message: ChatMessage): void {
  if (message.role !== 'user') return

  const conversation = chatDao.findConversationById(conversationId)
  if (conversation?.title === DEFAULT_TITLE) {
    chatDao.updateTitle(conversationId, message.content.slice(0, TITLE_PREVIEW_LENGTH))
  }
}
