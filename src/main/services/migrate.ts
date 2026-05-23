import { existsSync, readFileSync, renameSync, mkdirSync } from 'fs'
import { join } from 'path'
import db from './db'

const DATA_DIR = join(process.env.HOME || '/tmp', '.xuemate')

export function migrateFromJson(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
    return
  }

  console.log('[Migrate] 检查旧数据文件...')

  migrateConversations()
  migrateMemory()
  migrateDocuments()
  migrateChunks()

  console.log('[Migrate] 迁移完成')
}

function migrateConversations(): void {
  const file = join(DATA_DIR, 'conversations.json')
  if (!existsSync(file)) return

  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'))
    if (!data.conversations || !Array.isArray(data.conversations)) return

    const count = db.prepare('SELECT COUNT(*) as cnt FROM conversations').get() as any
    if (count.cnt > 0) {
      console.log('[Migrate] conversations 表已有数据，跳过')
      return
    }

    const insertConv = db.prepare(
      'INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
    )
    const insertMsg = db.prepare(
      'INSERT OR IGNORE INTO messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
    )

    const migrate = db.transaction(() => {
      for (const conv of data.conversations) {
        insertConv.run(conv.id, conv.title, conv.createdAt, conv.updatedAt)
        for (const msg of conv.messages || []) {
          insertMsg.run(msg.id, conv.id, msg.role, msg.content, msg.timestamp)
        }
      }
    })
    migrate()

    renameSync(file, file + '.bak')
    console.log(`[Migrate] conversations: 迁移了 ${data.conversations.length} 个会话`)
  } catch (e) {
    console.error('[Migrate] conversations 迁移失败:', e)
  }
}

function migrateMemory(): void {
  const file = join(DATA_DIR, 'memory.json')
  if (!existsSync(file)) return

  try {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM memory').get() as any
    if (count.cnt > 0) {
      console.log('[Migrate] memory 表已有数据，跳过')
      return
    }

    const data = readFileSync(file, 'utf-8')
    JSON.parse(data)

    db.prepare('INSERT INTO memory (id, data, updated_at) VALUES (1, ?, ?)').run(data, Date.now())

    renameSync(file, file + '.bak')
    console.log('[Migrate] memory: 迁移完成')
  } catch (e) {
    console.error('[Migrate] memory 迁移失败:', e)
  }
}

function migrateDocuments(): void {
  const file = join(DATA_DIR, 'knowledge_docs.json')
  if (!existsSync(file)) return

  try {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM documents').get() as any
    if (count.cnt > 0) {
      console.log('[Migrate] documents 表已有数据，跳过')
      return
    }

    const docs = JSON.parse(readFileSync(file, 'utf-8'))
    if (!Array.isArray(docs)) return

    const insert = db.prepare(
      'INSERT INTO documents (id, file_name, chunk_count, created_at) VALUES (?, ?, ?, ?)'
    )

    const migrate = db.transaction(() => {
      for (const doc of docs) {
        insert.run(doc.id, doc.fileName, doc.chunkCount, doc.createdAt)
      }
    })
    migrate()

    renameSync(file, file + '.bak')
    console.log(`[Migrate] documents: 迁移了 ${docs.length} 个文档`)
  } catch (e) {
    console.error('[Migrate] documents 迁移失败:', e)
  }
}

function migrateChunks(): void {
  const file = join(DATA_DIR, 'knowledge_chunks.bin.json')
  if (!existsSync(file)) return

  try {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as any
    if (count.cnt > 0) {
      console.log('[Migrate] chunks 表已有数据，跳过')
      return
    }

    const rawChunks = JSON.parse(readFileSync(file, 'utf-8'))
    if (!Array.isArray(rawChunks)) return

    const insert = db.prepare(
      'INSERT INTO chunks (id, document_id, file_name, content, embedding, start_pos, end_pos, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )

    const migrate = db.transaction(() => {
      for (const chunk of rawChunks) {
        const embeddingBuf = Buffer.from(chunk.embedding, 'base64')
        insert.run(
          chunk.id,
          chunk.docId,
          chunk.fileName,
          chunk.content,
          embeddingBuf,
          chunk.startPos,
          chunk.endPos,
          chunk.createdAt
        )
      }
    })
    migrate()

    renameSync(file, file + '.bak')
    console.log(`[Migrate] chunks: 迁移了 ${rawChunks.length} 个分块`)
  } catch (e) {
    console.error('[Migrate] chunks 迁移失败:', e)
  }
}
