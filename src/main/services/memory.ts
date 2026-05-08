import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { chat } from './llm'

const DATA_DIR = join(process.env.HOME || '/tmp', '.xuemate')
const MEMORY_FILE = join(DATA_DIR, 'memory.json')

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

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function getMemory(): UserMemory {
  ensureDir()
  if (!existsSync(MEMORY_FILE)) {
    return { ...DEFAULT_MEMORY }
  }
  try {
    return JSON.parse(readFileSync(MEMORY_FILE, 'utf-8'))
  } catch {
    return { ...DEFAULT_MEMORY }
  }
}

export function saveMemory(memory: UserMemory): void {
  ensureDir()
  memory.lastUpdated = Date.now()
  writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2))
}

// 判断是否为新用户（没有基本资料）
function isNewUser(memory: UserMemory): boolean {
  return !memory.profile.name && !memory.profile.grade
}

// 构建注入记忆的系统提示词
export function buildSystemPrompt(memory: UserMemory): string {
  const parts = [
    '你是 XueMate 智能学习助手，面向中小学生。你友好、耐心、善于引导思考。',
    '请用 Markdown 格式回答，适当使用标题、列表、代码块等。',
    '禁止推荐任何不适合学生的内容。'
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
  if (memory.history.topics.length > 0) {
    parts.push(`最近讨论过的话题：${memory.history.topics.slice(-10).join('、')}`)
  }
  if (memory.history.weakPoints.length > 0) {
    parts.push(`薄弱环节：${memory.history.weakPoints.join('、')}`)
  }
  if (memory.history.strongPoints.length > 0) {
    parts.push(`擅长领域：${memory.history.strongPoints.join('、')}`)
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
      .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')

    const prompt = `你是一个信息提取助手。分析以下对话，提取学生的关键信息。

当前已知信息：
${JSON.stringify(currentMemory, null, 2)}

最近对话：
${conversationText}

请返回更新后的完整信息（JSON格式，保持原有字段结构），只更新有新信息的字段。
如果对话中没有值得记录的新信息，返回原始信息不变。
只返回JSON，不要其他文字。`

    const result = await chat({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: '请提取信息' }
      ],
      temperature: 0.1,
      maxTokens: 1024
    })

    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      // 合并：保留原结构，只更新有值的字段
      return {
        profile: { ...currentMemory.profile, ...parsed.profile },
        preferences: { ...currentMemory.preferences, ...parsed.preferences },
        history: {
          topics: parsed.history?.topics || currentMemory.history.topics,
          weakPoints: parsed.history?.weakPoints || currentMemory.history.weakPoints,
          strongPoints: parsed.history?.strongPoints || currentMemory.history.strongPoints
        },
        lastUpdated: Date.now()
      }
    }
  } catch (e) {
    console.error('[Memory] 提取失败:', e)
  }
  return currentMemory
}
