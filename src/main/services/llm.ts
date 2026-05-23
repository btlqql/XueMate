interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  messages: Message[]
  temperature?: number
  maxTokens?: number
  model?: string
}

const API_KEY = process.env.DEEPSEEK_API_KEY || ''
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1/chat/completions'
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
const PRO_MODEL = process.env.DEEPSEEK_PRO_MODEL || 'deepseek-v4-pro'

export { MODEL, PRO_MODEL }

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 3000

const friendlyErrors: Record<number, string> = {
  429: '请求太频繁，请稍后再试',
  503: 'AI 服务暂时繁忙，请稍后重试',
  500: 'AI 服务内部错误，请稍后重试'
}

export async function chat(options: ChatOptions & { timeoutMs?: number }): Promise<string> {
  const { messages, temperature = 0.7, maxTokens = 2048, timeoutMs = 30000, model } = options
  const useModel = model || MODEL

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const body: Record<string, any> = {
      model: useModel,
      messages,
      max_tokens: maxTokens,
      temperature,
      thinking: { type: 'disabled' }
    }

    try {
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const status = response.status
        // 可重试的状态码
        if ((status === 429 || status === 503) && attempt < MAX_RETRIES) {
          console.warn(`[LLM] ${status} 错误，${RETRY_DELAY_MS / 1000}秒后重试 (${attempt + 1}/${MAX_RETRIES})`)
          await sleep(RETRY_DELAY_MS)
          continue
        }
        throw new Error(friendlyErrors[status] || `请求失败 (${status})`)
      }

      const data = await response.json()
      return data.choices[0].message.content
    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          console.warn(`[LLM] 超时，重试 (${attempt + 1}/${MAX_RETRIES})`)
          continue
        }
        throw new Error('请求超时，请检查网络或稍后重试')
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error('多次重试失败，请稍后再试')
}

// 流式输出：逐 token 回调
export async function chatStream(
  options: ChatOptions & {
    onToken: (token: string) => void
    onDone: (fullContent: string) => void
    onError: (error: string) => void
    timeoutMs?: number
  }
): Promise<void> {
  const { messages, temperature = 0.7, maxTokens = 2048, onToken, onDone, onError, timeoutMs = 60000, model } = options
  const useModel = model || MODEL
  console.log('[LLM] chatStream model:', useModel)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const body: Record<string, any> = {
    model: useModel,
    messages,
    max_tokens: maxTokens,
    stream: true,
    temperature,
    thinking: { type: 'disabled' }
  }

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      const status = response.status
      throw new Error(friendlyErrors[status] || `请求失败 (${status})`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 最后一个不完整的行留到下次

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const token = parsed.choices?.[0]?.delta?.content
          if (token) {
            fullContent += token
            onToken(token)
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }

    onDone(fullContent)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onError('请求超时，请检查网络或稍后重试')
    } else {
      onError(err.message || '请求失败')
    }
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 任务解析
export async function parseTask(text: string): Promise<string> {
  return chat({
    messages: [
      {
        role: 'system',
        content: `你是一个学生作业助手。请从用户输入的文本中提取作业要求，按以下JSON格式返回：
{
  "tasks": [
    {
      "title": "任务标题",
      "deadline": "截止时间（自然语言描述）",
      "deadlineDate": "截止日期（ISO 8601格式，如 2026-05-15T23:59:00+08:00，无法解析则为空字符串）",
      "format": "提交格式",
      "naming": "命名要求",
      "note": "其他说明"
    }
  ],
  "checklist": ["提交前检查项1", "检查项2"]
}
只返回JSON，不要其他文字。`
      },
      { role: 'user', content: text }
    ],
    temperature: 0.3
  })
}

// 学习辅导
export async function tutorCode(code: string, type: 'code' | 'report'): Promise<string> {
  const systemPrompt = type === 'code'
    ? `你是一个编程辅导助手。分析学生代码，给出改进建议，但不要直接给出完整答案。按以下JSON格式返回：
{
  "errors": [{"line": 行号, "level": "warning或error", "message": "问题描述", "hint": "改进提示"}],
  "suggestions": ["改进建议1", "建议2"],
  "tips": ["学习提示1", "提示2"]
}
只返回JSON。`
    : `你是一个写作辅导助手。分析学生的作业或报告，给出改进建议，但不要直接重写。按以下JSON格式返回：
{
  "errors": [{"line": 段落号, "level": "warning或error", "message": "问题描述", "hint": "改进提示"}],
  "suggestions": ["改进建议1", "建议2"],
  "tips": ["学习提示1", "提示2"]
}
只返回JSON。`

  return chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: code }
    ],
    temperature: 0.4
  })
}

