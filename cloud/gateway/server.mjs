import http from 'node:http'
import { URL } from 'node:url'
import { createHash } from 'node:crypto'

const PORT = Number(process.env.XUEMATE_CLOUD_PORT || process.env.PORT || 8787)
const HOST = process.env.XUEMATE_CLOUD_HOST || '127.0.0.1'
const CACHE_TTL_MS = Number(process.env.XUEMATE_CLOUD_CACHE_TTL_MS || 10 * 60 * 1000)
const FETCH_TIMEOUT_MS = Number(process.env.XUEMATE_CLOUD_FETCH_TIMEOUT_MS || 9000)
const MAX_PAGE_CHARS = Number(process.env.XUEMATE_CLOUD_MAX_PAGE_CHARS || 5000)
const SEARXNG_URL = (process.env.SEARXNG_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')
const CRAWL4AI_URL = (process.env.CRAWL4AI_URL || 'http://127.0.0.1:11235').replace(/\/$/, '')

const tasks = new Map()
const cache = new Map()
const metrics = {
  startedAt: new Date().toISOString(),
  requests: 0,
  searches: 0,
  scoreCalls: 0,
  cacheHits: 0,
  fetches: 0,
  fetchErrors: 0,
  totalLatencyMs: 0,
  lastRequestAt: null
}

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-XueMate-Client',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function notFound(res) {
  json(res, 404, { success: false, error: 'not found' })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!body.trim()) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('invalid json body'))
      }
    })
    req.on('error', reject)
  })
}

function taskIdFor(prefix, input) {
  return `${prefix}_${Date.now()}_${createHash('sha1').update(input).digest('hex').slice(0, 8)}`
}

function pushStage(task, name, status = 'done', detail = '') {
  const stage = {
    name,
    status,
    detail,
    at: new Date().toISOString()
  }
  task.stages.push(stage)
  task.updatedAt = stage.at
}

function normalizeText(value, max = MAX_PAGE_CHARS) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .trim()
    .slice(0, max)
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(parseInt(code, 16)))
}

function extractTitle(html) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()
}

function resolveHref(rawHref, baseUrl) {
  try {
    const href = decodeHtml(rawHref).trim()
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return ''
    return unwrapSearchRedirect(new URL(href, baseUrl).href)
  } catch {
    return ''
  }
}

