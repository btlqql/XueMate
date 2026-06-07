import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ArchiveModule } from '../../domain/memory'

const DATA_DIR = join(process.env.HOME || '/tmp', '.xuemate')
const ARCHIVE_DIR = join(DATA_DIR, 'archives')

const ARCHIVE_FILES: Record<ArchiveModule, string> = {
  topics: join(ARCHIVE_DIR, 'topics.md'),
  weak: join(ARCHIVE_DIR, 'weak.md'),
  strong: join(ARCHIVE_DIR, 'strong.md')
}

// 从沙箱加载某模块的归档摘要
export function loadArchive(module: ArchiveModule): string {
  try {
    const path = ARCHIVE_FILES[module]
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8').trim()
    }
  } catch {}
  return ''
}

// 保存某模块的归档摘要（覆盖式更新，不是追加）
export function saveArchive(module: ArchiveModule, text: string): void {
  try {
    if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true })
    writeFileSync(ARCHIVE_FILES[module], text, 'utf-8')
  } catch (e) {
    console.error(`[Memory] 保存归档[${module}]失败:`, e)
  }
}
