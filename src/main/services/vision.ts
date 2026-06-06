import { net } from 'electron'
import { vertexVisionJson } from './googleVertexVision'
// 普通多模态模型调用：OpenAI-compatible Chat Completions。
// 如果设置 VISION_PROVIDER=google-vertex，则走 Vertex AI Gemini generateContent 做多模态理解。
// 推荐环境变量：
// VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
// VISION_API_KEY=你的多模态模型 key
// VISION_MODEL=gemini-2.5-flash 或 qwen-vl-plus
// VISION_FALLBACK_MODELS=gemini-2.5-flash-lite,qwen-vl-plus

const VISION_PROVIDER = process.env.VISION_PROVIDER || ''
const VISION_API_KEY = process.env.VISION_API_KEY || process.env.GEMINI_API_KEY || ''
const VISION_BASE_URL =
  process.env.VISION_BASE_URL ||
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const VISION_MODEL =
  process.env.VISION_MODEL ||
  (isGoogleVertexProvider()
    ? process.env.GOOGLE_VERTEX_VISION_MODEL || 'gemini-3.5-flash'
    : 'gemini-2.5-flash')
const VISION_FALLBACK_MODELS =
  process.env.VISION_FALLBACK_MODELS || process.env.GOOGLE_VERTEX_VISION_FALLBACK_MODELS || ''

export interface VisionJsonOptions {
  prompt: string
  screenshotBase64: string
  screenshotMime?: string
  model?: string
  timeoutMs?: number
}

export async function visionJson<T = any>(options: VisionJsonOptions): Promise<T> {
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
      } catch (error: any) {
        const failure = normalizeFailure(error, candidateModel)
        failures.push(failure)
        console.warn(
          `[Vision] ${candidateModel} attempt ${attempt} failed (${failure.status || 'unknown'}): ${failure.message}`
        )

        if (!failure.retryable) {
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

async function requestVisionJson<T = any>(options: VisionJsonOptions): Promise<T> {
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
      ;(error as any).status = response.status
      ;(error as any).retryable = isRetryableStatus(response.status)
      throw error
    }

    const data = await response.json()
    const content = normalizeContent(data?.choices?.[0]?.message?.content)
    if (!content) {
      const error = new Error('多模态模型没有返回内容')
      ;(error as any).retryable = true
      throw error
    }

    return parseJsonObject(content) as T
  } catch (error: any) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('多模态模型请求超时')
      ;(timeoutError as any).retryable = true
      throw timeoutError
    }
    if (
      /^net::ERR_|ERR_NETWORK|ERR_TIMED_OUT|ERR_CONNECTION|ERR_PROXY/i.test(error.message || '')
    ) {
      const networkError = new Error(`网络连接不稳定：${error.message}`)
      ;(networkError as any).retryable = true
      throw networkError
    }
    if (error.message === 'fetch failed' && error.cause?.message) {
      const fetchError = new Error(`多模态模型请求失败：${error.cause.message}`)
      ;(fetchError as any).retryable = true
      throw fetchError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function buildModelList(primaryModel: string): string[] {
  const defaults = isGoogleVertexProvider()
    ? ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']
    : isGoogleVisionEndpoint()
      ? ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']
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

function normalizeFailure(error: any, model: string): VisionFailure {
  const status = Number(error?.status)
  return {
    model,
    status: Number.isFinite(status) ? status : undefined,
    message: String(error?.message || '模型请求失败'),
    retryable: Boolean(error?.retryable) || isRetryableStatus(status)
  }
}

function isRetryableStatus(status: number): boolean {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
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
    return '多模态模型额度不足或被限流了。可以稍后再试，或在 .env 里换一个 VISION_MODEL。'
  }

  if (hasBusy) {
    const triedModels = [...new Set(failures.map((failure) => failure.model))].join('、')
    return `多模态模型现在太忙，已自动重试并切换备用模型（${triedModels}），仍然失败。请稍后再试。`
  }

  return last?.message || '多模态模型请求失败'
}

function extractProviderError(body: string): string {
  try {
    const parsed = JSON.parse(body)
    const payload = Array.isArray(parsed) ? parsed[0] : parsed
    return payload?.error?.message || payload?.message || body.slice(0, 220)
  } catch {
    return body.slice(0, 220)
  }
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item: any) => {
        if (typeof item === 'string') return item
        if (typeof item?.text === 'string') return item.text
        if (typeof item?.content === 'string') return item.content
        return ''
      })
      .join('\n')
  }
  return ''
}

function parseJsonObject(text: string): any {
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
