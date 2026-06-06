import { net } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { createSign } from 'crypto'

const DEFAULT_LOCATION = 'global'
const DEFAULT_VERTEX_VISION_MODEL = 'gemini-2.5-flash-lite'
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'

let cachedToken: { token: string; expiresAt: number } | null = null

export interface VertexVisionJsonOptions {
  prompt: string
  screenshotBase64: string
  screenshotMime?: string
  model?: string
  timeoutMs?: number
}

interface VertexConfig {
  project: string
  location: string
  model: string
  gcloud?: string
}

interface RetriableError extends Error {
  status?: number
  retryable?: boolean
}

interface VertexApiResponse {
  error?: {
    code?: number
    message?: string
  }
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

function asRetriableError(error: Error): RetriableError {
  return error as RetriableError
}

function toRetriableError(error: unknown): RetriableError {
  if (error instanceof Error) return error as RetriableError
  return new Error(String(error || '未知错误')) as RetriableError
}

export async function vertexVisionJson<T = unknown>(options: VertexVisionJsonOptions): Promise<T> {
  const responseText = await requestVertexVisionText(options)
  return parseJsonObject(responseText) as T
}

async function requestVertexVisionText(options: VertexVisionJsonOptions): Promise<string> {
  const config = readVertexConfig(options.model)
  const token = await getAccessToken(config)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 45000)

  try {
    const response = await net.fetch(vertexGenerateContentUrl(config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: options.prompt },
              {
                inlineData: {
                  mimeType: options.screenshotMime || 'image/png',
                  data: options.screenshotBase64.replace(/\s+/g, '')
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT'],
          temperature: 0.1,
          maxOutputTokens: 900
        }
      }),
      signal: controller.signal
    })

    const raw = await response.text()
    const body = parseJsonResponse(raw, response.status)
    if (!response.ok || body?.error) {
      const error = new Error(
        body?.error?.message || `Vertex AI vision request failed with HTTP ${response.status}`
      )
      const requestError = asRetriableError(error)
      const status = response.status || body?.error?.code || 0
      requestError.status = status
      requestError.retryable = isRetryableStatus(status)
      throw error
    }

    const parts = body?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts)
      ? parts
          .filter((part) => typeof part.text === 'string')
          .map((part) => part.text)
          .join('\n')
          .trim()
      : ''

    if (!text) {
      const error = new Error('Vertex 多模态理解模型没有返回文本 JSON')
      asRetriableError(error).retryable = true
      throw error
    }

    return text
  } catch (error) {
    const requestError = toRetriableError(error)
    if (requestError.name === 'AbortError') {
      const timeoutError = new Error('Vertex 多模态理解请求超时')
      asRetriableError(timeoutError).retryable = true
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function readVertexConfig(modelOverride?: string): VertexConfig {
  const gcloud = findExecutable([
    process.env.GCLOUD_BIN,
    'gcloud',
    '/opt/homebrew/share/google-cloud-sdk/bin/gcloud'
  ])
  const configuredProject = readConfiguredProject(gcloud)
  const project =
    process.env.GOOGLE_VERTEX_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    configuredProject

  if (!project || project === '(unset)') {
    throw new Error('缺少 GOOGLE_VERTEX_PROJECT，请先配置 Google Cloud Project ID')
  }

  return {
    project,
    location: process.env.GOOGLE_VERTEX_LOCATION || DEFAULT_LOCATION,
    model:
      modelOverride ||
      process.env.GOOGLE_VERTEX_VISION_MODEL ||
      process.env.VISION_MODEL ||
      DEFAULT_VERTEX_VISION_MODEL,
    gcloud
  }
}

function vertexGenerateContentUrl(config: VertexConfig): string {
  return `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    config.project
  )}/locations/${encodeURIComponent(config.location)}/publishers/google/models/${encodeURIComponent(
    config.model
  )}:generateContent`
}

async function getAccessToken(config: VertexConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  if (process.env.GOOGLE_VERTEX_ACCESS_TOKEN) {
    return cacheToken(process.env.GOOGLE_VERTEX_ACCESS_TOKEN)
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return cacheToken(await getServiceAccountToken(process.env.GOOGLE_APPLICATION_CREDENTIALS))
  }

  if (config.gcloud) {
    return cacheToken(runCommand(config.gcloud, ['auth', 'print-access-token']))
  }

  return cacheToken(await getMetadataServerToken())
}

function cacheToken(token: string): string {
  cachedToken = { token, expiresAt: Date.now() + 50 * 60 * 1000 }
  return token
}

async function getServiceAccountToken(credentialsPath: string): Promise<string> {
  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'))
  if (
    credentials.type !== 'service_account' ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS 必须指向 service account JSON 文件')
  }

  const now = Math.floor(Date.now() / 1000)
  const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token'
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: CLOUD_PLATFORM_SCOPE,
      aud: tokenUri,
      iat: now,
      exp: now + 3600
    })
  )}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`

  const response = await net.fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  })
  const body = await response.json()
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(
      body.error_description || body.error || `service account token failed: ${response.status}`
    )
  }
  return body.access_token
}

async function getMetadataServerToken(): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1200)
  try {
    const response = await net.fetch(METADATA_TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: controller.signal
    })
    const body = await response.json()
    if (!response.ok || typeof body.access_token !== 'string') {
      throw new Error(`metadata token request failed with HTTP ${response.status}`)
    }
    return body.access_token
  } finally {
    clearTimeout(timeout)
  }
}

function findExecutable(candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate.includes('/') && existsSync(candidate)) return candidate
    if (!candidate.includes('/')) {
      const result = spawnSync('/bin/sh', ['-lc', `command -v ${shellQuote(candidate)}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const found = result.stdout.trim()
      if (result.status === 0 && found) return found
    }
  }
  return undefined
}

function readConfiguredProject(gcloud?: string): string {
  if (!gcloud) return ''
  try {
    return runCommand(gcloud, ['config', 'get-value', 'project']).trim()
  } catch {
    return ''
  }
}

function runCommand(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} exited with ${result.status}`)
  }
  return result.stdout.trim()
}

function parseJsonResponse(text: string, status: number): VertexApiResponse {
  try {
    return JSON.parse(text) as VertexApiResponse
  } catch {
    return { error: { code: status, message: text.slice(0, 500) } }
  }
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
    if (!match) throw new Error(`Vertex 多模态理解模型没有返回 JSON：${trimmed.slice(0, 160)}`)
    return JSON.parse(match[0])
  }
}

function isRetryableStatus(status: number): boolean {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}
