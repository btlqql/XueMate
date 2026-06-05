import { chat } from './llm'
import { classifyCommand, execInSandbox, ensureSandbox } from './sandbox'
import { fetchPage, searchAndFetch } from './web'

// 全局系统提示词
const SYSTEM_PROMPT = `你是 XueMate 智能学习助手，面向中小学生。你的职责是帮助学生完成学习任务。

安全规则（必须严格遵守）：
1. 禁止搜索、访问或展示任何暴力、色情、恐怖、赌博等不适合未成年人的内容
2. 禁止执行可能损害系统的危险命令
3. 如果用户的搜索请求包含不当内容，必须拒绝并引导回学习任务
4. 所有输出内容必须适合学生阅读
5. 鼓励积极健康的学习行为`

type AgentState =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'browsing'
  | 'waiting_confirm'
  | 'done'
  | 'error'
  | 'stopped'

interface AgentStep {
  id: number
  thinking: string
  command: string
  output: string
  status: 'running' | 'done' | 'error' | 'blocked' | 'skipped'
  level?: 'safe' | 'confirm' | 'blocked'
}

interface AgentContext {
  state: AgentState
  steps: AgentStep[]
  task: string
  stepCount: number
  maxSteps: number
  browseCount: number
  maxBrowse: number
  webMemory: string[]
}

const MAX_STEPS = 15
const MAX_BROWSE = 3 // 最多浏览/搜索 3 次

interface PlanResult {
  thinking: string
  command: string | null
  action: 'shell' | 'search' | 'browse' | 'done'
  query?: string
  url?: string
}

// 校验 plan 是否完整有效
function validatePlan(plan: PlanResult): boolean {
  if (!plan.action || !plan.thinking) return false
  switch (plan.action) {
    case 'search':
      return !!plan.query
    case 'browse':
      return !!plan.url
    case 'shell':
      return !!plan.command
    case 'done':
      return true
    default:
      return false
  }
}

const MAX_RETRIES = 2

async function planNextStep(ctx: AgentContext): Promise<PlanResult> {
  const history = ctx.steps
    .map((s) => {
      let statusText: string = s.status
      if (s.status === 'blocked') statusText = '被安全策略禁止'
      else if (s.status === 'skipped') statusText = '用户拒绝执行'
      else if (s.status === 'error') statusText = '执行失败'
      else if (s.status === 'done') statusText = '执行成功'
      return `步骤${s.id}: ${s.thinking}\n命令: ${s.command}\n输出: ${s.output.slice(0, 500)}\n结果: ${statusText}`
    })
    .join('\n\n')

  const webContext =
    ctx.webMemory.length > 0 ? `\n已获取的网页信息：\n${ctx.webMemory.join('\n---\n')}` : ''

  const prompt = `你是一个智能助手，帮助用户在 macOS 上完成任务。你可以：
1. 执行 shell 命令
2. 搜索网页获取信息
3. 打开指定网页提取内容

用户任务：${ctx.task}
${webContext}

已执行步骤：
${history || '（还没有执行任何步骤）'}

请决定下一步操作。返回JSON格式：
{
  "thinking": "你的分析和计划（简短）",
  "action": "search 或 browse 或 shell 或 done",
  "query": "搜索关键词（仅当 action=search 时需要）",
  "url": "要打开的网址（仅当 action=browse 时需要）",
  "command": "shell命令（仅当 action=shell 时需要，其他情况为null）"
}

规则：
1. 需要查找信息时用 search
2. 需要访问特定网页时用 browse
3. 需要执行命令时用 shell
4. 任务完成时用 done
5. 一次只做一个操作
6. 搜索/浏览最多 ${MAX_BROWSE} 次，已用 ${ctx.browseCount} 次，用完后必须用 shell 或 done
7. 只返回JSON，不要其他文字`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await chat({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        maxTokens: 512
      })

      console.log(`[Agent] AI 返回 (尝试 ${attempt + 1}):`, result)

      // 提取 JSON（处理 AI 可能返回 markdown 代码块的情况）
      let jsonStr = result.trim()
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonStr = jsonMatch[0]
      }

      const parsed = JSON.parse(jsonStr)

      // 兼容各种格式：推断 action
      if (!parsed.action) {
        if (parsed.done === true) {
          parsed.action = 'done'
        } else if (parsed.query) {
          parsed.action = 'search'
        } else if (parsed.url) {
          parsed.action = 'browse'
        } else if (parsed.command) {
          parsed.action = 'shell'
        }
        // 不再默认 fallback 到 done
      }

      // 校验完整性：action 必须合法，且对应字段不能缺
      if (validatePlan(parsed)) {
        console.log('[Agent] 解析结果:', JSON.stringify(parsed))
        return parsed
      }

      console.warn(`[Agent] plan 校验失败 (尝试 ${attempt + 1}):`, JSON.stringify(parsed))
    } catch (e) {
      console.error(`[Agent] JSON 解析失败 (尝试 ${attempt + 1}):`, e)
    }
  }

  // 所有重试都失败，返回 done 但附带错误信息
  console.error('[Agent] 多次重试均失败，强制结束')
  return { thinking: 'AI 多次返回格式异常，任务被迫结束', command: null, action: 'done' }
}

