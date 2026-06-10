import { chat } from '../ai/llm'
import { classifyCommand, execInSandbox, ensureSandbox } from './sandbox'
import { fetchPage, searchAndFetch } from '../browser/webRuntime'
import { observeDesktopWithVision } from './desktopVision'

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
  | 'observing'
  | 'summarizing'
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
  screenObservations: string[]
  finalSummary: string
}

const MAX_STEPS = 24
const MIN_CHECK_STEPS = 3
const MAX_BROWSE = 5 // 最多浏览/搜索 5 次

interface PlanResult {
  thinking: string
  command: string | null
  action: 'shell' | 'search' | 'browse' | 'observe_screen' | 'done'
  query?: string
  url?: string
}

interface AgentUpdate {
  state: AgentState
  steps: AgentStep[]
  stepCount: number
  maxSteps: number
  finalSummary?: string
}

function getErrorMessage(error: unknown, fallback = '未知错误'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizePlanResult(value: unknown): PlanResult | null {
  if (!isRecord(value)) return null
  const action = typeof value.action === 'string' ? value.action : ''
  if (!['shell', 'search', 'browse', 'observe_screen', 'done'].includes(action)) return null
  return {
    thinking: typeof value.thinking === 'string' ? value.thinking : '',
    action: action as PlanResult['action'],
    command: typeof value.command === 'string' ? value.command : null,
    query: typeof value.query === 'string' ? value.query : undefined,
    url: typeof value.url === 'string' ? value.url : undefined
  }
}

// 校验 plan 是否完整有效
function validatePlan(plan: PlanResult): boolean {
  if (!plan.action || !plan.thinking) return false
  switch (plan.action) {
    case 'search':
      return !!plan.query
    case 'browse':
      return !!plan.url
    case 'observe_screen':
      return true
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
  const screenContext =
    ctx.screenObservations.length > 0
      ? `\n已观察的屏幕状态：\n${ctx.screenObservations.join('\n---\n')}`
      : ''

  const prompt = `你是一个智能助手，帮助用户在 ${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'} 上完成任务。你可以：
1. 执行 shell 命令
2. 搜索网页获取信息
3. 打开指定网页提取内容
4. 在命令行无法判断 GUI/弹窗/真实屏幕状态时，观察一次当前屏幕

用户任务：${ctx.task}
当前进度：已执行 ${ctx.stepCount}/${ctx.maxSteps} 步，至少需要完成 ${MIN_CHECK_STEPS} 轮有效检查后才能结束。
${webContext}
${screenContext}

已执行步骤：
${history || '（还没有执行任何步骤）'}

请决定下一步操作。返回JSON格式：
{
  "thinking": "你的分析和计划（简短）",
  "action": "search 或 browse 或 shell 或 observe_screen 或 done",
  "query": "搜索关键词（仅当 action=search 时需要）",
  "url": "要打开的网址（仅当 action=browse 时需要）",
  "command": "shell命令（仅当 action=shell 时需要，其他情况为null）"
}

规则：
1. 默认优先用 shell，因为已有 sandbox 可以安全执行命令、读文件、查状态
2. 需要查找公开学习资料时用 search
3. 需要访问特定网页文本时用 browse
4. 只有当 shell/search/browse 都无法判断 GUI、系统弹窗、真实窗口状态时，才用 observe_screen
5. 不要过早结束：少于 ${MIN_CHECK_STEPS} 轮有效检查时，除非遇到安全阻断或用户停止，否则不要用 done
6. 任务完成时用 done
7. 一次只做一个操作
8. 搜索/浏览最多 ${MAX_BROWSE} 次，已用 ${ctx.browseCount} 次，用完后必须用 shell 或 done
9. 只返回JSON，不要其他文字`

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

      const parsedRaw: unknown = JSON.parse(jsonStr)
      const parsedRecord = isRecord(parsedRaw) ? { ...parsedRaw } : {}

      // 兼容各种格式：推断 action
      if (!parsedRecord.action) {
        if (parsedRecord.done === true) {
          parsedRecord.action = 'done'
        } else if (parsedRecord.query) {
          parsedRecord.action = 'search'
        } else if (parsedRecord.url) {
          parsedRecord.action = 'browse'
        } else if (parsedRecord.command) {
          parsedRecord.action = 'shell'
        }
        // 不再默认 fallback 到 done
      }
      const parsed = normalizePlanResult(parsedRecord)

      // 校验完整性：action 必须合法，且对应字段不能缺
      if (parsed && validatePlan(parsed)) {
        console.log('[Agent] 解析结果:', JSON.stringify(parsed))
        return parsed
      }

      console.warn(`[Agent] plan 校验失败 (尝试 ${attempt + 1}):`, JSON.stringify(parsedRecord))
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

function countEffectiveSteps(ctx: AgentContext): number {
  return ctx.steps.filter((step) => step.status === 'done' || step.status === 'error').length
}

function shellQuote(value: string): string {
  if (process.platform === 'win32') {
    // PowerShell: wrap in double quotes, escape inner double quotes
    return `"${value.replace(/"/g, '\\"')}"`
  }
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildStablePlan(ctx: AgentContext): PlanResult | null {
  const commands = new Set(ctx.steps.map((step) => step.command))
  const cwd = shellQuote(process.cwd())
  const IS_WIN = process.platform === 'win32'

  if (IS_WIN) {
    if (!commands.has(`cd ${cwd} && git rev-parse --show-toplevel 2>$null; if ($LASTEXITCODE -ne 0) { echo n/a }`)) {
      return {
        thinking: '先确认当前项目位置和工作区，保证后面的判断有依据。',
        action: 'shell',
        command: `cd ${cwd} && git rev-parse --show-toplevel 2>$null; if ($LASTEXITCODE -ne 0) { echo n/a }`
      }
    }

    if (!commands.has(`git -C ${cwd} status --short 2>$null`)) {
      return {
        thinking: '查看当前文件改动，先把学习现场和提交状态摸清楚。',
        action: 'shell',
        command: `git -C ${cwd} status --short 2>$null`
      }
    }

    if (/启动|软件|页面|窗口|前端|端口|服务|localhost|闪退|运行/.test(ctx.task)) {
      const command = `Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue | Format-Table LocalPort,State; Get-NetTCPConnection -LocalPort 8788 -ErrorAction SilentlyContinue | Format-Table LocalPort,State; Get-Process | Where-Object { $_.ProcessName -match 'electron|vite' } | Format-Table ProcessName,Id`
      if (!commands.has(command)) {
        return {
          thinking: '检查本地端口和应用进程，判断软件是否真的跑起来。',
          action: 'shell',
          command
        }
      }
    }

    if (/构建|build|报错|失败|启动/.test(ctx.task)) {
      const command = `cd ${cwd}; npm run build`
      if (!commands.has(command)) {
        return {
          thinking: '用一次构建验证当前项目状态，比只看日志更稳定。',
          action: 'shell',
          command
        }
      }
    }
  } else {
    // Unix (macOS / Linux)
    if (!commands.has(`pwd && git -C ${cwd} rev-parse --show-toplevel 2>/dev/null || true`)) {
      return {
        thinking: '先确认当前项目位置和工作区，保证后面的判断有依据。',
        action: 'shell',
        command: `pwd && git -C ${cwd} rev-parse --show-toplevel 2>/dev/null || true`
      }
    }

    if (!commands.has(`git -C ${cwd} status --short 2>/dev/null || true`)) {
      return {
        thinking: '查看当前文件改动，先把学习现场和提交状态摸清楚。',
        action: 'shell',
        command: `git -C ${cwd} status --short 2>/dev/null || true`
      }
    }

    if (/启动|软件|页面|窗口|前端|端口|服务|localhost|闪退|运行/.test(ctx.task)) {
      const command = `lsof -nP -iTCP:5174 -sTCP:LISTEN || true; lsof -nP -iTCP:8788 -sTCP:LISTEN || true; ps aux | rg 'electron-vite|Electron|vite' || true`
      if (!commands.has(command)) {
        return {
          thinking: '检查本地端口和应用进程，判断软件是否真的跑起来。',
          action: 'shell',
          command
        }
      }
    }

    if (/构建|build|报错|失败|启动/.test(ctx.task)) {
      const command = `cd ${cwd} && npm run build`
      if (!commands.has(command)) {
        return {
          thinking: '用一次构建验证当前项目状态，比只看日志更稳定。',
          action: 'shell',
          command
        }
      }
    }
  }

  return null
}

function buildFollowUpPlan(ctx: AgentContext): PlanResult {
  const commands = new Set(ctx.steps.map((step) => step.command))
  const cwd = shellQuote(process.cwd())
  const IS_WIN = process.platform === 'win32'

  if (!commands.has(IS_WIN ? 'Get-Location' : 'pwd')) {
    return {
      thinking: '先确认当前检查环境，避免只凭一次判断就结束。',
      action: 'shell',
      command: IS_WIN ? 'Get-Location' : 'pwd'
    }
  }

  if (!commands.has(IS_WIN ? 'Get-ChildItem' : 'ls -la')) {
    return {
      thinking: '继续查看基础目录结构，补齐现场信息。',
      action: 'shell',
      command: IS_WIN ? 'Get-ChildItem' : 'ls -la'
    }
  }

  if (/启动|软件|页面|窗口|前端|端口|服务|localhost|闪退/.test(ctx.task)) {
    const psCmd = IS_WIN ? "Get-Process | Format-Table ProcessName,Id" : 'ps aux'
    if (!commands.has(psCmd)) {
      return {
        thinking: '检查当前进程状态，确认软件或开发服务是否仍在运行。',
        action: 'shell',
        command: psCmd
      }
    }
    if (ctx.screenObservations.length === 0) {
      return {
        thinking: '命令信息还不够确认窗口状态，补一次当前屏幕观察。',
        action: 'observe_screen',
        command: null
      }
    }
  }

  if (/提交|git|文件|缓存|不该提交/.test(ctx.task)) {
    const command = `git -C ${cwd} status --short`
    if (!commands.has(command)) {
      return {
        thinking: '继续检查项目提交状态，找出可能需要处理的文件。',
        action: 'shell',
        command
      }
    }
  }

  return {
    thinking: '补一轮只读文件扫描，避免结论过早。',
    action: 'shell',
    command: IS_WIN ? 'Get-ChildItem -Recurse -Depth 2 -File' : 'find . -maxdepth 2 -type f'
  }
}

async function summarizeAgentRun(ctx: AgentContext): Promise<string> {
  const stepHistory = ctx.steps
    .map((step) => {
      const output = step.output.trim() ? step.output.slice(0, 1000) : '（无输出）'
      return `#${step.id} ${step.thinking}\n操作：${step.command || '无'}\n状态：${step.status}\n结果：${output}`
    })
    .join('\n\n')

  const prompt = `请你作为 XueMate 学习现场检查助手，对这次执行做最终总结。

用户任务：${ctx.task}

执行记录：
${stepHistory || '（没有执行记录）'}

已获取网页资料：
${ctx.webMemory.join('\n---\n') || '（无）'}

已观察屏幕：
${ctx.screenObservations.join('\n---\n') || '（无）'}

请用中文输出，结构固定为：
1. 结论：一句话回答任务是否完成/目前判断
2. 我检查了什么：列 2-5 个证据点
3. 发现的问题：没有就写“暂未发现明确问题”
4. 下一步建议：给用户 1-3 个可执行动作

要求：不要编造没有执行过的结果；如果证据不足，要明确说还差什么。`

  const result = await chat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    maxTokens: 700
  })

  return result.trim()
}

export async function runAgent(
  task: string,
  onUpdate: (data: AgentUpdate) => void,
  onConfirm: (command: string, reason: string) => Promise<boolean>,
  shouldStop?: () => boolean
): Promise<{ success: boolean; steps: AgentStep[]; finalSummary?: string; error?: string }> {
  ensureSandbox()

  const ctx: AgentContext = {
    state: 'thinking',
    steps: [],
    task,
    stepCount: 0,
    maxSteps: MAX_STEPS,
    browseCount: 0,
    maxBrowse: MAX_BROWSE,
    webMemory: [],
    screenObservations: [],
    finalSummary: ''
  }

  const sendUpdate = () => {
    onUpdate({
      state: ctx.state,
      steps: ctx.steps.map((s) => ({ ...s })),
      stepCount: ctx.stepCount,
      maxSteps: ctx.maxSteps,
      finalSummary: ctx.finalSummary || undefined
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

      const stablePlan = buildStablePlan(ctx)
      const plan = stablePlan || (await planNextStep(ctx))
      console.log(
        `[Agent] 步骤 ${ctx.stepCount + 1}: action=${plan.action}, command=${plan.command}, query=${plan.query}, url=${plan.url}`
      )

      if (plan.action === 'done') {
        if (countEffectiveSteps(ctx) < MIN_CHECK_STEPS) {
          const followUpPlan = buildFollowUpPlan(ctx)
          plan.thinking = followUpPlan.thinking
          plan.action = followUpPlan.action
          plan.command = followUpPlan.command
          plan.query = followUpPlan.query
          plan.url = followUpPlan.url
        } else {
          ctx.state = 'summarizing'
          sendUpdate()
          ctx.finalSummary = await summarizeAgentRun(ctx)
          ctx.state = 'done'
          sendUpdate()
          return { success: true, steps: ctx.steps, finalSummary: ctx.finalSummary }
        }
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

      // ── 观察真实屏幕（只在命令/网页信息不够时使用） ──
      if (plan.action === 'observe_screen') {
        ctx.state = 'observing'
        step.command = '观察当前真实屏幕'
        step.level = 'safe'
        ctx.steps.push(step)
        sendUpdate()

        try {
          const recentHistory = ctx.steps
            .slice(-6)
            .map((item) => `步骤${item.id}: ${item.command}\n${item.output.slice(0, 600)}`)
            .join('\n\n')
          const observation = await observeDesktopWithVision(ctx.task, recentHistory)
          const output = [
            `屏幕状态：${observation.summary}`,
            observation.visibleApps.length ? `可见应用：${observation.visibleApps.join('、')}` : '',
            observation.visibleText.length ? `可见文字：${observation.visibleText.join('；')}` : '',
            observation.actionableItems.length
              ? `可操作项：${observation.actionableItems.join('；')}`
              : '',
            `下一步建议：${observation.nextSuggestion}`
          ]
            .filter(Boolean)
            .join('\n')
          ctx.screenObservations.push(output)
          step.output = output
          step.status = 'done'
        } catch (error) {
          step.output = `观察屏幕失败: ${getErrorMessage(error)}`
          step.status = 'error'
        }
        sendUpdate()
        continue
      }

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
        } catch (error) {
          step.output = `搜索失败: ${getErrorMessage(error)}`
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
        } catch (error) {
          step.output = `打开失败: ${getErrorMessage(error)}`
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

    ctx.state = 'summarizing'
    sendUpdate()
    ctx.finalSummary = await summarizeAgentRun(ctx)
    ctx.state = 'done'
    sendUpdate()
    return { success: true, steps: ctx.steps, finalSummary: ctx.finalSummary }
  } catch (error) {
    ctx.state = 'error'
    sendUpdate()
    return { success: false, steps: ctx.steps, error: getErrorMessage(error) }
  }
}
