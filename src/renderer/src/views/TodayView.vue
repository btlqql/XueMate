<script setup>
import { computed, onMounted, ref } from 'vue'

const emit = defineEmits(['navigate'])

const promptText = ref('')
const loadingStats = ref(false)
const docCount = ref(0)
const collectionCount = ref(0)
const conversationCount = ref(0)
const pendingTaskCount = ref(0)
const lastConversationTitle = ref('')

const hasMaterials = computed(() => docCount.value > 0)
const trimmedPrompt = computed(() => promptText.value.trim())
const todayAdvice = computed(() => {
  if (!hasMaterials.value) return '先导入老师课件、笔记或作业，学伴回答会更有依据。'
  if (pendingTaskCount.value > 0)
    return `还有 ${pendingTaskCount.value} 个待办，建议先整理作业再提问。`
  if (lastConversationTitle.value) return `可以继续上次的问题：「${lastConversationTitle.value}」。`
  return '可以直接带着资料问学伴，遇到资料不够再补网页资料。'
})

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function getAppWindow() {
  return typeof window === 'undefined' ? null : window
}

function getResultData(settledResult) {
  if (settledResult.status !== 'fulfilled') return null
  const value = settledResult.value
  return value && value.success ? value.data : null
}

function countCollectionDocs(collections) {
  return safeArray(collections).reduce((total, collection) => {
    const count = Number(collection?.docCount || 0)
    return Number.isFinite(count) ? total + count : total
  }, 0)
}

function countPendingTasks(tasks) {
  return safeArray(tasks).filter((task) => task?.status !== 'done').length
}

function resolveConversationTitle(conversations) {
  const firstConversation = safeArray(conversations)[0]
  if (!firstConversation) return ''
  return String(firstConversation.title || firstConversation.name || '上次对话')
}

async function loadDashboard() {
  const appWindow = getAppWindow()
  if (!appWindow) return

  loadingStats.value = true
  try {
    const [collectionsResult, conversationsResult, tasksResult] = await Promise.allSettled([
      appWindow.rag?.collections?.() || Promise.resolve({ success: false }),
      appWindow.chat?.getConversations?.() || Promise.resolve({ success: false }),
      appWindow.task?.getAll?.() || Promise.resolve({ success: false })
    ])

    const collections = safeArray(getResultData(collectionsResult))
    const conversations = safeArray(getResultData(conversationsResult))
    const tasks = safeArray(getResultData(tasksResult))

    collectionCount.value = collections.length
    docCount.value = countCollectionDocs(collections)
    conversationCount.value = conversations.length
    pendingTaskCount.value = countPendingTasks(tasks)
    lastConversationTitle.value = resolveConversationTitle(conversations)
  } finally {
    loadingStats.value = false
  }
}

function buildPayload(draftPrompt) {
  return draftPrompt ? { draftPrompt } : null
}

function askMate() {
  emit('navigate', {
    view: 'chat',
    payload: buildPayload(trimmedPrompt.value)
  })
}

function askWithMaterials() {
  const draftPrompt =
    trimmedPrompt.value || (hasMaterials.value ? '请基于资料库讲清楚这个问题：' : '')
  emit('navigate', {
    view: 'chat',
    payload: {
      collectionId: 'all',
      draftPrompt
    }
  })
}

function importMaterials() {
  emit('navigate', 'knowledge')
}

function organizeHomework() {
  emit('navigate', {
    view: 'tools',
    tool: 'task'
  })
}

function openTutor() {
  emit('navigate', {
    view: 'tools',
    tool: 'tutor'
  })
}

function openReviewPlan() {
  emit('navigate', {
    view: 'tools',
    tool: 'review'
  })
}

function searchWebMaterials() {
  emit('navigate', {
    view: 'agent',
    mode: 'search',
    payload: {
      draftPrompt: trimmedPrompt.value || '帮我找一版适合小学生理解的补充资料'
    }
  })
}

onMounted(loadDashboard)
</script>

