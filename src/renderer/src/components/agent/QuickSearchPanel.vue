<script setup>
defineProps({
  searchInput: { type: String, default: '' },
  searching: Boolean,
  searchError: { type: String, default: '' },
  searchResult: { type: Object, default: null },
  backgroundOrganizing: Boolean,
  backgroundMessage: { type: String, default: '' },
  backgroundError: { type: String, default: '' },
  backgroundResult: { type: Object, default: null },
  quickSearchHistory: { type: Array, default: () => [] },
  quickSearchHistoryLoading: Boolean,
  searchSamples: { type: Array, default: () => [] },
  canReturnToChat: Boolean,
  returnLabel: { type: String, default: '带回问学伴' }
})

const emit = defineEmits(['update:searchInput', 'search', 'sample', 'return-chat'])

function quickSearchStatusLabel(status) {
  if (status === 'done') return '完成'
  if (status === 'error') return '失败'
  if (status === 'skipped') return '跳过'
  return status || '未知'
}

function quickSearchKindLabel(kind) {
  return kind === 'background' ? '后台整理' : '首屏'
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
      v-if="quickSearchHistoryLoading || quickSearchHistory.length"
    >
      <div class="history-head">
        <h2 class="section-title">最近整理</h2>
        <small>最多显示 5 条，来自本机 SQLite</small>
      </div>
      <div class="history-list" v-if="quickSearchHistory.length">
        <div v-for="item in quickSearchHistory.slice(0, 5)" :key="item.id" class="history-item">
          <div class="history-main">
            <strong>{{ item.query }}</strong>
            <p>{{ item.summary || item.error || '暂无摘要' }}</p>
          </div>
          <div class="history-meta">
            <span class="history-pill" :class="item.kind">{{
              quickSearchKindLabel(item.kind)
            }}</span>
            <span class="history-pill" :class="item.status">{{
              quickSearchStatusLabel(item.status)
            }}</span>
            <small>{{ formatHistoryTime(item.updatedAt) }}</small>
          </div>
        </div>
      </div>
      <p class="history-empty" v-else>正在加载最近整理...</p>
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
      </div>
      <div class="summary-box">{{ searchResult.summary }}</div>

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

      <h3 class="source-title">参考网页</h3>
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
          </div>
          <div class="score-pill" v-if="source.scores">
            {{ source.scores.level || source.level }} · {{ source.scores.overall }}
          </div>
        </a>
      </div>

      <div
        class="background-card"
        v-if="backgroundOrganizing || backgroundMessage || backgroundError || backgroundResult"
      >
        <div class="background-head">
          <div>
            <strong>学习资源整理</strong>
            <small>不影响当前结果，继续筛选可信、适龄、可读的资料</small>
          </div>
          <span class="background-status" :class="{ running: backgroundOrganizing }">
            {{ backgroundOrganizing ? '整理中...' : backgroundResult ? '已完成' : '待机' }}
          </span>
        </div>

        <p class="background-copy" v-if="backgroundMessage">{{ backgroundMessage }}</p>
        <p class="error-msg" v-if="backgroundError">{{ backgroundError }}</p>

        <template v-if="backgroundResult">
          <div class="resource-meta" v-if="backgroundResult.elapsedMs || backgroundResult.cacheHit">
            <span v-if="backgroundResult.elapsedMs">{{ backgroundResult.elapsedMs }}ms</span>
            <span v-if="backgroundResult.cacheHit">缓存命中</span>
          </div>
          <div class="summary-box small">{{ backgroundResult.summary }}</div>

          <div class="stage-list" v-if="backgroundResult.stages?.length">
            <div
              v-for="stage in backgroundResult.stages.slice(0, 4)"
              :key="stage.at + stage.name"
              class="stage-item"
            >
              <span class="stage-dot" :class="stage.status"></span>
              <strong>{{ stage.name }}</strong>
              <small>{{ stage.detail }}</small>
            </div>
          </div>

          <h3 class="source-title">精选学习资源</h3>
          <div class="source-list mini">
            <a
              v-for="source in backgroundResult.sources"
              :key="source.url"
              class="source-item"
              :href="source.url"
              target="_blank"
            >
              <div class="source-main">
                <strong>{{ source.title }}</strong>
                <small>{{ source.url }}</small>
              </div>
              <div class="score-pill" v-if="source.scores">
                {{ source.scores.level || source.level }} · {{ source.scores.overall }}
              </div>
            </a>
          </div>
        </template>
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
