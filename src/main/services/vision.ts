import { net } from 'electron'
import { vertexVisionJson } from './googleVertexVision'
// 普通多模态模型调用：OpenAI-compatible Chat Completions。
// 如果设置 VISION_PROVIDER=google-vertex，则走 Vertex AI Gemini generateContent 做多模态理解。
// XueMate Computer Use 当前默认路线是 gcloud / Google Vertex：
// VISION_PROVIDER=google-vertex
// GOOGLE_VERTEX_PROJECT=你的 Google Cloud Project ID
// GOOGLE_VERTEX_LOCATION=global
// GOOGLE_VERTEX_VISION_MODEL=gemini-2.5-flash-lite
// GOOGLE_VERTEX_VISION_FALLBACK_MODELS=gemini-2.5-flash,gemini-3.1-flash-lite,gemini-3.1-pro-preview
//
// OpenAI-compatible 备选路线：
// VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
// VISION_API_KEY=你的多模态模型 key
// VISION_MODEL=gemini-2.5-flash 或 qwen-vl-plus
// VISION_FALLBACK_MODELS=gemini-2.5-flash-lite,qwen-vl-plus

const VISION_PROVIDER = process.env.VISION_PROVIDER || ''
const VISION_API_KEY = process.env.VISION_API_KEY || process.env.GEMINI_API_KEY || ''
const VISION_BASE_URL =
  process.env.VISION_BASE_URL ||
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const VISION_MODEL = isGoogleVertexProvider()
  ? process.env.GOOGLE_VERTEX_VISION_MODEL || process.env.VISION_MODEL || 'gemini-2.5-flash-lite'
  : process.env.VISION_MODEL || 'gemini-2.5-flash'
const VISION_FALLBACK_MODELS =
  (isGoogleVertexProvider()
    ? process.env.GOOGLE_VERTEX_VISION_FALLBACK_MODELS || process.env.VISION_FALLBACK_MODELS
    : process.env.VISION_FALLBACK_MODELS || process.env.GOOGLE_VERTEX_VISION_FALLBACK_MODELS) || ''

export interface VisionJsonOptions {
  prompt: string
  screenshotBase64: string
  screenshotMime?: string
  model?: string
  timeoutMs?: number
}

interface RetriableError extends Error {
  status?: number
  retryable?: boolean
  cause?: { message?: string }
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getErrorMessage(error: unknown, fallback = '未知错误'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function asRetriableError(error: Error): RetriableError {
  return error as RetriableError
}

function toRetriableError(error: unknown): RetriableError {
  if (error instanceof Error) return error as RetriableError
  return new Error(String(error || '未知错误')) as RetriableError
}

export async function visionJson<T = unknown>(options: VisionJsonOptions): Promise<T> {
  if (!isGoogleVertexProvider() && !VISION_API_KEY) {
    throw new Error('缺少 VISION_API_KEY 或 GEMINI_API_KEY，请先配置多模态模型密钥')
  }

  const { model = VISION_MODEL } = options
  const models = buildModelList(model)
  const failures: VisionFailure[] = []
  const maxAttemptsPerModel = models.length > 1 ? 1 : 2

  for (const candidateModel of models) {
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        return await requestVisionJson<T>({ ...options, model: candidateModel })
      } catch (error) {
        const failure = normalizeFailure(error, candidateModel)
        failures.push(failure)
        console.warn(
          `[Vision] ${candidateModel} attempt ${attempt} failed (${failure.status || 'unknown'}): ${failure.message}`
        )

        if (!failure.retryable && !shouldTryNextModel(failure, models, candidateModel)) {
          throw new Error(formatVisionError([failure]))
        }

        if (attempt < maxAttemptsPerModel) {
          await sleep(700 * attempt)
        }
      }
    }
  }

  throw new Error(formatVisionError(failures))
}

interface VisionFailure {
  model: string
  status?: number
  message: string
  retryable: boolean
}

