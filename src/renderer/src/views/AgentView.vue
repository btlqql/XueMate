<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const activeMode = ref('search')

// 快速查资料
const searchInput = ref('')
const searching = ref(false)
const searchError = ref('')
const searchResult = ref(null)

// 操作网页
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

const searchSamples = ['三年级分数加法练习题', '小学生英语单词记忆方法', '五年级科学小实验']
const controlSamples = [
  '帮我搜索三年级分数加法练习题，找到一个合适的网页',
  '打开必应，搜索小学生英语单词记忆方法',
  '帮我找一个适合五年级的科学小实验网页'
]

const screenshotSrc = computed(() =>
  screenshot.value ? `data:${screenshotMime.value};base64,${screenshot.value}` : ''
)
const friendlyError = computed(() => toFriendlyError(error.value))

const stateLabel = {
  idle: '还没开始',
  opening: '打开网页',
  looking: '看网页',
  acting: '操作中',
  done: '完成',
  error: '出错',
  stopped: '已停止'
}

function cleanup() {
  if (removeUpdateListener) {
    removeUpdateListener()
    removeUpdateListener = null
  }
}

async function runQuickSearch() {
  if (!searchInput.value.trim() || searching.value) return
  searching.value = true
  searchError.value = ''
  searchResult.value = null

  try {
    const result = await window.quickSearch.run(searchInput.value.trim())
    if (result.success) {
      searchResult.value = result.data
    } else {
      searchError.value = result.error || '查资料失败'
    }
  } catch (e) {
    searchError.value = '查资料失败：' + (e.message || '未知错误')
  } finally {
    searching.value = false
  }
}

function loadSearchSample(text) {
  searchInput.value = text
}

function loadControlSample(text) {
  goalInput.value = text
}

async function startAssistant() {
  if (!goalInput.value.trim() || running.value) return

  await focusLiveBrowserBox()

  cleanup()
  running.value = true
  state.value = 'opening'
  steps.value = []
  screenshot.value = ''
  screenshotMime.value = 'image/png'
  currentUrl.value = ''
  currentTitle.value = ''
  error.value = ''
  answer.value = ''
  domElementCount.value = 0
  domCandidates.value = []

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

function getLiveBrowserBounds() {
  const el = browserBoxRef.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width < 120 || rect.height < 100) return null
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
}

async function syncLiveBrowserBounds() {
  if (activeMode.value !== 'control') return
  const bounds = getLiveBrowserBounds()
  if (bounds) {
    await window.webAssistant.setLiveBounds(bounds)
  }
}

