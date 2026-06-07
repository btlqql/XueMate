export type BridgeCacheProducer<T> = () => Promise<T> | T

export interface BridgeCacheStats {
  enabled: boolean
  size: number
  maxEntries: number
  ttlMs: number
  hits: number
  misses: number
  pendingHits: number
  writes: number
  evictions: number
  expirations: number
  bypasses: number
  clears: number
  lastClearReason?: string
}

export interface BridgeCacheOptions {
  noCache?: boolean
  bypass?: boolean
}

type CacheEntry<T = unknown> = {
  value: T
  expiresAt: number
  lastAccessedAt: number
}

type CacheConfig = {
  enabled: boolean
  ttlMs: number
  maxEntries: number
}

const DEFAULT_TTL_MS = 30_000
const DEFAULT_MAX_ENTRIES = 128
const OFF_VALUES = new Set(['off', 'false', '0', 'no', 'disabled'])
const NO_CACHE_KEYS = new Set(['noCache', 'no_cache'])

const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<unknown>>()

const counters = {
  hits: 0,
  misses: 0,
  pendingHits: 0,
  writes: 0,
  evictions: 0,
  expirations: 0,
  bypasses: 0,
  clears: 0
}

let lastClearReason: string | undefined
let cacheGeneration = 0

export function clearBridgeCache(reason?: string): void {
  cache.clear()
  pending.clear()
  cacheGeneration++
  counters.clears++
  lastClearReason = reason
}

export function getBridgeCacheStats(): BridgeCacheStats {
  const config = getBridgeCacheConfig()
  if (!config.enabled) {
    cache.clear()
    pending.clear()
  } else {
    pruneExpired(Date.now())
    enforceMaxEntries(config.maxEntries)
  }

  return {
    enabled: config.enabled,
    size: cache.size,
    maxEntries: config.maxEntries,
    ttlMs: config.ttlMs,
    hits: counters.hits,
    misses: counters.misses,
    pendingHits: counters.pendingHits,
    writes: counters.writes,
    evictions: counters.evictions,
    expirations: counters.expirations,
    bypasses: counters.bypasses,
    clears: counters.clears,
    lastClearReason
  }
}

export function bridgeCacheKey(method: string, path: string, body?: unknown): string {
  const normalizedMethod = method.toUpperCase()
  const normalizedPath = normalizePath(path)
  const sanitizedBody = sanitizeBody(body)
  if (sanitizedBody === undefined) return `${normalizedMethod} ${normalizedPath}`
  return `${normalizedMethod} ${normalizedPath} ${stableStringify(sanitizedBody)}`
}

export async function withBridgeCache<T>(
  key: string,
  producer: BridgeCacheProducer<T>,
  options: BridgeCacheOptions = {}
): Promise<T> {
  const config = getBridgeCacheConfig()
  if (!config.enabled || options.noCache || options.bypass) {
    counters.bypasses++
    if (!config.enabled) {
      cache.clear()
      pending.clear()
    }
    return producer()
  }

  const now = Date.now()
  pruneExpired(now)

  const cached = cache.get(key) as CacheEntry<T> | undefined
  if (cached) {
    if (cached.expiresAt > now) {
      counters.hits++
      cached.lastAccessedAt = now
      touchEntry(key, cached)
      return cached.value
    }

    cache.delete(key)
    counters.expirations++
  }

  const pendingProducer = pending.get(key) as Promise<T> | undefined
  if (pendingProducer) {
    counters.pendingHits++
    return pendingProducer
  }

  counters.misses++
  const generation = cacheGeneration
  const promise = Promise.resolve()
    .then(producer)
    .then((value) => {
      if (generation !== cacheGeneration) return value

      const storedAt = Date.now()
      cache.set(key, {
        value,
        expiresAt: storedAt + config.ttlMs,
        lastAccessedAt: storedAt
      })
      counters.writes++
      enforceMaxEntries(config.maxEntries)
      return value
    })
    .finally(() => {
      pending.delete(key)
    })

  pending.set(key, promise)
  return promise
}

function getBridgeCacheConfig(): CacheConfig {
  const enabledRaw = process.env.XUEMATE_BRIDGE_CACHE
  const ttlRaw = process.env.XUEMATE_BRIDGE_CACHE_TTL_MS
  const maxRaw = process.env.XUEMATE_BRIDGE_CACHE_MAX_ENTRIES

  if (isOffValue(enabledRaw) || isOffValue(ttlRaw) || isOffValue(maxRaw)) {
    return { enabled: false, ttlMs: 0, maxEntries: 0 }
  }

  const ttlMs = parsePositiveInteger(ttlRaw, DEFAULT_TTL_MS)
  const maxEntries = parsePositiveInteger(maxRaw, DEFAULT_MAX_ENTRIES)

  if (ttlMs <= 0 || maxEntries <= 0) {
    return { enabled: false, ttlMs: 0, maxEntries: 0 }
  }

  return { enabled: true, ttlMs, maxEntries }
}

function normalizePath(path: string): string {
  try {
    const url = new URL(path, 'http://xuemate.local')
    const params = Array.from(url.searchParams.entries())
      .filter(([key]) => !NO_CACHE_KEYS.has(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyCompare = leftKey.localeCompare(rightKey)
        return keyCompare === 0 ? leftValue.localeCompare(rightValue) : keyCompare
      })

    const query = new URLSearchParams(params).toString()
    return query ? `${url.pathname}?${query}` : url.pathname
  } catch {
    return path
  }
}

function sanitizeBody(body: unknown): unknown {
  if (body === undefined || body === null) return undefined
  if (Array.isArray(body)) return body.map(sanitizeBody)
  if (typeof body !== 'object') return body

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (NO_CACHE_KEYS.has(key)) continue
    const sanitizedValue = sanitizeBody(value)
    if (sanitizedValue !== undefined) sanitized[key] = sanitizedValue
  }
  return sanitized
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function isOffValue(value: string | undefined): boolean {
  if (value === undefined) return false
  return OFF_VALUES.has(value.trim().toLowerCase())
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function touchEntry(key: string, entry: CacheEntry): void {
  cache.delete(key)
  cache.set(key, entry)
}

function pruneExpired(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key)
      counters.expirations++
    }
  }
}

function enforceMaxEntries(maxEntries: number): void {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (typeof oldestKey !== 'string') break
    cache.delete(oldestKey)
    counters.evictions++
  }
}
