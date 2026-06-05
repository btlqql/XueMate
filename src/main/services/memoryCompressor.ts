import { chat } from './llm'
import { loadArchive, saveArchive } from './memoryArchive'
import type { ArchiveModule, UserMemory } from '../domain/memory'

// 每个模块独立的压缩阈值
const COMPRESS_THRESHOLD = 5

// 压缩单个模块：把新记录合并进旧摘要，覆盖写回
async function compressModule(
  module: ArchiveModule,
  label: string,
  newItems: string[]
): Promise<void> {
  if (newItems.length < COMPRESS_THRESHOLD) return

  const oldSummary = loadArchive(module)

  const prompt = `你是学习档案助手。把以下新记录合并到已有摘要中，输出更新后的摘要（100-200字）。
保留已有关键信息，融入新内容，丢弃重复和细节。

已有摘要：${oldSummary || '（无）'}
新记录：${newItems.join('、')}

直接输出更新后的摘要文字，不要标题和格式。`

  const summary = await chat({
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: '请归纳' }
    ],
    temperature: 0.3,
    maxTokens: 512
  })

  if (summary && summary.length > 10) {
    saveArchive(module, summary)
    console.log(`[Memory] 归档[${module}]完成，${newItems.length}条记录已压缩`)
  }
}

// 检查各模块是否需要压缩，独立触发
export async function compressMemoryIfNeeded(
  memory: UserMemory,
  saveMemory: (memory: UserMemory) => void
): Promise<void> {
  const { topics, weakPoints, strongPoints } = memory.history

  const tasks: Promise<void>[] = []
  if (topics.length >= COMPRESS_THRESHOLD) {
    tasks.push(compressModule('topics', '学过的内容', topics))
  }
  if (weakPoints.length >= COMPRESS_THRESHOLD) {
    tasks.push(compressModule('weak', '薄弱环节', weakPoints))
  }
  if (strongPoints.length >= COMPRESS_THRESHOLD) {
    tasks.push(compressModule('strong', '掌握较好', strongPoints))
  }

  if (tasks.length === 0) return

  console.log(`[Memory] 触发 ${tasks.length} 个模块归档压缩...`)

  try {
    await Promise.all(tasks)

    // 清空已压缩的数组
    if (topics.length >= COMPRESS_THRESHOLD) memory.history.topics = []
    if (weakPoints.length >= COMPRESS_THRESHOLD) memory.history.weakPoints = []
    if (strongPoints.length >= COMPRESS_THRESHOLD) memory.history.strongPoints = []
    saveMemory(memory)
  } catch (e) {
    console.error('[Memory] 归档压缩失败:', e)
  }
}
