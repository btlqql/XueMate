<script setup>
defineProps({
  searchInput: { type: String, default: '' },
  searching: Boolean,
  searchError: { type: String, default: '' },
  searchResult: { type: Object, default: null },
  searchSamples: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:searchInput', 'search', 'sample'])
</script>

<template>
  <div class="helper-layout">
    <section class="card control-card">
      <h2 class="section-title">你想查什么？</h2>
      <p class="helper-copy">适合问知识点、找练习题、查学习方法。它会直接搜索网页文字并总结。</p>
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
          {{ searching ? '查找中...' : '开始查' }}
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

    <section class="card result-card" v-if="searchResult">
      <div class="result-head">
        <h2 class="section-title">查到的内容</h2>
        <div class="mode-badge" :class="searchResult.mode === 'cloud' ? 'cloud' : 'local'">
          {{ searchResult.mode === 'cloud' ? '云端网络资源分析' : '本地快速搜索' }}
        </div>
      </div>
      <div class="cloud-meta" v-if="searchResult.mode === 'cloud'">
        <span>Task: {{ searchResult.taskId || 'cloud' }}</span>
        <span v-if="searchResult.elapsedMs">{{ searchResult.elapsedMs }}ms</span>
        <span v-if="searchResult.cacheHit">缓存命中</span>
      </div>
      <div class="summary-box">{{ searchResult.summary }}</div>

      <div class="stage-list" v-if="searchResult.stages?.length">
        <div v-for="stage in searchResult.stages.slice(0, 5)" :key="stage.at + stage.name" class="stage-item">
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
          <strong>云端筛选</strong>
          <p>高级模式可按适龄性、可信度、可读性给网页评分。</p>
        </div>
        <div class="feature">
          <strong>更快</strong>
          <p>比操作网页更快，适合普通查询。</p>
        </div>
      </div>
    </section>
  </div>
</template>