// 搜索安全检查
export async function checkSearchSafety(query: string): Promise<string | null> {
  const result = await chat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `请判断以下搜索请求是否适合中小学生。如果适合，返回"safe"；如果不适合，返回一句简短的拒绝理由（中文）。\n\n搜索请求：${query}\n\n只返回结果，不要其他文字。`
      }
    ],
    temperature: 0.1,
    maxTokens: 100
  })
  const response = result.trim()
  if (response.toLowerCase() === 'safe') return null
  return response
}

// 总结搜索结果
export async function summarizeResults(query: string, rawText: string): Promise<string> {
  const result = await chat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `学生搜索了"${query}"，以下是搜索结果：\n\n${rawText.slice(0, 3000)}\n\n请用简洁的中文总结关键信息（3-5句话），适合学生理解。只返回总结文字，不要JSON。`
      }
    ],
    temperature: 0.3,
    maxTokens: 300
  })
  return result.trim()
}

export async function runAgent(
  task: string,
  onUpdate: (data: any) => void,
  onConfirm: (command: string, reason: string) => Promise<boolean>,
  shouldStop?: () => boolean
): Promise<{ success: boolean; steps: AgentStep[]; error?: string }> {
  ensureSandbox()

  const ctx: AgentContext = {
    state: 'thinking',
    steps: [],
    task,
    stepCount: 0,
    maxSteps: MAX_STEPS,
    browseCount: 0,
    maxBrowse: MAX_BROWSE,
    webMemory: []
  }

  const sendUpdate = () => {
    onUpdate({
      state: ctx.state,
      steps: ctx.steps.map((s) => ({ ...s })),
      stepCount: ctx.stepCount
    })
  }

  try {
    while (ctx.stepCount < MAX_STEPS) {
      if (shouldStop && shouldStop()) {
        ctx.state = 'stopped'
        sendUpdate()
        return { success: false, steps: ctx.steps, error: '用户停止' }
      }

      ctx.state = 'thinking'
      sendUpdate()

      const plan = await planNextStep(ctx)
      console.log(
        `[Agent] 步骤 ${ctx.stepCount + 1}: action=${plan.action}, command=${plan.command}, query=${plan.query}, url=${plan.url}`
      )

      if (plan.action === 'done') {
        ctx.state = 'done'
        sendUpdate()
        return { success: true, steps: ctx.steps }
      }

      ctx.stepCount++
      const step: AgentStep = {
        id: ctx.stepCount,
        thinking: plan.thinking,
        command: '',
        output: '',
        status: 'running'
      }

      // 浏览次数用完，强制跳过搜索/浏览
      if ((plan.action === 'search' || plan.action === 'browse') && ctx.browseCount >= MAX_BROWSE) {
        console.log(`[Agent] 浏览次数已达上限(${ctx.browseCount}/${MAX_BROWSE})，强制跳过`)
        plan.action = 'shell'
        plan.thinking = '浏览次数已达上限，尝试直接执行命令'
        if (!plan.command) {
          plan.action = 'done'
        }
      }
      console.log(`[Agent] 最终 action=${plan.action}, browseCount=${ctx.browseCount}`)

      // ── 搜索网页 ──
      if (plan.action === 'search' && plan.query) {
        // 安全检查：拒绝不当搜索
        const unsafe = await checkSearchSafety(plan.query)
        if (unsafe) {
          step.command = `搜索: ${plan.query}`
          step.level = 'blocked'
          step.output = `[安全] ${unsafe}`
          step.status = 'blocked'
          ctx.steps.push(step)
          sendUpdate()
          continue
        }
        ctx.state = 'browsing'
        step.command = `搜索: ${plan.query}`
        step.level = 'safe'
        ctx.steps.push(step)
        sendUpdate()

        try {
          const pages = await searchAndFetch(plan.query)
          const rawText = pages
            .map((p) => `【${p.title}】${p.url}\n${p.text.slice(0, 600)}`)
            .join('\n\n')

          ctx.webMemory.push(rawText)
          ctx.browseCount++

          // 总结搜索结果
          const summary = await summarizeResults(plan.query, rawText)
          step.output = summary
          step.status = 'done'
        } catch (err: any) {
          step.output = `搜索失败: ${err.message}`
          step.status = 'error'
        }
        sendUpdate()
        continue
      }

      // ── 浏览网页 ──
      if (plan.action === 'browse' && plan.url) {
        ctx.state = 'browsing'
        step.command = `打开: ${plan.url}`
        step.level = 'safe'
        ctx.steps.push(step)
        sendUpdate()

        try {
          const page = await fetchPage(plan.url)
          const rawText = `【${page.title}】${page.url}\n${page.text.slice(0, 1500)}`
          ctx.webMemory.push(rawText)
          ctx.browseCount++

          // 总结页面内容
          const summary = await summarizeResults(plan.url, rawText)
          step.output = summary
          step.status = 'done'
        } catch (err: any) {
          step.output = `打开失败: ${err.message}`
          step.status = 'error'
        }
        sendUpdate()
        continue
      }

      // ── 执行 shell 命令 ──
      if (plan.action === 'shell' && plan.command) {
        const check = classifyCommand(plan.command)
        step.command = plan.command
        step.level = check.level
        ctx.steps.push(step)

        if (check.level === 'blocked') {
          step.output = `[安全策略] ${check.reason}`
          step.status = 'blocked'
          sendUpdate()
          continue
        }

        if (check.level === 'confirm') {
          ctx.state = 'waiting_confirm'
          sendUpdate()

          const approved = await onConfirm(plan.command, check.reason)
          if (!approved) {
            step.output = '[用户拒绝] 该操作被用户跳过'
            step.status = 'skipped'
            sendUpdate()
            continue
          }
        }

        ctx.state = 'executing'
        sendUpdate()

        const result = await execInSandbox(plan.command)
        step.output = result.stdout + (result.stderr ? '\n[stderr] ' + result.stderr : '')
        step.status = result.code === 0 ? 'done' : 'error'
        sendUpdate()
        continue
      }

      // 兜底：无效的 action
      step.command = '无效操作'
      step.output = `未知操作: ${plan.action}`
      step.status = 'error'
      ctx.steps.push(step)
      sendUpdate()
    }

    ctx.state = 'done'
    sendUpdate()
    return { success: true, steps: ctx.steps }
  } catch (error: any) {
    ctx.state = 'error'
    sendUpdate()
    return { success: false, steps: ctx.steps, error: error.message }
  }
}
