<script setup>
import { computed } from 'vue'

const props = defineProps({
  searchInput: { type: String, default: '' },
  searching: Boolean,
  searchError: { type: String, default: '' },
  searchResult: { type: Object, default: null },
  quickSearchHistory: { type: Array, default: () => [] },
  quickSearchHistoryLoading: Boolean,
  searchSamples: { type: Array, default: () => [] },
  canReturnToChat: Boolean,
  returnLabel: { type: String, default: '带回问学伴' }
})

const emit = defineEmits(['update:searchInput', 'search', 'sample', 'return-chat'])

const resultCitations = computed(() => buildCitationItems(props.searchResult))
const resultSourceCount = computed(() => sourceCount(props.searchResult))
const visibleQuickSearchHistory = computed(() =>
  props.quickSearchHistory.filter((item) => item?.kind !== 'background').slice(0, 5)
)

function quickSearchStatusLabel(status) {
  if (status === 'done') return '完成'
  if (status === 'error') return '失败'
  if (status === 'skipped') return '跳过'
  return status || '未知'
}

function formatHistoryTime(timestamp) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function sourceCount(result) {
  return Array.isArray(result?.sources) ? result.sources.length : 0
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function truncateText(value, maxLength = 150) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  const normalized = number <= 1 ? number * 100 : number
  return `${Math.round(Math.max(0, Math.min(100, normalized)))}%`
}

function formatPosition(start, end) {
  const hasStart = start !== undefined && start !== null && start !== ''
  const hasEnd = end !== undefined && end !== null && end !== ''
  if (!hasStart && !hasEnd) return ''
  return `${hasStart ? start : '?'}-${hasEnd ? end : '?'}`
}

function buildCitationItems(result) {
  if (!result || typeof result !== 'object') return []

  const sourceItems = toArray(result.sources).map((source, index) => ({
    id: `source-${index}`,
    label: `网页 ${index + 1}`,
    title: source.title || source.fileName || '参考来源',
    url: source.url || '',
    host: hostFromUrl(source.url),
    snippet: truncateText(source.snippet || source.text || source.content, 190),
    position: formatPosition(source.startPos, source.endPos),
    score: formatPercent(source.scores?.overall ?? source.score),
    level: source.scores?.level || source.level || '',
    reason: source.scores?.reason || ''
  }))

  const retrieveItems = toArray(result.results).map((item, index) => {
    const chunk = item.chunk || item
    return {
      id: `rag-${index}`,
      label: `资料 ${index + 1}`,
      title: chunk.fileName || item.fileName || '知识库资料',
      url: '',
      host: chunk.collectionId || item.collectionId || '',
      snippet: truncateText(chunk.content || item.snippet || item.content, 210),
      position: formatPosition(chunk.startPos ?? item.startPos, chunk.endPos ?? item.endPos),
      score: formatPercent(item.score),
      level: item.rankReason?.join('、') || '',
      reason: item.rankReason?.join('、') || ''
    }
  })

  const referenceItems = toArray(result.citations || result.references || result.evidenceRefs).map(
    (ref, index) => ({
      id: `ref-${index}`,
      label: `引用 ${index + 1}`,
      title: ref.fileName || ref.title || ref.documentName || '引用来源',
      url: ref.url || '',
      host: hostFromUrl(ref.url) || ref.collectionName || '',
      snippet: truncateText(ref.snippet || ref.text || ref.content, 190),
      position: formatPosition(ref.startPos, ref.endPos),
      score: formatPercent(ref.score || ref.overall),
      level: ref.level || '',
      reason: ref.reason || ''
    })
  )

  return [...retrieveItems, ...referenceItems, ...sourceItems].filter(
    (item) => item.title || item.snippet || item.url
  )
}
</script>