<template>
  <div class="today-view fade-in">
    <section class="today-hero">
      <div class="hero-copy">
        <p class="hero-kicker">资料驱动个性化学伴</p>
        <h1>今天先完成哪一件？</h1>
        <p>把作业、资料、提问和复习放进同一条学习线：先有资料，再问学伴，不够就补网页资料。</p>
      </div>

      <div class="hero-loop" aria-label="XueMate 学习闭环">
        <span>导入资料</span>
        <i></i>
        <span>问学伴</span>
        <i></i>
        <span>补资料</span>
        <i></i>
        <span>复习弱点</span>
      </div>
    </section>

    <section class="today-command card">
      <div>
        <h2 class="command-title">问知识点、贴题目，或安排今天 30 分钟学习</h2>
        <p class="command-desc">{{ todayAdvice }}</p>
      </div>
      <form class="command-form" @submit.prevent="askMate">
        <input
          v-model="promptText"
          class="input command-input"
          placeholder="例如：帮我讲清楚分数加法，顺便给我 3 道练习"
        />
        <button class="btn btn-primary" type="submit">问学伴</button>
      </form>
      <div class="quick-actions">
        <button class="chip" type="button" @click="askWithMaterials">带资料去问</button>
        <button class="chip" type="button" @click="importMaterials">导入资料</button>
        <button class="chip" type="button" @click="searchWebMaterials">查网页资料</button>
      </div>
    </section>

    <section class="today-grid">
      <button class="journey-card primary" type="button" @click="askWithMaterials">
        <span class="card-step">核心</span>
        <strong>基于资料问学伴</strong>
        <p>优先使用课件、笔记和作业原文回答，减少凭空发挥。</p>
      </button>

      <button class="journey-card" type="button" @click="importMaterials">
        <span class="card-step">资料</span>
        <strong>导入课件 / 笔记 / 作业</strong>
        <p>先把老师资料放进资料库，后面的回答才有依据。</p>
      </button>

      <button class="journey-card" type="button" @click="organizeHomework">
        <span class="card-step">作业</span>
        <strong>整理作业清单</strong>
        <p>把通知里的要求、截止时间和提交格式拆清楚。</p>
      </button>

      <button class="journey-card" type="button" @click="searchWebMaterials">
        <span class="card-step">补充</span>
        <strong>查网页资料</strong>
        <p>本地资料不够时，先找一版适合小学生理解的补充资料。</p>
      </button>

      <button class="journey-card" type="button" @click="openTutor">
        <span class="card-step">辅导</span>
        <strong>代码与作业辅导</strong>
        <p>把明确的代码、作业文件或练习题交给学习工具处理。</p>
      </button>

      <button class="journey-card muted" type="button" @click="openReviewPlan">
        <span class="card-step">复习</span>
        <strong>复习计划</strong>
        <p>先做课程提纲，后续接入学伴记录的薄弱点。</p>
      </button>
    </section>

    <section class="today-stats" aria-label="学习状态">
      <div class="stat-pill">
        <strong>{{ loadingStats ? '...' : docCount }}</strong>
        <span>份资料</span>
      </div>
      <div class="stat-pill">
        <strong>{{ loadingStats ? '...' : collectionCount }}</strong>
        <span>个资料夹</span>
      </div>
      <div class="stat-pill">
        <strong>{{ loadingStats ? '...' : conversationCount }}</strong>
        <span>次问学伴</span>
      </div>
      <div class="stat-pill">
        <strong>{{ loadingStats ? '...' : pendingTaskCount }}</strong>
        <span>个待办</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.today-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1120px;
}

.today-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.8fr);
  gap: 18px;
  align-items: stretch;
}

.hero-copy {
  padding: clamp(24px, 4vw, 38px);
  border: 1px solid rgba(88, 204, 2, 0.22);
  border-radius: var(--xm-radius-lg);
  background:
    radial-gradient(circle at 12% 18%, rgba(88, 204, 2, 0.18), transparent 28%),
    linear-gradient(135deg, #ffffff 0%, #f4ffed 58%, #eaf8ff 100%);
  box-shadow: var(--xm-shadow);
}

.hero-kicker {
  color: var(--xm-green-dark);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.hero-copy h1 {
  margin-top: 8px;
  color: var(--xm-text);
  font-size: clamp(30px, 4.8vw, 52px);
  font-weight: 900;
  line-height: 1.06;
}

.hero-copy p:last-child {
  max-width: 640px;
  margin-top: 12px;
  color: var(--xm-text-light);
  font-size: 16px;
  font-weight: 700;
}

.hero-loop {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-lg);
  background: white;
  box-shadow: var(--xm-shadow-sm);
}

.hero-loop span {
  display: flex;
  align-items: center;
  min-height: 42px;
  padding: 10px 14px;
  border-radius: var(--xm-radius-sm);
  background: var(--xm-surface-soft);
  color: var(--xm-text);
  font-weight: 900;
}

.hero-loop i {
  width: 2px;
  height: 14px;
  margin-left: 22px;
  border-radius: 999px;
  background: var(--xm-green);
}

.today-command {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(360px, 1.2fr);
  gap: 16px;
  align-items: center;
}

.command-title {
  color: var(--xm-text);
  font-size: 18px;
  font-weight: 900;
}

.command-desc {
  margin-top: 4px;
  color: var(--xm-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.command-form {
  display: flex;
  gap: 10px;
}

.command-input {
  flex: 1;
}

.quick-actions {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.today-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.journey-card {
  display: flex;
  min-height: 168px;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 18px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-lg);
  background: white;
  color: var(--xm-text);
  font-family: var(--xm-font);
  text-align: left;
  cursor: pointer;
  box-shadow: var(--xm-shadow-sm);
  transition: all 0.16s ease;
}

.journey-card:hover {
  border-color: rgba(88, 204, 2, 0.42);
  box-shadow: var(--xm-shadow);
  transform: translateY(-2px);
}

.journey-card.primary {
  border-color: rgba(88, 204, 2, 0.42);
  background: linear-gradient(180deg, #f4ffec 0%, #ffffff 100%);
}

.journey-card.muted {
  background: #fbfcfe;
}

.card-step {
  padding: 4px 10px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-blue-light);
  color: var(--xm-blue-dark);
  font-size: 12px;
  font-weight: 900;
}

.journey-card.primary .card-step {
  background: var(--xm-green-pale);
  color: var(--xm-green-dark);
}

.journey-card strong {
  font-size: 18px;
  font-weight: 900;
}

.journey-card p {
  color: var(--xm-text-light);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.55;
}

.today-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.stat-pill {
  padding: 14px 16px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  background: white;
  box-shadow: var(--xm-shadow-sm);
}

.stat-pill strong {
  display: block;
  color: var(--xm-green-dark);
  font-size: 24px;
  font-weight: 900;
}

.stat-pill span {
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 900;
}

@media (max-width: 980px) {
  .today-hero,
  .today-command,
  .today-grid,
  .today-stats {
    grid-template-columns: 1fr;
  }

  .quick-actions {
    grid-column: 1;
  }
}

@media (max-width: 620px) {
  .command-form {
    flex-direction: column;
  }
}
</style>