// 作业格式检查
export async function checkFormat(text: string, fileName: string): Promise<string> {
  return chat({
    messages: [
      {
        role: 'system',
        content: `你是中小学作业格式检查助手。检查学生提交的作业文档是否符合基本格式要求。

检查以下规则：
1. 命名规范：文件名是否包含姓名、学号或班级信息
2. 标题格式：是否有作业标题
3. 基本信息：是否包含姓名、班级、学号、日期等
4. 内容结构：是否有正文段落，内容是否完整
5. 书写规范：是否有明显错别字或格式问题

按以下JSON格式返回：
{
  "studentName": "识别到的学生姓名（如有）",
  "className": "识别到的班级（如有）",
  "assignmentTitle": "识别到的作业标题（如有）",
  "score": 0-100格式分,
  "items": [
    {"name": "检查项名称", "pass": true或false, "detail": "具体说明"}
  ],
  "summary": "一句话总评"
}
只返回JSON。`
      },
      {
        role: 'user',
        content: `文件名：${fileName}\n\n文档内容：\n${text.slice(0, 3000)}`
      }
    ],
    temperature: 0.3,
    maxTokens: 1024
  })
}

// 刷题判题
export async function judgeCode(problem: string, code: string, language: string): Promise<string> {
  return chat({
    messages: [
      {
        role: 'system',
        content: `你是一个编程判题系统。根据题目要求和学生提交的代码，判断是否正确。按以下JSON格式返回：
{
  "verdict": "正确" 或 "错误" 或 "部分正确",
  "score": 0-100,
  "output": "代码预期输出示例",
  "errors": ["错误1", "错误2"],
  "hints": ["提示1", "提示2"],
  "explanation": "解题思路解析"
}
只返回JSON。`
      },
      {
        role: 'user',
        content: `题目：${problem}\n\n语言：${language}\n\n学生代码：\n${code}`
      }
    ],
    temperature: 0.3,
    maxTokens: 1024
  })
}

// 生成练习题
export async function generateProblems(topic: string, count: number): Promise<string> {
  return chat({
    messages: [
      {
        role: 'system',
        content: `你是编程出题助手。根据主题生成编程练习题。按以下JSON格式返回：
{
  "problems": [
    {
      "id": 1,
      "title": "题目标题",
      "difficulty": "简单" 或 "中等" 或 "困难",
      "description": "题目描述，包含输入输出要求",
      "example": "输入输出示例",
      "hints": "解题提示"
    }
  ]
}
只返回JSON。`
      },
      {
        role: 'user',
        content: `主题：${topic}，数量：${count}题`
      }
    ],
    temperature: 0.5
  })
}

// 复习总结
export async function generateReview(courseName: string): Promise<string> {
  return chat({
    messages: [
      {
        role: 'system',
        content: `你是课程复习助手。根据课程名称，生成复习提纲。按以下JSON格式返回：
{
  "course": "课程名",
  "chapters": [
    {"title": "章节标题", "points": ["知识点1", "知识点2"], "freq": 考试频率1-5}
  ],
  "tips": ["复习建议1", "建议2"]
}
只返回JSON。`
      },
      { role: 'user', content: courseName }
    ],
    temperature: 0.5
  })
}
