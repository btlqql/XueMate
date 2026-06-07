import { chat } from '../ai/llm'
import type { UserMemory } from '../../domain/memory'
import {
  addListMemories,
  clamp01,
  normalizeMemoryCategory,
  refreshMemoryDerivedState,
  uniqueStrings,
  upsertMemoryAtom
} from './memoryProfile'

// 后台异步提取记忆
export async function extractMemory(
  recentMessages: { role: string; content: string }[],
  currentMemory: UserMemory,
  normalizeMemory: (raw: Partial<UserMemory> | any) => UserMemory
): Promise<UserMemory> {
  try {
    const conversationText = recentMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')

    const prompt = `从对话中提取学生长期记忆。只记录对未来辅导有用、稳定、可复用的信息，不要记录一次性闲聊。
当前已知：${JSON.stringify(currentMemory.profile)}
对话：
${conversationText}
返回JSON：
{
  "profile": {"name":"","grade":"","school":""},
  "preferences": {"subjects":[],"difficulty":"","language":""},
  "topics": [],
  "weakPoints": [],
  "strongPoints": [],
  "memoryAtoms": [
    {
      "category": "preference/topic/weak_point/strong_point/goal/behavior/misconception",
      "key": "稳定短键，如 分数加法",
      "value": "面向老师可读的记忆内容",
      "confidence": 0.0,
      "importance": 0.0,
      "evidence": "不超过30字的证据句"
    }
  ]
}
- profile/preferences：只填有新信息的字段，没有的留空
- topics：本次对话讨论的知识点（如"冒泡排序""二次方程"），没有则空数组
- weakPoints：学生不理解/做错的点，没有则空数组
- strongPoints：学生掌握好的点，没有则空数组
- memoryAtoms：最多6条。confidence 表示确定性，importance 表示对未来教学的重要性，均为0到1
- 不要记录敏感隐私，不要记录没有证据的猜测
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
      const updated = normalizeMemory({ ...currentMemory })

      if (parsed.profile && typeof parsed.profile === 'object') {
        for (const field of ['name', 'grade', 'school', 'major'] as const) {
          const value = String(parsed.profile[field] || '').trim()
          if (value) updated.profile[field] = value
        }
      }
      if (parsed.preferences && typeof parsed.preferences === 'object') {
        if (Array.isArray(parsed.preferences.subjects) && parsed.preferences.subjects.length) {
          updated.preferences.subjects = uniqueStrings([
            ...updated.preferences.subjects,
            ...parsed.preferences.subjects
          ]).slice(0, 12)
        }
        if (['easy', 'medium', 'hard'].includes(parsed.preferences.difficulty)) {
          updated.preferences.difficulty = parsed.preferences.difficulty
        }
        const language = normalizeExtractedLanguage(parsed.preferences.language)
        if (language) {
          updated.preferences.language = language
        }
      }

      // 追加学习记录到 history
      if (parsed.topics?.length) {
        updated.history = {
          ...updated.history,
          topics: uniqueStrings([...updated.history.topics, ...parsed.topics]).slice(-40)
        }
      }
      if (parsed.weakPoints?.length) {
        updated.history = {
          ...updated.history,
          weakPoints: uniqueStrings([...updated.history.weakPoints, ...parsed.weakPoints]).slice(
            -40
          )
        }
      }
      if (parsed.strongPoints?.length) {
        updated.history = {
          ...updated.history,
          strongPoints: uniqueStrings([
            ...updated.history.strongPoints,
            ...parsed.strongPoints
          ]).slice(-40)
        }
      }

      addListMemories(updated, 'topic', parsed.topics, '本次对话主题', 0.58, 0.45)
      addListMemories(updated, 'weak_point', parsed.weakPoints, '学生表现出薄弱', 0.7, 0.78)
      addListMemories(updated, 'strong_point', parsed.strongPoints, '学生表现出掌握', 0.64, 0.56)

      if (Array.isArray(parsed.memoryAtoms)) {
        for (const rawAtom of parsed.memoryAtoms.slice(0, 8)) {
          if (!rawAtom || typeof rawAtom !== 'object') continue
          const category = normalizeMemoryCategory(rawAtom.category)
          if (!category) continue
          upsertMemoryAtom(updated, {
            category,
            key: String(rawAtom.key || rawAtom.value || ''),
            value: String(rawAtom.value || rawAtom.key || ''),
            confidence: clamp01(Number(rawAtom.confidence ?? 0.55)),
            importance: clamp01(Number(rawAtom.importance ?? 0.5)),
            evidence: [String(rawAtom.evidence || '').slice(0, 80)].filter(Boolean),
            source: 'chat',
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            hits: 1
          })
        }
      }

      refreshMemoryDerivedState(updated)
      updated.lastUpdated = Date.now()
      return updated
    }
  } catch (e) {
    console.error('[Memory] 提取失败:', e)
  }
  return currentMemory
}

function normalizeExtractedLanguage(value: unknown): string {
  const label = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
  if (!label) return ''
  if (/^(zh|cn|中文|汉语|普通话)$/i.test(label)) return 'zh'
  if (/^(en|eng|english|英文|英语)$/i.test(label)) return 'en'
  return label
}
