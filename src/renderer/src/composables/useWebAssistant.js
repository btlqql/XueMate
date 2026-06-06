import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

export const controlSamples = [
  '帮我搜索三年级分数加法练习题，找到一个合适的网页',
  '打开必应，搜索小学生英语单词记忆方法',
  '帮我找一个适合五年级的科学小实验网页'
]

export const stateLabel = {
  idle: '还没开始',
  opening: '打开网页',
  looking: '看网页',
  acting: '操作中',
  done: '完成',
  error: '出错',
  stopped: '已停止'
}

export function useWebAssistant(activeMode) {
  const goalInput = ref('')
  const running = ref(false)
  const state = ref('idle')
  const steps = ref([])
  const screenshot = ref('')
  const screenshotMime = ref('image/png')
  const currentUrl = ref('')
  const currentTitle = ref('')
  const error = ref('')
  const answer = ref('')
  const browserBoxRef = ref(null)
  const domElementCount = ref(0)
  const domCandidates = ref([])

  let removeUpdateListener = null
  let boundsFrame = 0
  let browserResizeObserver = null
  let boundsTimer = 0

  const screenshotSrc = computed(() =>
    screenshot.value ? `data:${screenshotMime.value};base64,${screenshot.value}` : ''
  )
  const friendlyError = computed(() => toFriendlyError(error.value))

  function cleanup() {
    if (removeUpdateListener) {
      removeUpdateListener()
      removeUpdateListener = null
    }
  }

  function resetControlState() {
    state.value = 'idle'
    steps.value = []
    screenshot.value = ''
    screenshotMime.value = 'image/png'
    currentUrl.value = ''
    currentTitle.value = ''
    error.value = ''
    answer.value = ''
    domElementCount.value = 0
    domCandidates.value = []
  }

  function loadControlSample(text) {
    goalInput.value = text
  }

  async function startAssistant() {
    if (!goalInput.value.trim() || running.value) return

    cleanup()
    running.value = true
    resetControlState()
    state.value = 'opening'

    await focusLiveBrowserBox()

    removeUpdateListener = window.webAssistant.onUpdate((data) => {
      state.value = data.state || state.value
      steps.value = data.steps || steps.value
      if (data.screenshot) screenshot.value = data.screenshot
      if (data.screenshotMime) screenshotMime.value = data.screenshotMime
      if (data.url !== undefined) currentUrl.value = data.url || ''
      if (data.title !== undefined) currentTitle.value = data.title || ''
      if (data.error) error.value = data.error
      if (data.answer) answer.value = data.answer
      if (data.domElementCount !== undefined) domElementCount.value = data.domElementCount || 0
      if (data.domCandidates !== undefined) domCandidates.value = data.domCandidates || []
      scheduleLiveBrowserBoundsSync()
    })

    try {
      const result = await window.webAssistant.start(goalInput.value.trim())
      if (result.success) {
        state.value = 'done'
        if (result.steps) steps.value = result.steps
        answer.value = result.answer || answer.value || '完成了'
      } else if (result.error !== '用户停止') {
        if (result.steps) steps.value = result.steps
        error.value = result.error || '执行失败'
        state.value = 'error'
      }
    } catch (e) {
      error.value = '启动失败：' + (e.message || '未知错误')
      state.value = 'error'
    } finally {
      running.value = false
      cleanup()
    }
  }

  async function stopAssistant() {
    await window.webAssistant.stop()
    await window.webAssistant.setLiveBounds(null)
    running.value = false
    state.value = 'stopped'
  }

  function clearControl() {
    if (running.value) return
    window.webAssistant.setLiveBounds(null)
    goalInput.value = ''
    resetControlState()
  }

  function getLiveBrowserBounds() {
    const el = browserBoxRef.value
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const left = Math.max(0, rect.left)
    const top = Math.max(0, rect.top)
    const right = Math.min(window.innerWidth, rect.right)
    const bottom = Math.min(window.innerHeight, rect.bottom)
    const width = right - left
    const height = bottom - top
    if (width < 120 || height < 100) return null
    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(width),
      height: Math.round(height)
    }
  }

  function setBrowserBoxElement(el) {
    browserBoxRef.value = el
    if (!el) {
      teardownBrowserBoxObserver()
      return
    }
    setupBrowserBoxObserver()
    scheduleLiveBrowserBoundsSync()
  }

  async function syncLiveBrowserBounds() {
    if (activeMode.value !== 'control' || !shouldShowLiveBrowser()) {
      await window.webAssistant.setLiveBounds(null)
      return
    }
    const bounds = getLiveBrowserBounds()
    await window.webAssistant.setLiveBounds(bounds)
  }

  function shouldShowLiveBrowser() {
    if (running.value) return true
    return (
      ['opening', 'looking', 'acting', 'done', 'error'].includes(state.value) &&
      Boolean(currentUrl.value || screenshot.value)
    )
  }

  async function focusLiveBrowserBox() {
    await nextTick()
    await sleep(80)
    await syncLiveBrowserBounds()
  }

  function scheduleLiveBrowserBoundsSync() {
    if (boundsFrame) return
    boundsFrame = requestAnimationFrame(() => {
      boundsFrame = 0
      syncLiveBrowserBounds()
    })
  }

  function setupBrowserBoxObserver() {
    teardownBrowserBoxObserver()
    const el = browserBoxRef.value
    if (!el || typeof ResizeObserver === 'undefined') return
    browserResizeObserver = new ResizeObserver(() => scheduleLiveBrowserBoundsSync())
    browserResizeObserver.observe(el)
  }

  function teardownBrowserBoxObserver() {
    if (browserResizeObserver) {
      browserResizeObserver.disconnect()
      browserResizeObserver = null
    }
  }

  function startBoundsHeartbeat() {
    stopBoundsHeartbeat()
    boundsTimer = window.setInterval(scheduleLiveBrowserBoundsSync, 700)
  }

  function stopBoundsHeartbeat() {
    if (boundsTimer) {
      window.clearInterval(boundsTimer)
      boundsTimer = 0
    }
  }

  onMounted(() => {
    window.addEventListener('resize', scheduleLiveBrowserBoundsSync)
    window.addEventListener('scroll', scheduleLiveBrowserBoundsSync, true)
  })

  watch(activeMode, async (mode) => {
    if (mode === 'control') {
      await nextTick()
      setupBrowserBoxObserver()
      startBoundsHeartbeat()
      scheduleLiveBrowserBoundsSync()
    } else {
      teardownBrowserBoxObserver()
      stopBoundsHeartbeat()
      window.webAssistant.setLiveBounds(null)
    }
  })

  onUnmounted(() => {
    window.removeEventListener('resize', scheduleLiveBrowserBoundsSync)
    window.removeEventListener('scroll', scheduleLiveBrowserBoundsSync, true)
    if (boundsFrame) {
      cancelAnimationFrame(boundsFrame)
      boundsFrame = 0
    }
    teardownBrowserBoxObserver()
    stopBoundsHeartbeat()
    cleanup()
    window.webAssistant.setLiveBounds(null)
  })

  return {
    goalInput,
    running,
    state,
    steps,
    screenshotSrc,
    currentUrl,
    currentTitle,
    friendlyError,
    error,
    answer,
    setBrowserBoxElement,
    domElementCount,
    domCandidates,
    loadControlSample,
    startAssistant,
    stopAssistant,
    clearControl
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toFriendlyError(message) {
  if (!message) return ''
  if (message.includes('VISION_API_KEY') || message.includes('GEMINI_API_KEY')) {
    return '网页查看功能还没配置好，需要先补充 .env 里的相关配置。'
  }
  if (/503|UNAVAILABLE|high demand|太忙|temporar|busy|overload/i.test(message)) {
    return '网页查看暂时有点忙，稍后再点“开始查看”试一次。'
  }
  if (/429|quota|rate limit|额度|限流|exceeded/i.test(message)) {
    return '网页查看次数暂时受限，稍后再试，或检查一下 .env 配置。'
  }
  if (/net::ERR_|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|网页打开超时|网络连接/i.test(message)) {
    return '网页暂时打不开，可能是网络不稳定。稍后再点“开始查看”即可重试。'
  }
  return message.length > 160 ? message.slice(0, 160) + '…' : message
}
