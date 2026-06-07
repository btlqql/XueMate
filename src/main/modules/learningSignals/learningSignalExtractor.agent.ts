import { chat } from '../../services/llm'
import { getErrorMessage } from '../../shared/errors'
import { upsertLearningSignals } from './learningSignal.store'
import type { LearningSignalDraft, LearningSignalType } from './learningSignal.domain'

interface ChatLikeMessage {
  role: string
  content: string
}

const PREFILTER_RE =
  /不会|不懂|没懂|没理解|看不懂|卡住|薄弱|总是错|做错|难在|错在|今天|今晚|明天|后天|截止|提交|要交|完成|作业|练习|报告|作文|代码|项目|资料不够|没有资料|缺资料|补资料|查网页|找资料|课件/

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTitle(value: unknown): string {
  return String(value || '')
    .replace(/[`*_#>\-[\](){}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
}

function normalizeType(value: unknown): LearningSignalType | null {
  if (value === 'todo' || value === 'weak_point' || value === 'material_gap') return value
  return null
}

function sentenceAroundMatch(text: string, pattern: RegExp): string {
  const match = text.match(pattern)
  if (!match) return ''
  const index = match.index || 0
  const start = Math.max(0, text.lastIndexOf('。', index), text.lastIndexOf('\n', index))
  const endCandidates = ['。', '！', '？', '\n']
    .map((char) => text.indexOf(char, index + match[0].length))
    .filter((position) => position > index)
  const end = endCandidates.length ? Math.min(...endCandidates) : index + 56
  return text.slice(start, end)
}

function createDraft(
  type: LearningSignalType,
  title: string,
  reason: string
): LearningSignalDraft | null {
  const cleanTitle = normalizeTitle(title)
  if (!cleanTitle || cleanTitle.length < 2) return null
  return { type, title: cleanTitle, reason, source: 'agent' }
}

function pushDraft(
  drafts: LearningSignalDraft[],
  type: LearningSignalType,
  title: string,
  reason: string
): void {
  const draft = createDraft(type, title, reason)
  if (draft) drafts.push(draft)
}

function fallbackExtract(messages: ChatLikeMessage[]): LearningSignalDraft[] {
  const drafts: LearningSignalDraft[] = []
  const recent = messages.slice(-12)

  for (const message of recent) {
    const content = String(message.content || '').trim()
    if (!content || !PREFILTER_RE.test(content)) continue

    const weakMatch = content.match(
      /(?:不会|不懂|没懂|没理解|看不懂|卡住|薄弱|难在|错在)(?:的是|了|：|:)?([^。？！\n，,]{2,32})/
    )
    if (/不会|不懂|没懂|没理解|看不懂|卡住|薄弱|总是错|做错|难/.test(content)) {
      pushDraft(
        drafts,
        'weak_point',
        weakMatch?.[1] ||
          sentenceAroundMatch(content, /不会|不懂|没懂|没理解|看不懂|卡住|薄弱|总是错|做错|难/),
        '聊天中出现不理解或卡住的表达'
      )
    }

    const todoMatch = content.match(
      /((?:今天|今晚|明天|后天|周[一二三四五六日天]|本周|下周|截止|提交|要交|完成)[^。？！\n]{0,40}(?:作业|练习|报告|作文|代码|项目)|(?:作业|练习|报告|作文|代码|项目)[^。？！\n]{0,40}(?:提交|截止|要交|完成))/
    )
    if (todoMatch?.[1]) {
      pushDraft(drafts, 'todo', todoMatch[1], '聊天中出现时间、提交或完成要求')
    }

    const gapMatch = content.match(
      /(?:缺少|没有|资料不够|补充|查找|查网页|找一版)([^。？！\n]{2,34}(?:资料|课件|例题|练习|解释|网页))/
    )
    if (/资料不够|没有资料|缺资料|补资料|查网页|找资料|课件/.test(content)) {
      pushDraft(
        drafts,
        'material_gap',
        gapMatch?.[1] ||
          sentenceAroundMatch(content, /资料不够|没有资料|缺资料|补资料|查网页|找资料/),
        '聊天中出现资料缺口'
      )
    }
  }

  return drafts.slice(0, 8)
}

function parseModelSignals(raw: string): LearningSignalDraft[] {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []
  const parsed = JSON.parse(match[0]) as unknown
  if (!isRecord(parsed) || !Array.isArray(parsed.signals)) return []

  const drafts: LearningSignalDraft[] = []
  for (const item of parsed.signals.slice(0, 8)) {
    if (!isRecord(item)) continue
    const type = normalizeType(item.type)
    const title = normalizeTitle(item.title)
    if (!type || !title) continue
    drafts.push({
      type,
      title,
      reason: normalizeTitle(item.reason || '后台学习线索整理'),
      source: 'agent'
    })
  }
  return drafts
}

async function organizeWithModel(messages: ChatLikeMessage[]): Promise<LearningSignalDraft[]> {
  const conversationText = messages
    .slice(-12)
    .map((message) => `${message.role}: ${message.content.slice(0, 260)}`)
    .join('\n')

  const result = await chat({
    messages: [
      {
        role: 'system',
        content: `你是 XueMate 的后台学习线索抽取 agent。先基于关键词候选，再整理成可操作线索。
只抽取三类：
- todo：明确待处理/提交/完成事项
- weak_point：学生不会、不懂、做错、卡住的知识点
- material_gap：资料不够、需要补课件/网页/例题
不要抽闲聊，不要虚构。每类最多2条。只返回JSON：
{"signals":[{"type":"todo|weak_point|material_gap","title":"短标题","reason":"不超过20字证据"}]}`
      },
      { role: 'user', content: conversationText }
    ],
    temperature: 0.1,
    maxTokens: 700,
    timeoutMs: 12000
  })

  return parseModelSignals(result)
}

export function hasLearningSignalKeywords(messages: ChatLikeMessage[]): boolean {
  return messages.slice(-12).some((message) => PREFILTER_RE.test(message.content || ''))
}

export async function extractAndSaveLearningSignals(
  conversationId: string,
  messages: ChatLikeMessage[]
): Promise<void> {
  if (!conversationId || !hasLearningSignalKeywords(messages)) return

  let drafts: LearningSignalDraft[] = []
  try {
    drafts = await organizeWithModel(messages)
  } catch (error) {
    console.warn('[LearningSignals] 模型整理失败，降级规则抽取:', getErrorMessage(error))
  }

  if (drafts.length === 0) {
    drafts = fallbackExtract(messages)
  }

  if (drafts.length > 0) {
    upsertLearningSignals(conversationId, drafts)
  }
}
