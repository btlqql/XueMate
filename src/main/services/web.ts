import { BrowserView, BrowserWindow, net } from 'electron'

interface PageResult {
  url: string
  title: string
  text: string
  links: { text: string; href: string }[]
}

export type BrowserAction =
  | { type: 'click'; x?: number; y?: number; elementId?: string }
  | { type: 'type'; text: string; elementId?: string; x?: number; y?: number }
  | { type: 'scroll'; x?: number; y?: number; dy: number; elementId?: string }
  | { type: 'key'; key: string }
  | { type: 'wait'; ms?: number }
  | { type: 'navigate'; url: string }
  | { type: 'done'; answer?: string }

export interface BrowserState {
  screenshot: string
  screenshotMime: string
  width: number
  height: number
  url: string
  title: string
  elements: InteractiveElement[]
}

export interface InteractiveElement {
  id: string
  tag: string
  role: string
  text: string
  placeholder: string
  ariaLabel: string
  title: string
  href: string
  inputType: string
  value: string
  rect: {
    x: number
    y: number
    width: number
    height: number
    centerX: number
    centerY: number
  }
  visible: boolean
  disabled: boolean
  editable: boolean
  clickable: boolean
}

export interface LiveBrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

let browserWindow: BrowserWindow | null = null
let browserView: BrowserView | null = null
let hostWindow: BrowserWindow | null = null
let liveBounds: LiveBrowserBounds | null = null
let liveMode = false
let viewportWidth = 1000
let viewportHeight = 650
const PACE = {
  beforeAction: 450,
  afterAction: 700,
  clickHover: 380,
  clickDown: 120,
  typeChar: 55,
  typeChunkPause: 180,
  scrollChunk: 240,
  navigateSettle: 1200
}

// 设置宿主窗口（在 main/index.ts 里调用）
export function setHostWindow(win: BrowserWindow): void {
  hostWindow = win
}

function getOrCreateBrowserWindow(): BrowserWindow {
  if (browserWindow && !browserWindow.isDestroyed()) {
    return browserWindow
  }

  browserWindow = new BrowserWindow({
    show: false,
    frame: false,
    useContentSize: true,
    paintWhenInitiallyHidden: true,
    width: viewportWidth,
    height: viewportHeight,
    parent: hostWindow || undefined,
    webPreferences: {
      sandbox: false,
      backgroundThrottling: false
    }
  })

  browserWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )
  installNavigationGuards(browserWindow.webContents)

  browserWindow.on('closed', () => {
    browserWindow = null
  })

  return browserWindow
}

function getOrCreateBrowserView(): BrowserView {
  if (browserView && !browserView.webContents.isDestroyed()) {
    return browserView
  }

  browserView = new BrowserView({
    webPreferences: {
      sandbox: false,
      backgroundThrottling: false
    }
  })

  browserView.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )
  installNavigationGuards(browserView.webContents)

  return browserView
}

// 前端把“网页截图/实时网页”盒子的坐标传进来，BrowserView 会盖在这个区域上。
export function setLiveBrowserBounds(bounds: LiveBrowserBounds | null): void {
  if (!bounds || bounds.width < 120 || bounds.height < 100) {
    liveBounds = null
    detachLiveView()
    return
  }

  const nextBounds = sanitizeLiveBounds(bounds)
  if (liveBounds && isSameBounds(liveBounds, nextBounds)) {
    return
  }

  liveBounds = nextBounds
  if (liveMode) {
    attachAndLayoutLiveView()
  }
}

// 兼容旧调用。
export function showBrowserAtHeight(_contentHeight = 260): void {
  prepareHiddenBrowserViewport()
}

export function showBrowserInPanel(): void {
  prepareHiddenBrowserViewport()
}

export function prepareHiddenBrowserViewport(width = 1000, height = 650): void {
  if (liveBounds && hostWindow && !hostWindow.isDestroyed()) {
    liveMode = true
    closeHiddenWindow()
    attachAndLayoutLiveView()
    console.log('[Web] live BrowserView viewport:', liveBounds)
    return
  }

  liveMode = false
  detachLiveView()
  viewportWidth = width
  viewportHeight = height
  const win = getOrCreateBrowserWindow()
  win.setContentSize(width, height, false)
  win.hide()
  console.log('[Web] hidden BrowserWindow viewport:', { width, height })
}

