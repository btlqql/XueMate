import {
  BrowserAction,
  BrowserState,
  InteractiveElement,
  captureBrowserState,
  openBrowserUrl,
  performBrowserAction,
  destroyWebView,
  prepareHiddenBrowserViewport,
  finishBrowserRun
} from './web'
import { visionJson } from './vision'

export type WebAssistantState =
  | 'idle'
  | 'opening'
  | 'looking'
  | 'acting'
  | 'done'
  | 'error'
  | 'stopped'

export interface WebAssistantStep {
  id: number
  thought: string
  actionLabel: string
  status: 'running' | 'done' | 'error'
}

export interface WebAssistantDomCandidate {
  id: string
  role: string
  tag: string
  label: string
  score: number
  center: { x: number; y: number }
  size: { width: number; height: number }
  flags: string[]
}

interface ElementCandidate {
  element: InteractiveElement
  score: number
}

interface VisionActionResult {
  thought?: string
  action?: BrowserAction & Record<string, any>
}

export interface WebAssistantUpdate {
  state: WebAssistantState
  step: number
  maxSteps: number
  steps: WebAssistantStep[]
  screenshot?: string
  screenshotMime?: string
  url?: string
  title?: string
  thought?: string
  action?: BrowserAction
  answer?: string
  error?: string
  domElementCount?: number
  domCandidates?: WebAssistantDomCandidate[]
}

const MAX_STEPS = 15
const DEFAULT_START_URL = 'https://www.bing.com'

export async function runWebAssistant(
  goal: string,
  onUpdate: (data: WebAssistantUpdate) => void,
  shouldStop: () => boolean
): Promise<{ success: boolean; answer?: string; steps: WebAssistantStep[]; error?: string }> {
  const steps: WebAssistantStep[] = []
  let state: WebAssistantState = 'opening'
  let latestScreenshot = ''
  let latestScreenshotMime = 'image/png'
  let latestUrl = ''
  let latestTitle = ''
  const initialSearchQuery = extractStartUrl(goal) ? null : extractSearchQuery(goal)

  const sendUpdate = (patch: Partial<WebAssistantUpdate> = {}) => {
    onUpdate({
      state,
      step: steps.length,
      maxSteps: MAX_STEPS,
      steps: steps.map((step) => ({ ...step })),
      screenshot: latestScreenshot,
      screenshotMime: latestScreenshotMime,
      url: latestUrl,
      title: latestTitle,
      ...patch
    })
  }

  try {
    prepareHiddenBrowserViewport(1000, 650)
    await openBrowserUrl(resolveStartUrl(goal), true)
    sendUpdate()

    for (let i = 1; i <= MAX_STEPS; i++) {
      if (shouldStop()) {
        state = 'stopped'
        sendUpdate()
        destroyWebView()
        return { success: false, steps, error: '用户停止' }
      }

      state = 'looking'
      const browserState = await captureBrowserState()
      latestScreenshot = browserState.screenshot
      latestScreenshotMime = browserState.screenshotMime
      latestUrl = browserState.url
      latestTitle = browserState.title
      const elementCandidates = selectElementCandidates(browserState.elements, goal)
      sendUpdate({
        step: i,
        domElementCount: browserState.elements.length,
        domCandidates: toDomDebugCandidates(elementCandidates, browserState)
      })

      if (initialSearchQuery && isSearchResultsPage(browserState.url, browserState.title)) {
        const step: WebAssistantStep = {
          id: i,
          thought: `已经帮你搜索“${initialSearchQuery}”，并打开了搜索结果页。`,
          actionLabel: '打开搜索结果页',
          status: 'done'
        }
        steps.push(step)
        state = 'done'
        const answer = `已经打开“${initialSearchQuery}”的搜索结果页。你可以先看下面截图里的结果，再决定要不要点开某一个网页。`
        sendUpdate({ step: i, answer })
        finishBrowserRun()
        return { success: true, answer, steps }
      }

      const result = await visionJson<VisionActionResult>({
        prompt: buildPrompt(goal, i, browserState, steps, elementCandidates),
        screenshotBase64: browserState.screenshot,
        screenshotMime: browserState.screenshotMime
      })

      const action = normalizeAction(result.action)
      const thought = result.thought || '我在看网页，准备下一步操作。'
      const step: WebAssistantStep = {
        id: i,
        thought,
        actionLabel: describeAction(action),
        status: 'running'
      }
      steps.push(step)

      state = 'acting'
      sendUpdate({ step: i, thought, action })
      await sleep(450)

      if (action.type === 'done') {
        step.status = 'done'
        state = 'done'
        const answer = action.answer || '完成了'
        sendUpdate({ step: i, answer })
        finishBrowserRun()
        return { success: true, answer, steps }
      }

      await performBrowserAction(action, browserState.elements)
      step.status = 'done'
      sendUpdate({ step: i })
      await sleep(1000)
    }

    state = 'error'
    const error = '操作步数太多，已自动停止。你可以把任务说得更具体一点再试。'
    sendUpdate({ error })
    destroyWebView()
    return { success: false, steps, error }
  } catch (error: any) {
    state = 'error'
    const message = error.message || '网页小助手执行失败'
    if (steps.length > 0) steps[steps.length - 1].status = 'error'
    sendUpdate({ error: message })
    destroyWebView()
    return { success: false, steps, error: message }
  }
}

