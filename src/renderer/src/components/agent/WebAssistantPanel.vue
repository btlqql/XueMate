<script setup>
defineProps({
  goalInput: { type: String, default: '' },
  running: Boolean,
  state: { type: String, default: 'idle' },
  stateLabel: { type: Object, required: true },
  steps: { type: Array, default: () => [] },
  screenshotSrc: { type: String, default: '' },
  currentUrl: { type: String, default: '' },
  currentTitle: { type: String, default: '' },
  friendlyError: { type: String, default: '' },
  rawError: { type: String, default: '' },
  answer: { type: String, default: '' },
  controlSamples: { type: Array, default: () => [] },
  domCandidates: { type: Array, default: () => [] },
  domElementCount: { type: Number, default: 0 }
})

const emit = defineEmits([
  'update:goalInput',
  'start',
  'stop',
  'clear',
  'sample'
])
</script>

<template>
  <div class="control-layout">
  <div class="control-main-column">
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
        :value="goalInput"
        class="input textarea goal-input"
        placeholder="比如：帮我搜索三年级分数加法练习题，找到一个合适的网页"
        rows="3"
        :disabled="running"
      ></textarea>

      <div class="button-group">
        <button
          class="btn btn-primary"
          @click="emit('start')"
          :disabled="running || !goalInput.trim()"
        >
          {{ running ? '正在帮你看网页...' : '开始操作网页' }}
        </button>
        <button class="btn btn-secondary" @click="emit('stop')" v-if="running">停止</button>
        <button class="btn btn-outline" @click="emit('clear')" v-if="!running && steps.length > 0">
          清空
        </button>
      </div>

      <div class="sample-row" v-if="!running && steps.length === 0">
        <button
          v-for="sample in controlSamples"
          :key="sample"
          class="sample-chip"
          @click="emit('sample', sample)"
        >
          {{ sample }}
        </button>
      </div>

      <div class="error-msg" v-if="friendlyError">
        {{ friendlyError }}
        <p v-if="rawError.includes('VISION_API_KEY')" class="config-hint">
          需要在 .env 里配置 VISION_API_KEY、VISION_BASE_URL、VISION_MODEL。
        </p>
      </div>
      <div class="answer-msg" v-if="answer && state === 'done'">{{ answer }}</div>
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

  <aside class="live-browser-column">
    <section class="card browser-card live-browser-card">
      <div class="browser-head">
        <div>
          <h2 class="section-title">实时网页</h2>
          <p class="url-text" v-if="currentUrl">
            {{ currentTitle || '当前网页' }} · {{ currentUrl }}
          </p>
          <p class="url-text" v-else>开始后这里会显示固定的实时网页区域</p>
        </div>
        <span class="live-badge">固定区域</span>
      </div>

      <div ref="browserBoxRef" class="live-browser-box" :class="{ empty: !screenshotSrc }">
        <img v-if="screenshotSrc" :src="screenshotSrc" alt="当前实时网页截图" />
        <div v-else class="screenshot-placeholder">
          <span class="book-icon">🖱️</span>
          <strong>还没有打开网页</strong>
          <small>点击“开始操作网页”后，会在这个固定区域显示实时网页。</small>
        </div>
      </div>
    </section>
  </aside>
</div>
</template>