function unwrapSearchRedirect(url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    // Bing result links often look like /ck?...&u=a1aHR0cHM6...
    // Decode them so the education scorer sees the real target URL.
    if (host.includes('bing.com')) {
      const encoded = parsed.searchParams.get('u')
      if (encoded?.startsWith('a1')) {
        const raw = encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/')
        const decoded = Buffer.from(raw, 'base64').toString('utf8')
        if (/^https?:\/\//i.test(decoded)) return decoded
      }
    }

    // DuckDuckGo html links sometimes wrap targets in uddg=.
    if (host.includes('duckduckgo.com')) {
      const uddg = parsed.searchParams.get('uddg')
      if (uddg && /^https?:\/\//i.test(uddg)) return uddg
    }

    return url
  } catch {
    return url
  }
}

function extractSearchLinks(html, baseUrl) {
  const links = []
  const seen = new Set()
  const patterns = [
    /<h2[^>]*>\s*<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi,
    /<a\b[^>]*href=(['"])(https?:\/\/[^'"]+)\1[^>]*>([\s\S]*?)<\/a>/gi
  ]

  for (const regex of patterns) {
    let match
    while ((match = regex.exec(html)) && links.length < 12) {
      const href = resolveHref(match[2], baseUrl)
      if (!href || seen.has(href)) continue
      if (/javascript:/i.test(href)) continue
      try {
        const host = new URL(href).hostname
        if (/bing\.com|microsoft\.com|go\.microsoft\.com/i.test(host)) continue
      } catch {
        continue
      }
      const title = normalizeText(match[3], 120)
      if (!title || /^(http|www\.)/i.test(title)) continue
      seen.add(href)
      links.push({ title, url: href })
    }
  }
  return links.slice(0, 8)
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  metrics.fetches++
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
      }
    })
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (!/html|text|json|xml/i.test(contentType)) {
      return { url: response.url || url, title: '网页资源', text: `非文本资源：${contentType}` }
    }
    const html = await response.text()
    return {
      url: response.url || url,
      title: extractTitle(html) || '网页资源',
      text: normalizeText(html, MAX_PAGE_CHARS),
      html
    }
  } catch (error) {
    metrics.fetchErrors++
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function tokenize(text) {
  const lower = String(text || '').toLowerCase()
  const latin = lower.match(/[a-z0-9_#.+-]{2,}/g) || []
  const cjk = lower.match(/[\u4e00-\u9fa5]/g) || []
  const grams = []
  for (let i = 0; i < cjk.length - 1; i++) grams.push(cjk[i] + cjk[i + 1])
  return [...new Set([...latin, ...grams])]
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scoreResource({ query = '', title = '', url = '', text = '' }) {
  const joined = `${title}\n${url}\n${text}`.toLowerCase()
  const qTokens = tokenize(query)
  const hitCount = qTokens.filter((token) => joined.includes(token)).length
  const relevance = clampScore(qTokens.length ? 42 + (hitCount / qTokens.length) * 58 : 55)

  const len = text.length
  const readability = clampScore(
    58 +
      (len > 260 ? 14 : 0) +
      (len > 900 ? 10 : 0) +
      (/步骤|例子|图解|动画|练习|总结|入门|小学生|孩子|儿童/.test(joined) ? 14 : 0) -
      (/论文|硕士|博士|源码|高级|复杂|成人|广告|付费|下载/.test(joined) ? 12 : 0)
  )

  const ageFit = clampScore(
    62 +
      (/小学|小学生|儿童|孩子|少儿|启蒙|入门|动画|图解|简单|一步一步/.test(joined) ? 24 : 0) -
      (/大学|研究生|论文|高级|成人|彩票|游戏充值|暴力/.test(joined) ? 26 : 0)
  )

  let trustBase = 58
  try {
    const host = new URL(url).hostname
    if (/\.edu\.cn$|\.edu$|\.gov\.cn$|\.gov$/.test(host)) trustBase += 24
    if (/wikipedia|baike|python|scratch|khanacademy|coursera|bilibili|cnblogs|csdn/i.test(host)) trustBase += 10
    if (/download|apk|coupon|casino|bet|loan/i.test(host)) trustBase -= 30
  } catch {
    trustBase -= 10
  }
  const trust = clampScore(trustBase)

  const adNoise = clampScore(
    18 +
      (/广告|推广|赞助|立即购买|优惠券|下载|注册|登录后查看/g.test(joined) ? 36 : 0) +
      ((joined.match(/下载|购买|优惠|推广/g) || []).length * 6)
  )

  const overall = clampScore(relevance * 0.34 + readability * 0.22 + ageFit * 0.24 + trust * 0.16 + (100 - adNoise) * 0.04)
  const level = overall >= 85 ? 'A' : overall >= 72 ? 'B' : overall >= 58 ? 'C' : 'D'

  return {
    relevance,
    readability,
    ageFit,
    trust,
    adNoise,
    overall,
    level,
    reason: `相关度${relevance}，适龄性${ageFit}，可读性${readability}，可信度${trust}`
  }
}

function summarizeFromSources(query, sources) {
  if (!sources.length) return `没有找到足够可靠的“${query}”学习资源。`
  const top = sources.slice(0, 3)
  return [
    `云端已从开放网络中筛选出 ${sources.length} 个学习资源，并按相关度、适龄性、可读性和可信度评分。`,
    `最推荐的是「${top[0].title}」，综合评分 ${top[0].scores.overall}（${top[0].scores.level} 级）。`,
    `建议优先阅读 A/B 级资源；如果给小学生使用，优先选择标题或正文中包含“入门、图解、动画、步骤”的内容。`
  ].join('')
}


async function searchWithSearxng(query) {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&language=zh-CN&categories=general`
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'XueMate-Cloud-Gateway/0.1'
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`SearXNG HTTP ${response.status}`)
    const payload = await response.json()
    const results = Array.isArray(payload.results) ? payload.results : []
    const seen = new Set()
    return results
      .map((item) => ({
        title: normalizeText(item.title || item.content || item.url, 160),
        url: String(item.url || '').trim(),
        snippet: normalizeText(item.content || '', 300),
        engine: Array.isArray(item.engines) ? item.engines.join(',') : String(item.engine || '')
      }))
      .filter((item) => {
        if (!/^https?:\/\//i.test(item.url) || seen.has(item.url)) return false
        seen.add(item.url)
        return true
      })
      .slice(0, 10)
  } catch (error) {
    console.warn('[Gateway] SearXNG unavailable, fallback to direct Bing:', error.message || error)
    return null
  }
}

async function crawlWithCrawl4AI(url) {
  try {
    const response = await fetch(`${CRAWL4AI_URL}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'XueMate-Cloud-Gateway/0.1'
      },
      body: JSON.stringify({
        urls: [url],
        browser_config: {
          headless: true,
          text_mode: true
        },
        crawler_config: {
          word_count_threshold: 8,
          excluded_tags: ['script', 'style', 'nav', 'footer', 'header', 'form', 'svg'],
          remove_overlay_elements: true,
          only_text: false
        }
      }),
      signal: AbortSignal.timeout(Math.max(FETCH_TIMEOUT_MS, 15000))
    })
    if (!response.ok) throw new Error(`Crawl4AI HTTP ${response.status}`)
    const payload = await response.json()
    const result = Array.isArray(payload.results) ? payload.results[0] : null
    if (!payload.success || !result) throw new Error(payload.msg || 'empty crawl result')
    const markdown =
      typeof result.markdown === 'string'
        ? result.markdown
        : result.markdown?.raw_markdown || result.markdown?.fit_markdown || ''
    return {
      url: result.url || url,
      title: result.metadata?.title || result.title || '网页资源',
      text: normalizeText(markdown || result.cleaned_html || result.html || '', MAX_PAGE_CHARS)
    }
  } catch (error) {
    console.warn('[Gateway] Crawl4AI unavailable, fallback to direct fetch:', error.message || error)
    return null
  }
}

