import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

export const controlSamples = [
  '帮我搜索三年级分数加法练习题，找到一个合适的网页',
  '打开必应，搜索小学生英语单词记忆方法',
  '帮我找一个适合五年级的科学探究网页'
]

export const stateLabel = {
  idle: '还没开始',
  opening: '打开网页',
  looking: '浏览页面',
  observing: '观察网页',
  thinking: '思考下一步',
  acting: '操作中',
  settling: '等待页面',
  cancelling: '正在停止',
  done: '完成',
  error: '出错',
  stopped: '已停止',
  cancelled: '已停止',
  timed_out: '超时',
  blocked: '暂不能执行'
}

export function useWebAssistant(activeMode) {
  const browserPreview = ref(
    Boolean(window.__XUEMATE_BROWSER_PREVIEW__ || window.webAssistant?.isPreview)
  )
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
  const activeRunId = ref('')
  const lastSeq = ref(0)
  const stepIndex = ref(0)
  const maxSteps = ref(15)
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
    activeRunId.value = ''
    lastSeq.value = 0
    stepIndex.value = 0
    maxSteps.value = 15
    domElementCount.value = 0
    domCandidates.value = []
  }

  function loadControlSample(text) {
    goalInput.value = text
  }

  async function startAssistant() {
    if (!goalInput.value.trim() || running.value) return
    if (browserPreview.value) {
      state.value = 'blocked'
      error.value = '浏览器预览不能直接操作内置网页，请在 XueMate 桌面软件窗口里使用。'
      return
    }
    if (!window.webAssistant?.start || !window.webAssistant?.onUpdate) {
      error.value = '网页小助手没有加载成功，请重新启动软件。'
      state.value = 'error'
      return
    }

    cleanup()
    running.value = true
    resetControlState()
    state.value = 'opening'

    const browserReady = await focusLiveBrowserBox()
    if (!browserReady) {
      running.value = false
      state.value = 'blocked'
      error.value = '实时网页区域还没准备好，请切到“网页助手（高级）”页并等待页面布局稳定后再开始。'
      return
    }

    removeUpdateListener = window.webAssistant.onUpdate((data) => {
      if (data.runId) {
        if (!activeRunId.value) activeRunId.value = String(data.runId)
        if (String(data.runId) !== activeRunId.value) return
      }
      const seq = Number(data.seq || 0)
      if (seq && seq <= lastSeq.value) return
      if (seq) lastSeq.value = seq

      state.value = data.state || state.value
      steps.value = data.steps || steps.value
      if (data.step !== undefined) stepIndex.value = Number(data.step) || 0
      if (data.maxSteps !== undefined) maxSteps.value = Number(data.maxSteps) || maxSteps.value
      if (data.screenshot) screenshot.value = data.screenshot
      if (data.screenshotMime) screenshotMime.value = data.screenshotMime
      if (data.url !== undefined) currentUrl.value = data.url || ''
      if (data.title !== undefined) currentTitle.value = data.title || ''
      if (data.error !== undefined) error.value = data.error || ''
      if (data.answer) answer.value = data.answer
      if (data.domElementCount !== undefined) domElementCount.value = data.domElementCount || 0
      if (data.domCandidates !== undefined) domCandidates.value = data.domCandidates || []
      if (data.terminal) {
        running.value = false
        cleanup()
      }
      scheduleLiveBrowserBoundsSync()
    })

    let keepUpdateListener = false
    try {
      const result = await window.webAssistant.start(goalInput.value.trim())
      if (result.runId && !activeRunId.value) activeRunId.value = String(result.runId)
      if (result.runId && activeRunId.value && result.runId !== activeRunId.value) return
      if (result.success) {
        state.value = 'done'
        if (result.steps) steps.value = result.steps
        answer.value = result.answer || answer.value || '完成了'
      } else if (result.error !== '用户停止') {
        if (result.steps) steps.value = result.steps
        if (isBusyError(result.error)) {
          error.value = ''
          state.value = /停止/.test(result.error || '') ? 'cancelling' : 'acting'
          keepUpdateListener = Boolean(result.runId)
        } else {
          error.value = result.error || '执行失败'
          state.value = 'error'
        }
      } else {
        if (result.steps) steps.value = result.steps
        state.value = state.value === 'cancelled' ? state.value : 'cancelled'
      }
    } catch (e) {
      error.value = '启动失败：' + (e.message || '未知错误')
      state.value = 'error'
    } finally {
      if (!keepUpdateListener) {
        running.value = false
        cleanup()
      }
    }
  }

  async function stopAssistant() {
    if (!running.value) return
    state.value = 'cancelling'
    try {
      await window.webAssistant.stop(activeRunId.value || undefined)
    } catch (e) {
      error.value = '停止失败：' + (e.message || '未知错误')
      state.value = 'error'
      running.value = false
    }
  }

  function clearControl() {
    if (running.value) return
    window.webAssistant?.setLiveBounds?.(null)
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
      await setLiveBoundsSafe(null)
      return
    }
    const bounds = getLiveBrowserBounds()
    await setLiveBoundsSafe(bounds)
  }

  function shouldShowLiveBrowser() {
    if (running.value) return true
    const statesWithBrowser = [
      'opening',
      'looking',
      'observing',
      'thinking',
      'acting',
      'settling',
      'cancelling',
      'done',
      'error',
      'cancelled',
      'timed_out',
      'blocked'
    ]
    return statesWithBrowser.includes(state.value) && Boolean(currentUrl.value || screenshot.value)
  }

  async function focusLiveBrowserBox() {
    await nextTick()
    for (let attempt = 0; attempt < 10; attempt++) {
      const bounds = getLiveBrowserBounds()
      if (bounds) {
        await setLiveBoundsSafe(bounds)
        return true
      }
      await sleep(80)
    }
    await setLiveBoundsSafe(null)
    return false
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
      window.webAssistant?.setLiveBounds?.(null)
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
    window.webAssistant?.setLiveBounds?.(null)
  })

  return {
    goalInput,
    browserPreview,
    running,
    state,
    steps,
    screenshotSrc,
    currentUrl,
    currentTitle,
    activeRunId,
    stepIndex,
    maxSteps,
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

async function setLiveBoundsSafe(bounds) {
  if (!window.webAssistant?.setLiveBounds) return { success: false }
  try {
    return await window.webAssistant.setLiveBounds(bounds)
  } catch {
    return { success: false }
  }
}

function isBusyError(message = '') {
  return /网页小助手正在执行|网页小助手正在停止|正在执行|正在停止/.test(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toFriendlyError(message) {
  if (!message) return ''
  if (message.includes('VISION_API_KEY') || message.includes('GEMINI_API_KEY')) {
    return '网页查看的多模态理解还没配置好：如果走 Google Vertex，请确认 VISION_PROVIDER=google-vertex；否则需要 VISION_API_KEY。'
  }
  if (/GOOGLE_VERTEX_PROJECT|Google Cloud Project|gcloud|Vertex/i.test(message)) {
    return 'Google Vertex 多模态理解配置没准备好，请确认 .env 里的 GOOGLE_VERTEX_PROJECT，并完成 gcloud auth login。'
  }
  if (/503|UNAVAILABLE|high demand|太忙|temporar|busy|overload/i.test(message)) {
    return '网页查看暂时有点忙，稍后再点“开始执行”试一次。'
  }
  if (/429|quota|rate limit|额度|限流|exceeded/i.test(message)) {
    return '网页查看次数暂时受限，稍后再试，或检查一下 .env 配置。'
  }
  if (
    /401|403|api key|apikey|permission|unauthori|forbidden|invalid.*key|密钥|权限/i.test(message)
  ) {
    return '多模态模型认证不可用：Google Vertex 请检查 gcloud 登录和项目权限；直连模型请检查 VISION_API_KEY。'
  }
  if (
    /404|not found|not exist|not available|not supported|model|模型不存在|模型不可用/i.test(message)
  ) {
    return '多模态模型名称不可用，已尝试备用模型；如果仍失败，请检查 .env 里的 VISION_MODEL。'
  }
  if (/net::ERR_|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|网页打开超时|网络连接/i.test(message)) {
    return '网页暂时打不开，可能是网络不稳定。稍后再点“开始查看”即可重试。'
  }
  return message.length > 160 ? message.slice(0, 160) + '…' : message
}
