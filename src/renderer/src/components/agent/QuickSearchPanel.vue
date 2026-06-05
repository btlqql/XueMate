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
</template>
