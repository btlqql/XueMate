import type { ChatMessage, Conversation } from '../domain/chat'
import type { ConversationRow, MessageRow } from '../dao/chatDao'

export function rowToChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp
  }
}

export function rowToConversation(row: ConversationRow, messages: ChatMessage[] = []): Conversation {
  return {
    id: row.id,
    title: row.title,
    messages,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
