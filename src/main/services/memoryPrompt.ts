import type { UserMemory } from '../domain/memory'
import { activeAtoms, decayedConfidence } from './memoryProfile'
import { loadArchive } from './memoryArchive'

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

  const learningProfile = memory.learningProfile
  const active = activeAtoms(memory)
  const highValueAtoms = active
    .filter((atom) =>
      ['preference', 'goal', 'weak_point', 'misconception', 'strong_point', 'behavior'].includes(
        atom.category
      )
    )
    .slice(0, 12)

  if (learningProfile || highValueAtoms.length > 0) {
    parts.push('', '【长期学习记忆】')
    if (learningProfile?.recentTopics?.length) {
      parts.push(`近期学习主题：${learningProfile.recentTopics.slice(0, 8).join('、')}`)
    }
    if (learningProfile?.weakSkills?.length) {
      parts.push(
        `薄弱点优先照顾：${learningProfile.weakSkills
          .slice(0, 6)
          .map((item) => `${item.key}(掌握度${Math.round(item.mastery * 100)}%)`)
          .join('、')}`
      )
    }
    if (learningProfile?.strongSkills?.length) {
      parts.push(
        `已掌握能力：${learningProfile.strongSkills
          .slice(0, 5)
          .map((item) => item.key)
          .join('、')}`
      )
    }
    if (learningProfile?.reviewQueue?.length) {
      parts.push(
        `建议复习队列：${learningProfile.reviewQueue
          .slice(0, 5)
          .map((item) => `${item.key}(优先级${item.priority})`)
          .join('、')}`
      )
    }
    if (highValueAtoms.length) {
      parts.push(
        '可解释记忆证据：' +
          highValueAtoms
            .map(
              (atom) =>
                `${atom.category}:${atom.value}(置信${Math.round(
                  decayedConfidence(atom) * 100
                )}%, 证据:${atom.evidence[0] || '对话'})`
            )
            .join('；')
      )
    }
    parts.push(
      '使用这些记忆时要自然，不要机械复述；如果记忆和用户当前表达冲突，以当前表达为准并更新记忆。'
    )
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