function buildPrompt(
  goal: string,
  step: number,
  browserState: BrowserState,
  steps: WebAssistantStep[],
  elementCandidates: ElementCandidate[] = selectElementCandidates(browserState.elements, goal)
): string {
  const history = steps
    .slice(-6)
    .map((s) => `第${s.id}步：${s.thought}；动作：${s.actionLabel}；结果：${s.status}`)
    .join('\n')
  const elementHints = formatElementHints(elementCandidates, browserState)

  return `你是“网页小助手”，你会看到一张当前网页截图。

用户想做的事：
${goal}

当前网页：
标题：${browserState.title || '无'}
地址：${browserState.url || '无'}
当前第 ${step} 步，最多 ${MAX_STEPS} 步。

已做过：
${history || '还没有'}

辅助 DOM 候选元素（不完整，只用于定位；截图优先，DOM 只做辅助）：
${elementHints || '没有可用候选元素，请根据截图用 x/y 坐标。'}

请根据截图决定“下一步最小动作”。只返回 JSON，不要解释，不要 Markdown。

坐标规则：
- x 和 y 必须是 0 到 1000 的相对坐标。
- 左上角是 x=0,y=0，右下角是 x=1000,y=1000。
- 如果要点击，先估计目标中心点。

可用动作格式：
{
  "thought": "一句话说明你为什么这么做",
  "action": { "type": "click", "x": 500, "y": 300 }
}
{
  "thought": "点击候选元素",
  "action": { "type": "click", "elementId": "e1" }
}
{
  "thought": "输入关键词",
  "action": { "type": "type", "text": "三年级分数加法练习题" }
}
{
  "thought": "在搜索框输入关键词",
  "action": { "type": "type", "elementId": "e1", "text": "三年级分数加法练习题" }
}
{
  "thought": "按回车搜索",
  "action": { "type": "key", "key": "Enter" }
}
{
  "thought": "向下看看更多内容",
  "action": { "type": "scroll", "dy": 650 }
}
{
  "thought": "页面还在加载",
  "action": { "type": "wait", "ms": 1000 }
}
{
  "thought": "直接打开网页",
  "action": { "type": "navigate", "url": "https://example.com" }
}
{
  "thought": "任务完成",
  "action": { "type": "done", "answer": "已经找到合适的网页。" }
}

规则：
1. 一次只做一个动作。
2. 如果候选元素里有合适的输入框/按钮/链接，优先返回 elementId；如果候选不合适，再用 x/y。
3. 搜索时：先点击或 type 到搜索框，再 key Enter；不要直接跳过输入过程。
4. 如果当前已经是搜索结果页，且用户只是要求搜索，返回 done；如果用户要求找合适网页，再点开最像“适合学生学习”的结果。
5. 如果截图里已经完成用户目标，返回 done。
6. 不确定时先 wait 或 scroll，不要乱点危险按钮。
7. 内容必须适合学生学习。`
}