<template>
  <div class="helper-layout">
    <section class="card control-card">
      <h2 class="section-title">想找什么资料？</h2>
      <p class="helper-copy">可以找练习题、知识点解释，也可以查学习方法。</p>
      <div class="search-row">
        <input
          :value="searchInput"
          class="input search-input"
          placeholder="比如：三年级分数加法练习题"
          :disabled="searching"
          @input="emit('update:searchInput', $event.target.value)"
          @keydown.enter="emit('search')"
        />
        <button
          class="btn btn-primary"
          @click="emit('search')"
          :disabled="searching || !searchInput.trim()"
        >
          {{ searching ? '查找中...' : '查一下' }}
        </button>
      </div>
      <div class="sample-row" v-if="!searching && !searchResult">
        <button
          v-for="sample in searchSamples"
          :key="sample"
          class="sample-chip"
          @click="emit('sample', sample)"
        >
          {{ sample }}
        </button>
      </div>
      <div class="error-msg" v-if="searchError">{{ searchError }}</div>
    </section>

    <section
      class="card history-card"
      v-if="quickSearchHistoryLoading || visibleQuickSearchHistory.length"
    >
      <div class="history-head">
        <h2 class="section-title">最近查询</h2>
        <small>只显示你主动查过的资料</small>
      </div>
      <div class="history-list" v-if="visibleQuickSearchHistory.length">
        <div v-for="item in visibleQuickSearchHistory" :key="item.id" class="history-item">
          <div class="history-main">
            <strong>{{ item.query }}</strong>
            <p>{{ item.summary || item.error || '暂无摘要' }}</p>
          </div>
          <div class="history-meta">
            <span class="history-pill" :class="item.status">{{
              quickSearchStatusLabel(item.status)
            }}</span>
            <small>{{ formatHistoryTime(item.updatedAt) }}</small>
          </div>
        </div>
      </div>
      <p class="history-empty" v-else>正在加载最近查询...</p>
    </section>

    <section class="card result-card" v-if="searchResult">
      <div class="result-head">
        <h2 class="section-title">查到的内容</h2>
        <div class="result-actions">
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="!canReturnToChat"
            @click="emit('return-chat')"
          >
            {{ returnLabel }}
          </button>
          <div
            class="mode-badge"
            :class="searchResult.mode === 'web' || searchResult.mode === 'cloud' ? 'web' : 'local'"
          >
            {{
              searchResult.mode === 'web' || searchResult.mode === 'cloud'
                ? '网页整理结果'
                : '本地网页查询'
            }}
          </div>
        </div>
      </div>
      <div class="resource-meta" v-if="searchResult.elapsedMs || searchResult.cacheHit">
        <span v-if="searchResult.elapsedMs">{{ searchResult.elapsedMs }}ms</span>
        <span v-if="searchResult.cacheHit">缓存命中</span>
        <span v-if="resultSourceCount">{{ resultSourceCount }} 个来源</span>
      </div>

      <div class="answer-card">
        <div class="answer-label">整理结果</div>
        <div class="summary-box">{{ searchResult.summary }}</div>
      </div>

      <div class="citation-panel" v-if="resultCitations.length">
        <div class="citation-head">
          <div>
            <h3>引用定位</h3>
            <p>答案里的资料可以回到原文片段查看。</p>
          </div>
          <span>{{ resultCitations.length }} 条</span>
        </div>
        <div class="citation-grid">
          <a
            v-for="item in resultCitations"
            :key="item.id"
            class="citation-card"
            :class="{ 'is-document': !item.url }"
            :href="item.url || undefined"
            :target="item.url ? '_blank' : undefined"
          >
            <div class="citation-top">
              <span class="citation-index">{{ item.label }}</span>
              <span class="citation-score" v-if="item.score">{{ item.score }}</span>
            </div>
            <strong>{{ item.title }}</strong>
            <small v-if="item.host">{{ item.host }}</small>
            <p v-if="item.snippet">{{ item.snippet }}</p>
            <div class="citation-foot" v-if="item.position || item.level">
              <span v-if="item.position">位置 {{ item.position }}</span>
              <span v-if="item.level">{{ item.level }}</span>
            </div>
          </a>
        </div>
      </div>

      <div class="stage-list" v-if="searchResult.stages?.length">
        <div
          v-for="stage in searchResult.stages.slice(0, 5)"
          :key="stage.at + stage.name"
          class="stage-item"
        >
          <span class="stage-dot" :class="stage.status"></span>
          <strong>{{ stage.name }}</strong>
          <small>{{ stage.detail }}</small>
        </div>
      </div>

      <h3 class="source-title" v-if="searchResult.sources?.length">参考网页</h3>
      <div class="source-list">
        <a
          v-for="source in searchResult.sources"
          :key="source.url"
          class="source-item"
          :href="source.url"
          target="_blank"
        >
          <div class="source-main">
            <strong>{{ source.title }}</strong>
            <small>{{ source.url }}</small>
            <p v-if="source.text">{{ truncateText(source.text, 120) }}</p>
          </div>
          <div class="score-pill" v-if="source.scores">
            {{ source.scores.level || source.level }} · {{ source.scores.overall }}
          </div>
        </a>
      </div>
    </section>

    <section class="card tips-card" v-if="!searchResult && !searching">
      <h2 class="section-title">适合这些场景</h2>
      <div class="feature-grid">
        <div class="feature">
          <strong>找练习题</strong>
          <p>比如数学口算、英语单词、科学探究资料。</p>
        </div>
        <div class="feature">
          <strong>解释知识点</strong>
          <p>把网页里的长内容压成几段重点。</p>
        </div>
        <div class="feature">
          <strong>挑一挑来源</strong>
          <p>优先看适合学习、可信、表达清楚的网页。</p>
        </div>
        <div class="feature">
          <strong>更快</strong>
          <p>不用一步步点网页，先拿到一版可读结果。</p>
        </div>
      </div>
    </section>
  </div>
</template>