async function handleResourceSearch(body) {
  const query = String(body.query || '').trim()
  const limit = Math.max(1, Math.min(Number(body.limit || 4), 6))
  if (!query) throw new Error('query is required')

  metrics.searches++
  const cacheKey = `search:${query}:${limit}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    metrics.cacheHits++
    return { ...cached.value, cacheHit: true }
  }

  const started = Date.now()
  const task = {
    id: taskIdFor('search', query),
    type: 'resource-search',
    status: 'running',
    query,
    stages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  tasks.set(task.id, task)

  pushStage(task, 'query-normalize', 'done', `标准化查询：${query}`)
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  pushStage(task, 'network-search', 'running', '调用 SearXNG 搜索聚合服务')
  let links = await searchWithSearxng(query)
  if (links) {
    pushStage(task, 'network-search', 'done', `SearXNG 返回 ${links.length} 个候选结果`)
  } else {
    pushStage(task, 'network-search', 'running', 'SearXNG 不可用，回退到直接搜索结果页抓取')
    const searchPage = await fetchText(searchUrl)
    links = extractSearchLinks(searchPage.html || '', searchPage.url || searchUrl)
    pushStage(task, 'network-search', 'done', `直接搜索回退返回 ${links.length} 个候选结果`)
  }

  pushStage(task, 'link-extract', 'done', `候选链接 ${links.length} 个`)

  const sources = []
  for (const link of links.slice(0, Math.max(limit + 2, 4))) {
    try {
      pushStage(task, 'page-fetch', 'running', `Crawl4AI 抽取：${link.url}`)
      const page = (await crawlWithCrawl4AI(link.url)) || (await fetchText(link.url))
      const title = link.title || page.title
      const text = page.text || link.snippet || ''
      const scores = scoreResource({ query, title, url: page.url || link.url, text })
      sources.push({
        title,
        url: page.url || link.url,
        text: text.slice(0, 1200),
        scores,
        level: scores.level
      })
    } catch (error) {
      pushStage(task, 'page-fetch', 'error', `${link.url}：${error.message || error}`)
    }
  }

  const sortedSources = sources.sort((a, b) => b.scores.overall - a.scores.overall).slice(0, limit)
  pushStage(task, 'resource-score', 'done', `完成 ${sortedSources.length} 个资源评分`)

  const value = {
    success: true,
    taskId: task.id,
    mode: 'cloud-resource-search',
    query,
    elapsedMs: Date.now() - started,
    cacheHit: false,
    stages: task.stages,
    summary: summarizeFromSources(query, sortedSources),
    sources: sortedSources
  }

  task.status = 'done'
  task.result = value
  task.updatedAt = new Date().toISOString()
  cache.set(cacheKey, { cachedAt: Date.now(), value })
  return value
}

async function router(req, res) {
  const started = Date.now()
  metrics.requests++
  metrics.lastRequestAt = new Date().toISOString()

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-XueMate-Client'
    })
    return res.end()
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  try {
    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      return json(res, 200, {
        success: true,
        service: 'xuemate-cloud',
        version: '0.1.0',
        startedAt: metrics.startedAt,
        now: new Date().toISOString()
      })
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/metrics') {
      const avgLatencyMs = metrics.requests ? Math.round(metrics.totalLatencyMs / metrics.requests) : 0
      return json(res, 200, {
        success: true,
        metrics: {
          ...metrics,
          avgLatencyMs,
          cacheSize: cache.size,
          taskCount: tasks.size
        }
      })
    }

    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/api/tasks/')) {
      const id = decodeURIComponent(parsedUrl.pathname.split('/').pop() || '')
      const task = tasks.get(id)
      if (!task) return json(res, 404, { success: false, error: 'task not found' })
      return json(res, 200, { success: true, task })
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/resource/score') {
      metrics.scoreCalls++
      const body = await readBody(req)
      return json(res, 200, { success: true, scores: scoreResource(body) })
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/resource/search') {
      const body = await readBody(req)
      const result = await handleResourceSearch(body)
      return json(res, 200, result)
    }

    return notFound(res)
  } catch (error) {
    return json(res, 500, { success: false, error: error.message || String(error) })
  } finally {
    metrics.totalLatencyMs += Date.now() - started
  }
}

const server = http.createServer(router)
server.listen(PORT, HOST, () => {
  console.log(`[XueMate Cloud] listening on http://${HOST}:${PORT}`)
  console.log('[XueMate Cloud] health: /health, search: POST /api/resource/search')
})