// 隐藏浏览器
export function hideBrowser(): void {
  detachLiveView()
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.hide()
  }
}

export async function openBrowserUrl(url: string, throwOnFailure = false): Promise<void> {
  const webContents = getActiveWebContents()
  const normalized = normalizeUrl(url)

  let lastError: any = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await webContents.loadURL(normalized)
      await waitForPageSettle(webContents, 800)
      return
    } catch (err: any) {
      lastError = err
      console.error(`[Web] openBrowserUrl 失败(${attempt}/2):`, err.message)
      if (!isTransientLoadError(err) || attempt === 2) break
      await sleep(900)
    }
  }

  await waitForPageSettle(webContents, 300)
  if (throwOnFailure) {
    throw new Error(formatLoadError(lastError, normalized))
  }
}

// 打开网页并提取内容
export async function fetchPage(url: string): Promise<PageResult> {
  console.log('[Web] fetchPage:', url)
  const win = getOrCreateBrowserWindow()
  const normalizedUrl = normalizeUrl(url)

  try {
    await win.loadURL(normalizedUrl)
    await waitForPageSettle(win.webContents, 800)
  } catch (err: any) {
    console.error('[Web] loadURL 失败:', err.message)
  }

  await sleep(600)

  try {
    const data = await extractPageFromRenderer(win.webContents)
    // 每次提取成功后清理缓存，防止内存累积；不要在 executeJavaScript 前清。
    clearSessionCacheSoon(win.webContents)
    return data
  } catch (err: any) {
    console.error('[Web] renderer 提取网页失败，改用 net.fetch 兜底:', err.message)
    clearSessionCacheSoon(win.webContents)
    return fetchPageWithNet(normalizedUrl)
  }
}

async function extractPageFromRenderer(webContents: Electron.WebContents): Promise<PageResult> {
  const data = await webContents.executeJavaScript(
    `
    (() => {
      function clean(value, max = 8000) {
        return String(value || '')
          .replace(/\\n{3,}/g, '\\n\\n')
          .replace(/\\s+/g, ' ')
          .trim()
          .slice(0, max)
      }

      try {
        const root = document.body || document.documentElement
        if (!root) {
          return {
            url: location.href,
            title: document.title || '',
            text: '',
            links: []
          }
        }

        const clone = root.cloneNode(true)
        if (clone.querySelectorAll) {
          clone
            .querySelectorAll('script, style, noscript, svg, nav, footer, header, iframe')
            .forEach((el) => el.remove())
        }

        const text = clean(clone.innerText || clone.textContent || '')
        const links = []
        document.querySelectorAll('a[href]').forEach((a) => {
          try {
            const href = String(a.href || '')
            if (!href.startsWith('http') || href.startsWith('javascript:')) return
            const label = clean(a.innerText || a.textContent || a.getAttribute('aria-label') || href, 100)
            if (!label) return
            links.push({ text: label, href })
          } catch {
            // 跳过单个异常链接，不能让整页提取失败
          }
        })

        return {
          url: location.href,
          title: document.title || '',
          text,
          links: links.slice(0, 30)
        }
      } catch (error) {
        return {
          url: location.href,
          title: document.title || '',
          text: '',
          links: [],
          extractionError: String(error && error.message ? error.message : error)
        }
      }
    })()
  `,
    true
  )

  if (!data || typeof data !== 'object') {
    throw new Error('网页提取结果为空')
  }

  return {
    url: String(data.url || webContents.getURL()),
    title: String(data.title || webContents.getTitle()),
    text: String(data.text || ''),
    links: Array.isArray(data.links)
      ? data.links
          .map((link: any) => ({
            text: String(link?.text || '').trim().slice(0, 100),
            href: String(link?.href || '').trim()
          }))
          .filter((link: { text: string; href: string }) => link.text && /^https?:\/\//i.test(link.href))
          .slice(0, 30)
      : []
  }
}

async function fetchPageWithNet(url: string): Promise<PageResult> {
  const normalizedUrl = normalizeUrl(url)
  const response = await net.fetch(normalizedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
    }
  })

  if (!response.ok) {
    throw new Error(`网页请求失败 (${response.status})`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!/text|html|xml|json/i.test(contentType)) {
    return {
      url: response.url || normalizedUrl,
      title: '网页',
      text: `这个网页不是普通文字页面（${contentType || '未知类型'}），暂时无法直接提取。`,
      links: []
    }
  }

  const html = await response.text()
  return extractPageFromHtml(html, response.url || normalizedUrl)
}