async function focusLiveBrowserBox() {
  await nextTick()
  browserBoxRef.value?.scrollIntoView({ behavior: 'auto', block: 'center' })
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toFriendlyError(message) {
  if (!message) return ''
  if (message.includes('VISION_API_KEY') || message.includes('GEMINI_API_KEY')) {
    return '还没配置多模态模型密钥。需要在 .env 里配置 VISION_API_KEY。'
  }
  if (/503|UNAVAILABLE|high demand|太忙|temporar|busy|overload/i.test(message)) {
    return '多模态模型现在太忙，学伴已经重试并换备用模型了，但还是失败。请稍后再点“开始操作网页”。'
  }
  if (/429|quota|rate limit|额度|限流|exceeded/i.test(message)) {
    return '多模态模型额度不足或被限流了。请稍后再试，或在 .env 里换一个 VISION_MODEL。'
  }
  if (/net::ERR_|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|网页打开超时|网络连接/i.test(message)) {
    return '网页暂时打不开，可能是网络或代理不稳定。截图区域已经保留，稍后再点“开始操作网页”即可重试。'
  }
  return message.length > 160 ? message.slice(0, 160) + '…' : message
}

onMounted(() => {
  window.addEventListener('resize', scheduleLiveBrowserBoundsSync)
  window.addEventListener('scroll', scheduleLiveBrowserBoundsSync, true)
})

watch(activeMode, async (mode) => {
  if (mode === 'control') {
    await nextTick()
    scheduleLiveBrowserBoundsSync()
  } else {
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
  cleanup()
  window.webAssistant.setLiveBounds(null)
})
</script>

<template>
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">小实验</h1>
      <p class="page-desc">这里有两个能力：直接查资料，或者让学伴一步一步操作网页</p>
    </div>

    <div class="mode-tabs">
      <button
        class="mode-tab"
        :class="{ active: activeMode === 'search' }"
        @click="activeMode = 'search'"
      >
        <span class="mode-icon">🔎</span>
        <span>
          <strong>快速查资料</strong>
          <small>直接找答案，不点网页</small>
        </span>
      </button>
      <button
        class="mode-tab"
        :class="{ active: activeMode === 'control' }"
        @click="activeMode = 'control'"
      >
        <span class="mode-icon">🖱️</span>
        <span>
          <strong>操作网页</strong>
          <small>看截图，帮你点击输入</small>
        </span>
      </button>
    </div>

    <!-- 快速查资料 -->
    <div v-if="activeMode === 'search'" class="helper-layout">
      <section class="card control-card">
        <h2 class="section-title">你想查什么？</h2>
        <p class="helper-copy">适合问知识点、找练习题、查学习方法。它会直接搜索网页文字并总结。</p>
        <div class="search-row">
          <input
            v-model="searchInput"
            class="input search-input"
            placeholder="比如：三年级分数加法练习题"
            :disabled="searching"
            @keydown.enter="runQuickSearch"
          />
          <button
            class="btn btn-primary"
            @click="runQuickSearch"
            :disabled="searching || !searchInput.trim()"
          >
            {{ searching ? '查找中...' : '开始查' }}
          </button>
        </div>
        <div class="sample-row" v-if="!searching && !searchResult">
          <button
            v-for="sample in searchSamples"
            :key="sample"
            class="sample-chip"
            @click="loadSearchSample(sample)"
          >
            {{ sample }}
          </button>
        </div>
        <div class="error-msg" v-if="searchError">{{ searchError }}</div>
      </section>

      <section class="card result-card" v-if="searchResult">
        <h2 class="section-title">查到的内容</h2>
        <div class="summary-box">{{ searchResult.summary }}</div>
        <h3 class="source-title">参考网页</h3>
        <div class="source-list">
          <a
            v-for="source in searchResult.sources"
            :key="source.url"
            class="source-item"
            :href="source.url"
            target="_blank"
          >
            <strong>{{ source.title }}</strong>
            <small>{{ source.url }}</small>
          </a>
        </div>
      </section>

      <section class="card tips-card" v-if="!searchResult && !searching">
        <h2 class="section-title">快速查资料适合做什么</h2>
        <div class="feature-grid">
          <div class="feature">
            <strong>找练习题</strong>
            <p>比如数学口算、英语单词、科学小实验。</p>
          </div>
          <div class="feature">
            <strong>解释知识点</strong>
            <p>把网页内容整理成适合学生读的总结。</p>
          </div>
          <div class="feature">
            <strong>不用点网页</strong>
            <p>它只抓网页文字，不会乱操作。</p>
          </div>
          <div class="feature">
            <strong>更快</strong>
            <p>比操作网页更快，适合普通查询。</p>
          </div>
        </div>
      </section>
    </div>

    <!-- 操作网页 -->
    <div v-else class="helper-layout">
      <section class="card control-card">
        <div class="control-title-row">
          <div>
            <h2 class="section-title">你想让它怎么操作网页？</h2>
            <p class="helper-copy">
              适合点按钮、填搜索框、滚动网页。会慢速演示每一步，方便你看清楚。
            </p>
          </div>
          <span class="state-pill" :class="'state-' + state">{{ stateLabel[state] || state }}</span>
        </div>

        <textarea
          v-model="goalInput"
          class="input textarea goal-input"
          placeholder="比如：帮我搜索三年级分数加法练习题，找到一个合适的网页"
          rows="3"
          :disabled="running"
        ></textarea>

        <div class="button-group">
          <button
            class="btn btn-primary"
            @click="startAssistant"
            :disabled="running || !goalInput.trim()"
          >
            {{ running ? '正在帮你看网页...' : '开始操作网页' }}
          </button>
          <button class="btn btn-secondary" @click="stopAssistant" v-if="running">停止</button>
          <button class="btn btn-outline" @click="clearControl" v-if="!running && steps.length > 0">
            清空
          </button>
        </div>

        <div class="sample-row" v-if="!running && steps.length === 0">
          <button
            v-for="sample in controlSamples"
            :key="sample"
            class="sample-chip"
            @click="loadControlSample(sample)"
          >
            {{ sample }}
          </button>
        </div>

        <div class="error-msg" v-if="friendlyError">
          {{ friendlyError }}
          <p v-if="error.includes('VISION_API_KEY')" class="config-hint">
            需要在 .env 里配置 VISION_API_KEY、VISION_BASE_URL、VISION_MODEL。
          </p>
        </div>
        <div class="answer-msg" v-if="answer && state === 'done'">{{ answer }}</div>
      </section>

      <section class="card browser-card">
        <div class="browser-head">
          <div>
            <h2 class="section-title">网页截图</h2>
            <p class="url-text" v-if="currentUrl">
              {{ currentTitle || '当前网页' }} · {{ currentUrl }}
            </p>
            <p class="url-text" v-else>开始后这里会显示学伴看到的网页</p>
          </div>
        </div>

        <div ref="browserBoxRef" class="screenshot-box" :class="{ empty: !screenshotSrc }">
          <img v-if="screenshotSrc" :src="screenshotSrc" alt="当前网页截图" />
          <div v-else class="screenshot-placeholder">
            <span class="book-icon">🖱️</span>
            <strong>还没有网页截图</strong>
            <small>点击“开始操作网页”后，学伴会打开网页并截图。</small>
          </div>
        </div>
      </section>

      <section class="card dom-debug-card">
        <div class="steps-header">
          <div>
            <h2 class="section-title">DOM 调试面板</h2>
            <p class="url-text">模型只会看到下面这些候选，不会吃完整 DOM 树。</p>
          </div>
          <span class="step-count">{{ domCandidates.length }} / {{ domElementCount }} 个</span>
        </div>

        <div class="empty-steps" v-if="domCandidates.length === 0">
          还没有 DOM 候选。开始操作后会显示搜索框、按钮、链接等可操作元素。
        </div>

        <div class="dom-list" v-else>
          <div v-for="item in domCandidates" :key="item.id" class="dom-item">
            <div class="dom-id">{{ item.id }}</div>
            <div class="dom-main">
              <div class="dom-title">
                <strong>{{ item.role }}/{{ item.tag }}</strong>
                <span>score {{ item.score }}</span>
                <small>center ({{ item.center.x }}, {{ item.center.y }})</small>
              </div>
              <div class="dom-label">{{ item.label }}</div>
              <div class="dom-meta">
                <span>{{ item.size.width }}×{{ item.size.height }}</span>
                <span v-for="flag in item.flags" :key="item.id + flag">{{ flag }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card steps-card">
        <div class="steps-header">
          <h2 class="section-title">它做了什么</h2>
          <span class="step-count">{{ steps.length }} 步</span>
        </div>

        <div class="empty-steps" v-if="steps.length === 0">
          学伴还没有开始操作。它每做一步，都会显示在这里。
        </div>

        <div class="steps-list" v-else>
          <div v-for="step in steps" :key="step.id" class="step-item">
            <div class="step-num" :class="'step-' + step.status">
              {{ step.status === 'done' ? '✓' : step.status === 'error' ? '!' : step.id }}
            </div>
            <div class="step-body">
              <div class="step-thinking">{{ step.thought }}</div>
              <div class="step-action">{{ step.actionLabel }}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mode-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.mode-tab {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 2px solid var(--xm-border);
  border-radius: 16px;
  padding: 14px 16px;
  background: white;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-tab.active {
  border-color: var(--xm-green);
  background: #f0fdf4;
  box-shadow: 0 3px 0 #d9f6cc;
}

.mode-icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #f7f7f7;
  font-size: 21px;
  flex-shrink: 0;
}

.mode-tab strong {
  display: block;
  color: #333;
  font-size: 15px;
  font-weight: 900;
}

.mode-tab small {
  display: block;
  color: #888;
  font-size: 12px;
  margin-top: 3px;
}

.helper-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.control-title-row,
.browser-head,
.steps-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.helper-copy,
.url-text {
  color: #888;
  font-size: 13px;
  font-weight: 600;
  margin-top: -8px;
}

.url-text {
  word-break: break-all;
  margin-top: 0;
}

.search-row {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.search-input {
  flex: 1;
}

.state-pill {
  padding: 6px 13px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #777;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.state-opening,
.state-looking,
.state-acting {
  background: #dbeafe;
  color: #1d4ed8;
}

.state-done {
  background: #dcfce7;
  color: #166534;
}

.state-error {
  background: #fee2e2;
  color: #991b1b;
}

.state-stopped {
  background: #f3f4f6;
  color: #6b7280;
}

.goal-input {
  min-height: 86px;
}

.button-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.sample-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.sample-chip {
  border: 1px solid var(--xm-border);
  background: white;
  border-radius: 999px;
  padding: 7px 12px;
  color: #555;
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
}

.sample-chip:hover {
  border-color: var(--xm-green);
  color: var(--xm-green-dark);
  background: #f0fdf4;
}

.error-msg,
.answer-msg {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
}

.error-msg {
  background: #fee2e2;
  color: #991b1b;
}

.config-hint {
  margin-top: 6px;
  color: #7f1d1d;
  font-size: 12px;
}

.answer-msg,
.summary-box {
  background: #dcfce7;
  color: #166534;
}

.summary-box {
  white-space: pre-wrap;
  padding: 14px;
  border-radius: 12px;
  line-height: 1.6;
  font-size: 15px;
  font-weight: 700;
}

.source-title {
  color: #777;
  font-size: 13px;
  font-weight: 900;
  margin: 16px 0 8px;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.source-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f7f7f7;
  text-decoration: none;
}

.source-item strong {
  color: #333;
  font-size: 14px;
}

.source-item small {
  color: #888;
  font-size: 12px;
  word-break: break-all;
}

.screenshot-box {
  margin-top: 12px;
  border: 2px solid var(--xm-border);
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  aspect-ratio: 1000 / 650;
  min-height: 260px;
  max-height: 520px;
  display: flex;
}

.screenshot-box img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
}

.screenshot-box.empty {
  align-items: center;
  justify-content: center;
  background: #f7f7f7;
}

.screenshot-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #777;
  text-align: center;
  padding: 32px;
}

.book-icon {
  font-size: 34px;
}

.screenshot-placeholder small {
  color: #999;
  font-size: 13px;
}

.step-count {
  color: #999;
  font-size: 13px;
  font-weight: 900;
}

.empty-steps {
  color: #999;
  font-size: 14px;
  font-weight: 600;
}

.dom-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dom-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fbfbfb;
}

.dom-id {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  font-weight: 900;
}

.dom-main {
  flex: 1;
  min-width: 0;
}

.dom-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #333;
  font-size: 12px;
  font-weight: 800;
}

.dom-title span,
.dom-title small {
  color: #888;
  font-size: 11px;
  font-weight: 800;
}

.dom-label {
  margin-top: 4px;
  color: #555;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dom-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.dom-meta span {
  padding: 2px 7px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #777;
  font-size: 10px;
  font-weight: 900;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #f7f7f7;
}

.step-num {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 900;
}

.step-done {
  background: #dcfce7;
  color: #166534;
}

.step-error {
  background: #fee2e2;
  color: #991b1b;
}

.step-body {
  flex: 1;
  min-width: 0;
}

.step-thinking {
  color: #333;
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 4px;
}

.step-action {
  color: #777;
  font-size: 13px;
  font-weight: 700;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.feature {
  padding: 14px;
  background: #f7f7f7;
  border-radius: 12px;
}

.feature strong {
  color: #333;
  font-size: 14px;
}

.feature p {
  color: #777;
  font-size: 13px;
  line-height: 1.4;
  margin-top: 6px;
}

@media (max-width: 900px) {
  .feature-grid,
  .mode-tabs,
  .dom-list {
    grid-template-columns: 1fr;
  }

  .search-row {
    flex-direction: column;
  }
}
</style>