function selectElementCandidates(
  elements: InteractiveElement[],
  goal: string,
  limit = 12
): ElementCandidate[] {
  const goalText = goal.toLowerCase()
  const wantsSearch = /搜索|搜一下|查找|查一下|检索|找.*(网页|资料|练习题|方法|小实验)/.test(goal)
  const wantsLogin = /登录|登陆|log ?in|sign ?in/.test(goalText)
  const wantsInput = wantsSearch || /输入|填写|填入|搜索框|文本框/.test(goal)
  const wantsOpen = /打开|进入|点开|点击|查看/.test(goal)

  return elements
    .filter((element) => element.visible && !element.disabled && (element.clickable || element.editable))
    .map((element) => ({ element, score: scoreElement(element, { goalText, wantsSearch, wantsLogin, wantsInput, wantsOpen }) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.element.rect.y - b.element.rect.y || a.element.rect.x - b.element.rect.x)
    .slice(0, limit)
}

function scoreElement(
  element: InteractiveElement,
  intent: {
    goalText: string
    wantsSearch: boolean
    wantsLogin: boolean
    wantsInput: boolean
    wantsOpen: boolean
  }
): number {
  const haystack = [
    element.role,
    element.tag,
    element.text,
    element.placeholder,
    element.ariaLabel,
    element.title,
    element.href,
    element.inputType
  ]
    .join(' ')
    .toLowerCase()

  let score = 1
  if (element.editable) score += 10
  if (element.clickable) score += 5
  if (element.role === 'searchbox') score += 15
  if (['button', 'link'].includes(element.role)) score += 4

  if (intent.wantsSearch) {
    if (element.editable) score += 30
    if (/search|搜索|搜|查找|query|q\b|关键词/.test(haystack)) score += 35
    if (element.role === 'searchbox') score += 40
  }

  if (intent.wantsInput && element.editable) score += 18
  if (intent.wantsOpen && ['button', 'link'].includes(element.role)) score += 10
  if (intent.wantsLogin && /登录|登陆|log ?in|sign ?in/.test(haystack)) score += 45

  for (const token of extractGoalTokens(intent.goalText)) {
    if (token.length >= 2 && haystack.includes(token)) score += 8
  }

  // 页面上方和中心区域通常更可能是导航/搜索/主按钮。
  score += Math.max(0, 6 - element.rect.y / 120)
  return score
}

function formatElementHints(candidates: ElementCandidate[], state: BrowserState): string {
  return candidates
    .map(({ element, score }) => {
      const { x: cx, y: cy } = toNormalizedCenter(element, state)
      const label =
        element.text ||
        element.placeholder ||
        element.ariaLabel ||
        element.title ||
        (element.href ? element.href.slice(0, 80) : '')
      const flags = [
        element.editable ? 'editable' : '',
        element.clickable ? 'clickable' : '',
        element.disabled ? 'disabled' : ''
      ]
        .filter(Boolean)
        .join(',')
      return `${element.id}: ${element.role}/${element.tag} label="${label || '无'}" center=(${cx},${cy}) size=${Math.round(
        element.rect.width
      )}x${Math.round(element.rect.height)} score=${Math.round(score)} ${flags}`
    })
    .join('\n')
}

function toDomDebugCandidates(
  candidates: ElementCandidate[],
  state: BrowserState
): WebAssistantDomCandidate[] {
  return candidates.map(({ element, score }) => {
    const label =
      element.text ||
      element.placeholder ||
      element.ariaLabel ||
      element.title ||
      (element.href ? element.href.slice(0, 80) : '')
    return {
      id: element.id,
      role: element.role,
      tag: element.tag,
      label: label || '无',
      score: Math.round(score),
      center: toNormalizedCenter(element, state),
      size: {
        width: Math.round(element.rect.width),
        height: Math.round(element.rect.height)
      },
      flags: [
        element.editable ? 'editable' : '',
        element.clickable ? 'clickable' : '',
        element.disabled ? 'disabled' : ''
      ].filter(Boolean)
    }
  })
}

function toNormalizedCenter(
  element: InteractiveElement,
  state: BrowserState
): { x: number; y: number } {
  return {
    x: Math.round((element.rect.centerX / Math.max(state.width, 1)) * 1000),
    y: Math.round((element.rect.centerY / Math.max(state.height, 1)) * 1000)
  }
}

function extractGoalTokens(goalText: string): string[] {
  return goalText
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2 && !['帮我', '请', '一个', '这个', '网页'].includes(token))
    .slice(0, 12)
}

function normalizeAction(action: any): BrowserAction {
  if (!action || typeof action !== 'object') {
    throw new Error('模型没有给出可执行动作')
  }

  const type = String(action.type || '').toLowerCase()
  const elementId = normalizeElementId(action.elementId || action.element_id || action.id)
  switch (type) {
    case 'click':
      return {
        type: 'click',
        elementId,
        x: action.x === undefined ? undefined : toNumber(action.x, 500),
        y: action.y === undefined ? undefined : toNumber(action.y, 500)
      }
    case 'type':
      return {
        type: 'type',
        elementId,
        x: action.x === undefined ? undefined : toNumber(action.x, 500),
        y: action.y === undefined ? undefined : toNumber(action.y, 500),
        text: String(action.text || '')
      }
    case 'scroll':
      return {
        type: 'scroll',
        elementId,
        x: action.x === undefined ? undefined : toNumber(action.x, 500),
        y: action.y === undefined ? undefined : toNumber(action.y, 500),
        dy: toNumber(action.dy, 600)
      }
    case 'key':
      return { type: 'key', key: String(action.key || 'Enter') }
    case 'wait':
      return { type: 'wait', ms: toNumber(action.ms, 1000) }
    case 'navigate':
    case 'open':
    case 'open_url':
      return { type: 'navigate', url: String(action.url || action.href || '') }
    case 'done':
      return { type: 'done', answer: String(action.answer || '完成了') }
    default:
      throw new Error(`模型返回了未知动作：${type || '空'}`)
  }
}

function describeAction(action: BrowserAction): string {
  switch (action.type) {
    case 'click':
      return action.elementId
        ? `点击元素 ${action.elementId}`
        : `点击 (${action.x ?? 500}, ${action.y ?? 500})`
    case 'type':
      return `${action.elementId ? `在 ${action.elementId} ` : ''}输入“${action.text.slice(0, 30)}${
        action.text.length > 30 ? '…' : ''
      }”`
    case 'scroll':
      return `${action.elementId ? `在 ${action.elementId} ` : ''}${
        action.dy > 0 ? '向下滚动' : '向上滚动'
      }`
    case 'key':
      return `按键 ${action.key}`
    case 'wait':
      return `等待 ${action.ms || 1000}ms`
    case 'navigate':
      return `打开 ${action.url}`
    case 'done':
      return '完成任务'
  }
}

function extractStartUrl(goal: string): string | null {
  const match = goal.match(/https?:\/\/[^\s，。]+/i)
  return match?.[0] || null
}

function resolveStartUrl(goal: string): string {
  const explicitUrl = extractStartUrl(goal)
  if (explicitUrl) return explicitUrl

  const searchQuery = extractSearchQuery(goal)
  if (searchQuery) {
    return DEFAULT_START_URL
  }

  return DEFAULT_START_URL
}

function extractSearchQuery(goal: string): string | null {
  const normalized = goal.replace(/\s+/g, ' ').trim()
  const searchMatch = normalized.match(
    /(?:搜索|搜一下|查找|查一下|检索)(.+?)(?:，|,|。|；|;|并|然后|找到|找一个|$)/
  )
  if (searchMatch?.[1]) {
    return cleanupSearchQuery(searchMatch[1])
  }

  if (/(找|查).*(网页|资料|练习题|方法|小实验)/.test(normalized)) {
    return cleanupSearchQuery(normalized)
  }

  return null
}

function isSearchResultsPage(url: string, title: string): boolean {
  return /[?&](q|wd|query)=/i.test(url) || /\/search\b/i.test(url) || /搜索结果/i.test(title)
}

function cleanupSearchQuery(query: string): string | null {
  const cleaned = query
    .replace(/^(帮我|请|给我|打开必应|一下|关于|有关|一个|一份|一些)/, '')
    .replace(/(，?找到.*|，?找一个.*|，?打开.*|网页$)/, '')
    .trim()
  return cleaned ? cleaned.slice(0, 80) : null
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeElementId(value: unknown): string | undefined {
  const id = String(value || '').trim()
  return /^e\d+$/i.test(id) ? id : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
