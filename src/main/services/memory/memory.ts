import { compressMemoryIfNeeded as compressMemoryIfNeededInternal } from './memoryCompressor'
import { extractMemory as extractMemoryInternal } from './memoryExtractor'
import { normalizeMemory } from './memoryNormalizer'
import * as memoryDao from '../../dao/memoryDao'
import type { UserMemory } from '../../domain/memory'
import { DEFAULT_MEMORY } from '../../domain/memory'

export { buildSystemPrompt } from './memoryPrompt'

export { loadArchive } from './memoryArchive'

export type {
  ArchiveModule,
  LearningProfileMemory,
  LearningSkillMemory,
  MemoryAtom,
  MemoryCategory,
  MemoryMetrics,
  UserMemory
} from '../../domain/memory'

export function getMemory(): UserMemory {
  try {
    const data = memoryDao.loadMemoryData()
    if (!data) return normalizeMemory({ ...DEFAULT_MEMORY })
    return normalizeMemory(JSON.parse(data))
  } catch {
    return normalizeMemory({ ...DEFAULT_MEMORY })
  }
}

export function saveMemory(memory: UserMemory): void {
  memory = normalizeMemory(memory)
  memory.lastUpdated = Date.now()
  memoryDao.saveMemoryData(JSON.stringify(memory), memory.lastUpdated)
}

export async function extractMemory(
  recentMessages: { role: string; content: string }[],
  currentMemory: UserMemory
): Promise<UserMemory> {
  return extractMemoryInternal(recentMessages, currentMemory, normalizeMemory)
}

export async function compressMemoryIfNeeded(memory: UserMemory): Promise<void> {
  return compressMemoryIfNeededInternal(memory, saveMemory)
}
