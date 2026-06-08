import { desktopCapturer } from 'electron'
import { visionJson } from '../ai/vision'

export interface DesktopVisionObservation {
  summary: string
  visibleApps: string[]
  visibleText: string[]
  actionableItems: string[]
  nextSuggestion: string
  screenshotMime: string
}

interface VisionObservationPayload {
  summary?: unknown
  visibleApps?: unknown
  visibleText?: unknown
  actionableItems?: unknown
  nextSuggestion?: unknown
}

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, 1200) : fallback
}

function normalizeList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeText(item).replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeObservation(payload: VisionObservationPayload): DesktopVisionObservation {
  return {
    summary: normalizeText(payload.summary, '没有识别到明确的桌面状态'),
    visibleApps: normalizeList(payload.visibleApps, 8),
    visibleText: normalizeList(payload.visibleText, 12),
    actionableItems: normalizeList(payload.actionableItems, 8),
    nextSuggestion: normalizeText(payload.nextSuggestion, '继续用命令行检查，必要时再观察屏幕'),
    screenshotMime: 'image/png'
  }
}

function buildPrompt(goal: string, recentHistory: string): string {
  return `你是 XueMate 的桌面视觉观察器，只负责观察当前真实屏幕，不负责点击或执行动作。

用户目标：${goal}

最近 sandbox / agent 历史：
${recentHistory || '暂无'}

请根据截图回答：当前屏幕上是什么状态，能看到哪些 App、文字、按钮或错误提示，以及下一步更适合用命令行还是需要用户手动操作。

只返回 JSON，不要 Markdown：
{
  "summary": "一句话总结当前屏幕状态",
  "visibleApps": ["看到的应用或窗口"],
  "visibleText": ["能看清的关键文字"],
  "actionableItems": ["可操作按钮/输入框/菜单，不确定就少写"],
  "nextSuggestion": "下一步建议，优先说明能不能回到 sandbox 命令处理"
}`
}

export async function observeDesktopWithVision(
  goal: string,
  recentHistory: string
): Promise<DesktopVisionObservation> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 },
    fetchWindowIcons: false
  })
  const source = sources[0]
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('无法截取当前屏幕，请检查系统屏幕录制权限')
  }

  const png = source.thumbnail.toPNG()
  const payload = await visionJson<VisionObservationPayload>({
    prompt: buildPrompt(goal, recentHistory),
    screenshotBase64: png.toString('base64'),
    screenshotMime: 'image/png',
    timeoutMs: 45000
  })
  return normalizeObservation(payload)
}
