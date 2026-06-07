export type QueryEmbeddingProducer = () => Promise<number[]>

export interface QueryEmbeddingCacheStats {
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
}

type CacheEntry = {
  embedding: number[]
  expiresAt: number
  lastAccessedAt: number
}

type CacheConfig = {
  enabled: boolean
  ttlMs: number
  maxEntries: number
}

const DEFAULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 256

const OFF_VALUES = new Set(['off', 'false', '0', 'no', 'disabled'])

const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<number[]>>()

const counters = {
  hits: 0,
  misses: 0,
  pendingHits: 0,
  writes: 0,
  evictions: 0,
  expirations: 0,
  bypasses: 0
}

export async function getCachedQueryEmbedding(
  key: string,
  producer: QueryEmbeddingProducer
): Promise<number[]> {
  const config = getCacheConfig()
  if (!config.enabled) {
    counters.bypasses++
    cache.clear()
    pending.clear()
    return producer()
  }

  const now = Date.now()
  pruneExpired(now)

  const cached = cache.get(key)
  if (cached) {
    if (cached.expiresAt > now) {
      counters.hits++
      cached.lastAccessedAt = now
      touchEntry(key, cached)
      return [...cached.embedding]
    }

    cache.delete(key)
    counters.expirations++
  }

  const pendingProducer = pending.get(key)
  if (pendingProducer) {
    counters.pendingHits++
    return [...(await pendingProducer)]
  }

  counters.misses++
  const promise = producer()
    .then((embedding) => {
      const stored = [...embedding]
      const storedAt = Date.now()
      cache.set(key, {
        embedding: stored,
        expiresAt: storedAt + config.ttlMs,
        lastAccessedAt: storedAt
      })
      counters.writes++
      enforceMaxEntries(config.maxEntries)
      return [...stored]
    })
    .finally(() => {
      pending.delete(key)
    })

  pending.set(key, promise)
  return [...(await promise)]
}

export function invalidateQueryEmbeddingCache(): void {
  cache.clear()
  pending.clear()
  resetCounters()
}

export function getQueryEmbeddingCacheStats(): QueryEmbeddingCacheStats {
  const config = getCacheConfig()
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
    bypasses: counters.bypasses
  }
}

function getCacheConfig(): CacheConfig {
  const ttlRaw = process.env.XUEMATE_RAG_QUERY_CACHE_TTL_MS
  const maxRaw = process.env.XUEMATE_RAG_QUERY_CACHE_MAX_ENTRIES

  if (isOffValue(ttlRaw) || isOffValue(maxRaw)) {
    return { enabled: false, ttlMs: 0, maxEntries: 0 }
  }

  const ttlMs = parsePositiveInteger(ttlRaw, DEFAULT_TTL_MS)
  const maxEntries = parsePositiveInteger(maxRaw, DEFAULT_MAX_ENTRIES)

  if (ttlMs <= 0 || maxEntries <= 0) {
    return { enabled: false, ttlMs: 0, maxEntries: 0 }
  }

  return { enabled: true, ttlMs, maxEntries }
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

function resetCounters(): void {
  counters.hits = 0
  counters.misses = 0
  counters.pendingHits = 0
  counters.writes = 0
  counters.evictions = 0
  counters.expirations = 0
  counters.bypasses = 0
}
