interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  messages: Message[]
  temperature?: number
  maxTokens?: number
}

const API_KEY = process.env.DEEPSEEK_API_KEY || ''
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1/chat/completions'
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

export async function chat(options: ChatOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens = 2048 } = options

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
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
      "deadline": "截止时间",
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

// 资料整理
export async function organizeFiles(fileNames: string[]): Promise<string> {
  return chat({
    messages: [
      {
        role: 'system',
        content: `你是课程资料整理助手。根据文件名列表，判断每个文件的类型（报告/作业/课件/参考/指导/项目/未分类）和所属课程。按以下JSON格式返回：
{
  "files": [
    {"name": "原文件名", "type": "类型", "course": "课程名", "week": 周次数字, "newName": "建议新文件名"}
  ]
}
只返回JSON。`
      },
      { role: 'user', content: fileNames.join('\n') }
    ],
    temperature: 0.3
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