function extractPageFromHtml(html: string, pageUrl: string): PageResult {
  const withoutNoisyBlocks = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(nav|footer|header|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')

  const title = decodeHtmlEntity(
    (withoutNoisyBlocks.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()
  )

  const links: { text: string; href: string }[] = []
  const anchorRegex = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
  let anchorMatch: RegExpExecArray | null
  while ((anchorMatch = anchorRegex.exec(withoutNoisyBlocks)) && links.length < 30) {
    const rawHref = decodeHtmlEntity(anchorMatch[2]).trim()
    const href = resolveHref(rawHref, pageUrl)
    if (!href || !/^https?:\/\//i.test(href)) continue
    const text = htmlToText(anchorMatch[3], 100)
    if (!text || /^(http|www\.)/i.test(text)) continue
    links.push({ text, href })
  }

  const text = htmlToText(withoutNoisyBlocks, 8000)

  return {
    url: pageUrl,
    title: title || '网页',
    text,
    links
  }
}

function htmlToText(html: string, max: number): string {
  return decodeHtmlEntity(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function decodeHtmlEntity(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
}

function resolveHref(href: string, pageUrl: string): string {
  if (!href || href.startsWith('javascript:') || href.startsWith('#')) return ''
  try {
    return new URL(href, pageUrl).href
  } catch {
    return ''
  }
}

function clearSessionCacheSoon(webContents: Electron.WebContents): void {
  setTimeout(() => {
    webContents.session.clearCache().catch(() => {
      /* ignore */
    })
  }, 1000)
}

// 截图
export async function captureScreenshot(): Promise<string> {
  const state = await captureBrowserState()
  return state.screenshot
}

export async function captureBrowserState(): Promise<BrowserState> {
  const webContents = getActiveWebContents()
  await waitForPageSettle(webContents, 150)
  const [image, elements] = await Promise.all([
    webContents.capturePage(),
    extractInteractiveElements(webContents)
  ])
  const normalizedImage = image.resize({ width: viewportWidth, height: viewportHeight, quality: 'good' })
  const size = normalizedImage.getSize()
  return {
    screenshot: normalizedImage.toJPEG(72).toString('base64'),
    screenshotMime: 'image/jpeg',
    width: size.width,
    height: size.height,
    url: webContents.getURL(),
    title: webContents.getTitle(),
    elements
  }
}

export async function performBrowserAction(
  action: BrowserAction,
  elements: InteractiveElement[] = []
): Promise<void> {
  const webContents = getActiveWebContents()

  switch (action.type) {
    case 'click': {
      const { x, y } = resolveActionPoint(action, elements)
      await sleep(PACE.beforeAction)
      webContents.sendInputEvent({ type: 'mouseMove', x, y })
      await sleep(PACE.clickHover)
      webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      await sleep(PACE.clickDown)
      webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
      await waitForPageSettle(webContents, PACE.afterAction)
      return
    }
    case 'type': {
      if (action.text) {
        if (action.elementId || (action.x !== undefined && action.y !== undefined)) {
          const { x, y } = resolveActionPoint(action, elements)
          await clickPoint(webContents, x, y)
        }
        await sleep(PACE.beforeAction)
        await typeSlowly(webContents, action.text)
      }
      await sleep(PACE.afterAction)
      return
    }
    case 'scroll': {
      const { x, y } =
        action.elementId || (action.x !== undefined && action.y !== undefined)
          ? resolveActionPoint(action, elements)
          : toViewPoint(500, 500)
      await sleep(PACE.beforeAction)
      await scrollSlowly(webContents, x, y, normalizeScrollDelta(action.dy))
      await sleep(PACE.afterAction)
      return
    }
    case 'key': {
      const keyCode = normalizeKey(action.key)
      await sleep(PACE.beforeAction)
      webContents.sendInputEvent({ type: 'keyDown', keyCode })
      await sleep(120)
      webContents.sendInputEvent({ type: 'keyUp', keyCode })
      await sleep(PACE.afterAction)
      return
    }
    case 'wait': {
      await sleep(Math.min(Math.max(action.ms ?? 1000, 300), 5000))
      return
    }
    case 'navigate': {
      await openBrowserUrl(action.url, true)
      await sleep(PACE.navigateSettle)
      return
    }
    case 'done':
      return
  }
}

// 搜索并抓取结果页
export async function searchAndFetch(query: string): Promise<PageResult[]> {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  const result = await fetchPage(searchUrl)

  const resultLinks = result.links
    .filter(
      (l) =>
        l.href.startsWith('http') &&
        !l.href.includes('bing.com') &&
        !l.href.includes('microsoft.com') &&
        !l.href.includes('go.microsoft.com') &&
        l.text.length > 5
    )
    .slice(0, 3)

  const pages: PageResult[] = [result]

  for (const link of resultLinks) {
    try {
      const page = await fetchPage(link.href)
      pages.push(page)
    } catch {
      // 跳过
    }
  }

  return pages
}

// 清理
export function destroyWebView(): void {
  detachLiveView()
  if (browserView && !browserView.webContents.isDestroyed()) {
    browserView.webContents.close()
  }
  browserView = null
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.close()
  }
  browserWindow = null
  liveMode = false
}

export function finishBrowserRun(): void {
  if (liveMode && browserView && !browserView.webContents.isDestroyed()) {
    return
  }
  destroyWebView()
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`
  return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`
}

function toViewPoint(normX: number, normY: number): { x: number; y: number } {
  const x = Math.round((clamp(normX, 0, 1000) / 1000) * viewportWidth)
  const y = Math.round((clamp(normY, 0, 1000) / 1000) * viewportHeight)
  return { x, y }
}

function resolveActionPoint(
  action: { x?: number; y?: number; elementId?: string },
  elements: InteractiveElement[]
): { x: number; y: number } {
  if (action.elementId) {
    const element = elements.find((item) => item.id === action.elementId)
    if (element) {
      return {
        x: Math.round(clamp(element.rect.centerX, 0, viewportWidth)),
        y: Math.round(clamp(element.rect.centerY, 0, viewportHeight))
      }
    }
  }

  return toViewPoint(action.x ?? 500, action.y ?? 500)
}

function normalizeScrollDelta(dy: number): number {
  if (!Number.isFinite(dy)) return 500
  // 模型输出使用 -1000~1000 的相对强度；Electron 直接接收 wheel delta。
  return Math.round(clamp(dy, -1000, 1000))
}

function normalizeKey(key: string): string {
  const normalized = (key || '').trim()
  const keyMap: Record<string, string> = {
    enter: 'Enter',
    return: 'Enter',
    esc: 'Escape',
    escape: 'Escape',
    backspace: 'Backspace',
    tab: 'Tab',
    space: 'Space',
    arrowup: 'Up',
    arrowdown: 'Down',
    arrowleft: 'Left',
    arrowright: 'Right'
  }
  return keyMap[normalized.toLowerCase()] || normalized || 'Enter'
}

function installNavigationGuards(webContents: Electron.WebContents): void {
  // 很多站点（微博、登录页、广告页）会用 target=_blank/window.open。
  // 默认会创建新的 Electron guest window，看起来像“跳出另一个进程”。
  // 这里统一拦截，让 http/https 在当前内置浏览器里打开，非网页协议直接拦下。
  webContents.setWindowOpenHandler(({ url }) => {
    void openPopupUrlInSameView(webContents, url)
    return { action: 'deny' }
  })

  webContents.on('will-navigate', (event, url) => {
    if (!isWebUrl(url)) {
      event.preventDefault()
      console.warn('[Web] blocked external protocol:', url)
    }
  })
}

async function openPopupUrlInSameView(
  webContents: Electron.WebContents,
  url: string
): Promise<void> {
  if (webContents.isDestroyed()) return
  if (!isWebUrl(url)) {
    console.warn('[Web] blocked popup external protocol:', url)
    return
  }

  try {
    await webContents.loadURL(url)
  } catch (error: any) {
    console.error('[Web] popup 在当前浏览器打开失败:', error.message)
  }
}

function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

async function extractInteractiveElements(
  webContents: Electron.WebContents
): Promise<InteractiveElement[]> {
  try {
    const raw = await webContents.executeJavaScript(
      `
      (() => {
        const selectors = [
          'a[href]',
          'button',
          'input',
          'textarea',
          'select',
          '[role]',
          '[contenteditable="true"]',
          '[tabindex]',
          'summary',
          'label'
        ].join(',')

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1
        const seen = new Set()
        const candidates = Array.from(document.querySelectorAll(selectors))

        function clean(value, max = 120) {
          return String(value || '')
            .replace(/\\s+/g, ' ')
            .trim()
            .slice(0, max)
        }

        function isVisible(el, rect, style) {
          if (!rect || rect.width <= 0 || rect.height <= 0) return false
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false
          }
          if (rect.bottom < 0 || rect.right < 0 || rect.top > viewportHeight || rect.left > viewportWidth) {
            return false
          }
          return true
        }

        function inferRole(el) {
          const explicit = el.getAttribute('role')
          if (explicit) return explicit
          const tag = el.tagName.toLowerCase()
          if (tag === 'a') return 'link'
          if (tag === 'button') return 'button'
          if (tag === 'textarea') return 'textbox'
          if (tag === 'select') return 'combobox'
          if (tag === 'summary') return 'button'
          if (tag === 'input') {
            const type = (el.getAttribute('type') || 'text').toLowerCase()
            if (['button', 'submit', 'reset'].includes(type)) return 'button'
            if (['checkbox', 'radio', 'range', 'date', 'file'].includes(type)) return type
            if (['search'].includes(type)) return 'searchbox'
            return 'textbox'
          }
          if (el.isContentEditable) return 'textbox'
          return 'generic'
        }

        function elementText(el) {
          const aria = clean(el.getAttribute('aria-label'))
          const labelledBy = clean(
            (el.getAttribute('aria-labelledby') || '')
              .split(/\\s+/)
              .map((id) => document.getElementById(id)?.innerText || '')
              .join(' ')
          )
          const alt = clean(el.getAttribute('alt'))
          const value = ['button', 'submit', 'reset'].includes((el.getAttribute('type') || '').toLowerCase())
            ? clean(el.getAttribute('value'))
            : ''
          const inner = clean(el.innerText || el.textContent)
          return aria || labelledBy || alt || value || inner
        }

        return candidates
          .map((el) => {
            if (!(el instanceof HTMLElement)) return null
            if (seen.has(el)) return null
            seen.add(el)

            const rect = el.getBoundingClientRect()
            const style = window.getComputedStyle(el)
            const tag = el.tagName.toLowerCase()
            const role = inferRole(el)
            const disabled =
              el.hasAttribute('disabled') ||
              el.getAttribute('aria-disabled') === 'true' ||
              style.pointerEvents === 'none'
            const editable =
              el.isContentEditable ||
              tag === 'textarea' ||
              (tag === 'input' &&
                !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden'].includes(
                  (el.getAttribute('type') || 'text').toLowerCase()
                ))
            const clickable =
              tag === 'a' ||
              tag === 'button' ||
              role === 'button' ||
              role === 'link' ||
              el.hasAttribute('onclick') ||
              el.tabIndex >= 0 ||
              editable

            const visible = isVisible(el, rect, style)
            if (!visible && !editable && !clickable) return null

            const clippedLeft = Math.max(0, rect.left)
            const clippedTop = Math.max(0, rect.top)
            const clippedRight = Math.min(viewportWidth, rect.right)
            const clippedBottom = Math.min(viewportHeight, rect.bottom)
            const width = Math.max(0, clippedRight - clippedLeft)
            const height = Math.max(0, clippedBottom - clippedTop)
            if (width < 2 || height < 2) return null

            return {
              tag,
              role,
              text: elementText(el),
              placeholder: clean(el.getAttribute('placeholder')),
              ariaLabel: clean(el.getAttribute('aria-label')),
              title: clean(el.getAttribute('title')),
              href: clean(el instanceof HTMLAnchorElement ? el.href : ''),
              inputType: clean(el.getAttribute('type')),
              value: editable ? clean(el.value, 80) : '',
              rect: {
                x: clippedLeft,
                y: clippedTop,
                width,
                height,
                centerX: clippedLeft + width / 2,
                centerY: clippedTop + height / 2
              },
              visible,
              disabled,
              editable,
              clickable
            }
          })
          .filter(Boolean)
          .filter((item) =>
            item.clickable ||
            item.editable ||
            item.text ||
            item.placeholder ||
            item.ariaLabel ||
            item.title
          )
          .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
          .slice(0, 80)
          .map((item, index) => ({ id: 'e' + (index + 1), ...item }))
      })()
      `,
      true
    )

    return Array.isArray(raw) ? raw : []
  } catch (error: any) {
    console.warn('[Web] DOM 元素抽取失败:', error.message)
    return []
  }
}

async function typeSlowly(webContents: Electron.WebContents, text: string): Promise<void> {
  const chars = Array.from(text)
  for (let i = 0; i < chars.length; i++) {
    await webContents.insertText(chars[i])
    await sleep(PACE.typeChar)
    if ((i + 1) % 12 === 0) {
      await sleep(PACE.typeChunkPause)
    }
  }
}

async function clickPoint(webContents: Electron.WebContents, x: number, y: number): Promise<void> {
  await sleep(PACE.beforeAction)
  webContents.sendInputEvent({ type: 'mouseMove', x, y })
  await sleep(PACE.clickHover)
  webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  await sleep(PACE.clickDown)
  webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  await sleep(PACE.afterAction)
}

async function scrollSlowly(
  webContents: Electron.WebContents,
  x: number,
  y: number,
  deltaY: number
): Promise<void> {
  const chunks = Math.max(3, Math.min(7, Math.ceil(Math.abs(deltaY) / 180)))
  const perChunk = Math.round(deltaY / chunks)
  for (let i = 0; i < chunks; i++) {
    webContents.sendInputEvent({
      type: 'mouseWheel',
      x,
      y,
      deltaY: perChunk
    })
    await sleep(PACE.scrollChunk)
  }
}

function getActiveWebContents(): Electron.WebContents {
  if (liveMode) {
    attachAndLayoutLiveView()
    return getOrCreateBrowserView().webContents
  }
  return getOrCreateBrowserWindow().webContents
}

function attachAndLayoutLiveView(): void {
  if (!hostWindow || hostWindow.isDestroyed() || !liveBounds) return
  const view = getOrCreateBrowserView()
  if (!hostWindow.getBrowserViews().includes(view)) {
    hostWindow.addBrowserView(view)
  }

  const safeBounds = sanitizeLiveBounds(liveBounds)
  liveBounds = safeBounds
  viewportWidth = safeBounds.width
  viewportHeight = safeBounds.height
  view.setBounds(safeBounds)
  view.setAutoResize({ width: false, height: false })
}

function detachLiveView(): void {
  if (!hostWindow || hostWindow.isDestroyed() || !browserView) return
  try {
    if (hostWindow.getBrowserViews().includes(browserView)) {
      hostWindow.removeBrowserView(browserView)
    }
  } catch {
    /* ignore */
  }
}

function closeHiddenWindow(): void {
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.close()
  }
  browserWindow = null
}

function sanitizeLiveBounds(bounds: LiveBrowserBounds): LiveBrowserBounds {
  const content = hostWindow?.getContentBounds()
  const maxWidth = content?.width || 1200
  const maxHeight = content?.height || 800
  const x = Math.max(0, Math.round(bounds.x))
  const y = Math.max(0, Math.round(bounds.y))
  const width = Math.max(120, Math.min(Math.round(bounds.width), maxWidth - x))
  const height = Math.max(100, Math.min(Math.round(bounds.height), maxHeight - y))
  return { x, y, width, height }
}

function isSameBounds(a: LiveBrowserBounds, b: LiveBrowserBounds): boolean {
  const tolerance = 2
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  )
}

function isTransientLoadError(error: any): boolean {
  return /ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_CONNECTION|ERR_INTERNET|ERR_PROXY/i.test(
    String(error?.message || '')
  )
}

function formatLoadError(error: any, url: string): string {
  const message = String(error?.message || '')
  if (/ERR_TIMED_OUT/i.test(message)) {
    return `网页打开超时：${url}`
  }
  if (/ERR_NETWORK_CHANGED/i.test(message)) {
    return `网络连接刚刚变化，网页没有打开成功：${url}`
  }
  if (/ERR_INTERNET|ERR_CONNECTION|ERR_PROXY/i.test(message)) {
    return `网络连接不稳定，网页没有打开成功：${url}`
  }
  return message || `网页没有打开成功：${url}`
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

async function waitForPageSettle(
  webContents: Electron.WebContents,
  extraDelay = 300
): Promise<void> {
  const startedAt = Date.now()
  while (!webContents.isDestroyed() && webContents.isLoading() && Date.now() - startedAt < 10000) {
    await sleep(100)
  }
  if (extraDelay > 0) {
    await sleep(extraDelay)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