async function requestVisionJson<T = unknown>(options: VisionJsonOptions): Promise<T> {
  if (isGoogleVertexProvider()) {
    return vertexVisionJson<T>(options)
  }

  const {
    prompt,
    screenshotBase64,
    screenshotMime = 'image/png',
    model = VISION_MODEL,
    timeoutMs = 45000
  } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await net.fetch(VISION_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VISION_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${screenshotMime};base64,${screenshotBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 900
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const body = await response.text()
      const detail = extractProviderError(body)
      const error = new Error(detail || response.statusText || '模型请求失败')
      const requestError = asRetriableError(error)
      requestError.status = response.status
      requestError.retryable = isRetryableStatus(response.status)
      throw error
    }

    const data = (await response.json()) as ChatCompletionResponse
    const content = normalizeContent(data?.choices?.[0]?.message?.content)
    if (!content) {
      const error = new Error('多模态模型没有返回内容')
      asRetriableError(error).retryable = true
      throw error
    }

    return parseJsonObject(content) as T
  } catch (error) {
    const requestError = toRetriableError(error)
    if (requestError.name === 'AbortError') {
      const timeoutError = new Error('多模态模型请求超时')
      asRetriableError(timeoutError).retryable = true
      throw timeoutError
    }
    const message = getErrorMessage(requestError, '')
    if (/^net::ERR_|ERR_NETWORK|ERR_TIMED_OUT|ERR_CONNECTION|ERR_PROXY/i.test(message)) {
      const networkError = new Error(`网络连接不稳定：${message}`)
      asRetriableError(networkError).retryable = true
      throw networkError
    }
    if (message === 'fetch failed' && requestError.cause?.message) {
      const fetchError = new Error(`多模态模型请求失败：${requestError.cause.message}`)
      asRetriableError(fetchError).retryable = true
      throw fetchError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function buildModelList(primaryModel: string): string[] {
  const defaults = isGoogleVertexProvider()
    ? [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.1-pro-preview'
      ]
    : isGoogleVisionEndpoint()
      ? ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
      : []
  const configuredFallbacks = VISION_FALLBACK_MODELS.split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return [...new Set([primaryModel, ...configuredFallbacks, ...defaults].filter(Boolean))]
}

function isGoogleVertexProvider(): boolean {
  return (
    /^(google-vertex|vertex)$/i.test(VISION_PROVIDER) || /^google-vertex$/i.test(VISION_BASE_URL)
  )
}

function isGoogleVisionEndpoint(): boolean {
  return /generativelanguage\.googleapis\.com/i.test(VISION_BASE_URL)
}

function normalizeFailure(error: unknown, model: string): VisionFailure {
  const requestError = toRetriableError(error)
  const status = Number(requestError.status)
  const message = getErrorMessage(requestError, '模型请求失败')
  return {
    model,
    status: Number.isFinite(status) ? status : undefined,
    message,
    retryable:
      Boolean(requestError.retryable) ||
      isRetryableStatus(status) ||
      isModelSelectionError(status, message)
  }
}

function isRetryableStatus(status: number): boolean {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
}

function shouldTryNextModel(
  failure: VisionFailure,
  models: string[],
  currentModel: string
): boolean {
  if (!isModelSelectionError(failure.status || 0, failure.message)) return false
  return models.indexOf(currentModel) < models.length - 1
}

function isModelSelectionError(status: number, message: string): boolean {
  return (
    [400, 404].includes(status) &&
    /model|模型|not found|not supported|not exist|not available|not enabled/i.test(message)
  )
}

function formatVisionError(failures: VisionFailure[]): string {
  const last = failures[failures.length - 1]
  const hasBusy = failures.some(
    (failure) =>
      failure.status === 503 ||
      /unavailable|high demand|temporar|busy|overload/i.test(failure.message)
  )
  const hasQuota = failures.some(
    (failure) => failure.status === 429 || /quota|rate limit|exceeded/i.test(failure.message)
  )

  if (hasQuota && !hasBusy) {
    return `多模态模型额度不足或被限流了。可以稍后再试，或在 .env 里换一个 ${modelEnvName()}。`
  }

  const hasModelSelectionError = failures.some((failure) =>
    isModelSelectionError(failure.status || 0, failure.message)
  )
  if (hasModelSelectionError) {
    const triedModels = [...new Set(failures.map((failure) => failure.model))].join('、')
    return `多模态模型名称不可用，已尝试备用模型（${triedModels}），仍然失败。请检查 .env 里的 ${modelEnvName()}。`
  }

  if (hasBusy) {
    const triedModels = [...new Set(failures.map((failure) => failure.model))].join('、')
    return `多模态模型现在太忙，已自动重试并切换备用模型（${triedModels}），仍然失败。请稍后再试。`
  }

  return last?.message || '多模态模型请求失败'
}

function modelEnvName(): string {
  return isGoogleVertexProvider() ? 'GOOGLE_VERTEX_VISION_MODEL' : 'VISION_MODEL'
}

function extractProviderError(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown
    const payload = Array.isArray(parsed) ? parsed[0] : parsed
    if (isRecord(payload)) {
      const error = payload.error
      if (isRecord(error) && typeof error.message === 'string') return error.message
      if (typeof payload.message === 'string') return payload.message
    }
    return body.slice(0, 220)
  } catch {
    return body.slice(0, 220)
  }
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === 'string') return item
        if (!isRecord(item)) return ''
        if (typeof item.text === 'string') return item.text
        if (typeof item.content === 'string') return item.content
        return ''
      })
      .join('\n')
  }
  return ''
}

function parseJsonObject(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error(`模型没有返回 JSON：${trimmed.slice(0, 160)}`)
    }
    return JSON.parse(match[0])
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
