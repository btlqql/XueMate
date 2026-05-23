import { chat } from './llm'
import db from './db'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.env.HOME || '/tmp', '.xuemate')
const ARCHIVE_DIR = join(DATA_DIR, 'archives')

type ArchiveModule = 'topics' | 'weak' | 'strong'
const ARCHIVE_FILES: Record<ArchiveModule, string> = {
  topics: join(ARCHIVE_DIR, 'topics.md'),
  weak: join(ARCHIVE_DIR, 'weak.md'),
  strong: join(ARCHIVE_DIR, 'strong.md')
}

export interface UserMemory {
  profile: {
    name: string
    school: string
    grade: string
    major: string
    learningGoals: string[]
  }
  preferences: {
    subjects: string[]
    difficulty: 'easy' | 'medium' | 'hard'
    language: 'zh' | 'en'
  }
  history: {
    topics: string[]
    weakPoints: string[]
    strongPoints: string[]
  }
  lastUpdated: number
}

const DEFAULT_MEMORY: UserMemory = {
  profile: { name: '', school: '', grade: '', major: '', learningGoals: [] },
  preferences: { subjects: [], difficulty: 'medium', language: 'zh' },
  history: { topics: [], weakPoints: [], strongPoints: [] },
  lastUpdated: 0
}

const stmtGet = db.prepare('SELECT data FROM memory WHERE id = 1')
const stmtSave = db.prepare('INSERT OR REPLACE INTO memory (id, data, updated_at) VALUES (1, ?, ?)')

export function getMemory(): UserMemory {
  try {
    const row = stmtGet.get() as any
    if (!row) return { ...DEFAULT_MEMORY }
    return JSON.parse(row.data)
  } catch {
    return { ...DEFAULT_MEMORY }
  }
}

export function saveMemory(memory: UserMemory): void {
  memory.lastUpdated = Date.now()
  stmtSave.run(JSON.stringify(memory), memory.lastUpdated)
}

// 判断是否为新用户（没有基本资料）
function isNewUser(memory: UserMemory): boolean {
  return !memory.profile.name && !memory.profile.grade
}

// 构建注入记忆的系统提示词
export function buildSystemPrompt(memory: UserMemory): string {
  const parts = [
    '你是 XueMate 智能学习助手，面向中小学生。友好、耐心、善于引导思考。',
    '用 Markdown 回答，适当使用标题、列表、代码块。禁止推荐不适合学生的内容。',
    '',
    '【组件动画规则】需要可视化时，不要输出 SVG/XML/HTML。请输出 ```animation 代码块，里面只放 JSON，由前端组件渲染。',
    '支持三种动画组件：',
    '1. 排序动画 type=sorting：用于冒泡排序、选择排序、插入排序等数组排序。',
    '格式示例：```animation\n{"type":"sorting","title":"冒泡排序","data":{"array":[5,3,8,1],"steps":[{"a":"compare","i":0,"j":1,"d":"比较5和3"},{"a":"swap","i":0,"j":1,"r":[3,5,8,1],"d":"5>3，交换"},{"a":"sorted","i":3,"d":"最大值已就位"},{"a":"done","r":[1,3,5,8],"d":"排序完成"}]}}\n```',
    'sorting 步骤动作：compare(i,j,d), swap(i,j,r,d), sorted(i,d), done(r,d)。数组长度控制在 4-8。',
    '2. 步骤动画 type=steps/process：用于实验步骤、解题流程、科学过程、概念演示。',
    '格式示例：```animation\n{"type":"steps","title":"解题流程","data":{"steps":[{"title":"读题","desc":"圈出已知条件和目标"},{"title":"建模","desc":"把文字转成公式","items":["确定变量","列方程"]}]}}\n```',
    '回答时先用文字解释，再给 animation JSON。JSON 必须合法，不能有注释、尾逗号、Markdown 列表。除非用户明确要求源码，否则禁止输出 ```svg。'
  ]

  // 新用户：提醒 AI 在回复末尾自然地询问基本信息
  if (isNewUser(memory)) {
    parts.push(
      '【重要】这是新用户，你还不了解 TA。请在每次回复的末尾，用一句话自然地询问学生的基本信息（姓名、年级、正在学的科目）。',
      '例如："对了，方便告诉我你叫什么、上几年级吗？这样我可以更好地帮到你~"',
      '不要一上来就问，先回答用户的问题，再自然地补一句。'
    )
  }

  if (memory.profile.name) parts.push(`学生姓名：${memory.profile.name}`)
  if (memory.profile.grade) parts.push(`年级：${memory.profile.grade}`)
  if (memory.profile.school) parts.push(`学校：${memory.profile.school}`)
  if (memory.preferences.subjects.length > 0) {
    parts.push(`正在学习的科目：${memory.preferences.subjects.join('、')}`)
  }

  // 注入分类归档摘要
  const topicsArchive = loadArchive('topics')
  const weakArchive = loadArchive('weak')
  const strongArchive = loadArchive('strong')

  if (topicsArchive || weakArchive || strongArchive) {
    parts.push('', '【学习档案】')
    if (topicsArchive) parts.push(`学过的内容：${topicsArchive}`)
    if (weakArchive) parts.push(`薄弱环节：${weakArchive}`)
    if (strongArchive) parts.push(`掌握较好：${strongArchive}`)
  }

  return parts.join('\n')
}

// 后台异步提取记忆
export async function extractMemory(
  recentMessages: { role: string; content: string }[],
  currentMemory: UserMemory
): Promise<UserMemory> {
  try {
    const conversationText = recentMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')

    const needProfile = !currentMemory.profile.name || !currentMemory.profile.grade

    const prompt = `从对话中提取学生信息。
当前已知：${JSON.stringify(currentMemory.profile)}
对话：
${conversationText}
返回JSON：
{
  "profile": {"name":"","grade":"","school":""},
  "preferences": {"subjects":[]},
  "topics": [],
  "weakPoints": [],
  "strongPoints": []
}
- profile/preferences：只填有新信息的字段，没有的留空
- topics：本次对话讨论的知识点（如"冒泡排序""二次方程"），没有则空数组
- weakPoints：学生不理解/做错的点，没有则空数组
- strongPoints：学生掌握好的点，没有则空数组
只返回JSON。`

    const result = await chat({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: '请提取信息' }
      ],
      temperature: 0.1,
      maxTokens: 512
    })

    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const updated = { ...currentMemory }

      if (needProfile) {
        updated.profile = { ...currentMemory.profile, ...parsed.profile }
        updated.preferences = { ...currentMemory.preferences, ...parsed.preferences }
      }

      // 追加学习记录到 history
      if (parsed.topics?.length) {
        updated.history = {
          ...updated.history,
          topics: [...updated.history.topics, ...parsed.topics]
        }
      }
      if (parsed.weakPoints?.length) {
        updated.history = {
          ...updated.history,
          weakPoints: [...updated.history.weakPoints, ...parsed.weakPoints]
        }
      }
      if (parsed.strongPoints?.length) {
        updated.history = {
          ...updated.history,
          strongPoints: [...updated.history.strongPoints, ...parsed.strongPoints]
        }
      }

      updated.lastUpdated = Date.now()
      return updated
    }
  } catch (e) {
    console.error('[Memory] 提取失败:', e)
  }
  return currentMemory
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
function saveArchive(module: ArchiveModule, text: string): void {
  try {
    if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true })
    writeFileSync(ARCHIVE_FILES[module], text, 'utf-8')
  } catch (e) {
    console.error(`[Memory] 保存归档[${module}]失败:`, e)
  }
}

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
export async function compressMemoryIfNeeded(memory: UserMemory): Promise<void> {
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
