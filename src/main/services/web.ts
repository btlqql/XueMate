import { BrowserView, BrowserWindow } from 'electron'
import { join } from 'path'

interface PageResult {
  url: string
  title: string
  text: string
  links: { text: string; href: string }[]
}

let activeView: BrowserView | null = null
let hostWindow: BrowserWindow | null = null

// 设置宿主窗口（在 main/index.ts 里调用）
export function setHostWindow(win: BrowserWindow): void {
  hostWindow = win
}

function getOrCreateView(): BrowserView {
  if (activeView && !activeView.webContents.isDestroyed()) {
    return activeView
  }
  activeView = new BrowserView({
    webPreferences: {
      sandbox: false,
      offscreen: true,
      preload: join(__dirname, '../preload/index.js')
    }
  })
  // 忽略 SSL 证书错误
  activeView.webContents.on('certificate-error', (_event, _url, _error, _cert, callback) => {
    callback(true)
  })
  // 设置 User-Agent
  activeView.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )
  return activeView
}

// 显示浏览器，对齐到 Vue 的 fixed 定位面板
export function showBrowserAtHeight(): void {
  if (!hostWindow || hostWindow.isDestroyed()) return
  const view = getOrCreateView()
  hostWindow.addBrowserView(view)

  const { width, height } = hostWindow.getContentBounds()
  const toolbarHeight = 34
  const contentHeight = 260
  const totalHeight = toolbarHeight + contentHeight
  const margin = 16

  const bounds = {
    x: margin,
    y: height - totalHeight - toolbarHeight,
    width: width - margin * 2,
    height: contentHeight
  }
  console.log('[Web] window:', width, height, 'bounds:', bounds)
  view.setBounds(bounds)
}

// 隐藏浏览器
export function hideBrowser(): void {
  if (!hostWindow || hostWindow.isDestroyed()) return
  if (activeView && !activeView.webContents.isDestroyed()) {
    hostWindow.removeBrowserView(activeView)
  }
}

// 打开网页并提取内容
export async function fetchPage(url: string): Promise<PageResult> {
  console.log('[Web] fetchPage:', url)
  const view = getOrCreateView()

  try {
    await view.webContents.loadURL(url)
  } catch (err: any) {
    console.error('[Web] loadURL 失败:', err.message)
  }

  await sleep(2000)

  const data = await view.webContents.executeJavaScript(`
    (function() {
      const clone = document.body.cloneNode(true)
      clone.querySelectorAll('script, style, noscript, svg, nav, footer, header').forEach(el => el.remove())

      const text = clone.innerText
        .replace(/\\n{3,}/g, '\\n\\n')
        .replace(/\\s+/g, ' ')
        .trim()
        .slice(0, 8000)

      const links = Array.from(document.querySelectorAll('a[href]'))
        .filter(a => a.href.startsWith('http') && !a.href.includes('javascript:'))
        .slice(0, 30)
        .map(a => ({
          text: a.innerText.trim().slice(0, 100),
          href: a.href
        }))
        .filter(l => l.text.length > 0)

      return {
        url: location.href,
        title: document.title,
        text,
        links
      }
    })()
  `)

  return data
}

// 截图
export async function captureScreenshot(): Promise<string> {
  const view = getOrCreateView()
  const image = await view.webContents.capturePage()
  return image.toPNG().toString('base64')
}

// 搜索并抓取结果页
export async function searchAndFetch(query: string): Promise<PageResult[]> {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  const result = await fetchPage(searchUrl)

  const resultLinks = result.links.filter(l =>
    l.href.startsWith('http') &&
    !l.href.includes('bing.com') &&
    !l.href.includes('microsoft.com') &&
    !l.href.includes('go.microsoft.com') &&
    l.text.length > 5
  ).slice(0, 3)

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
  hideBrowser()
  if (activeView && !activeView.webContents.isDestroyed()) {
    activeView.webContents.close()
  }
  activeView = null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
