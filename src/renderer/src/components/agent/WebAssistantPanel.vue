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
  domElementCount: { type: Number, default: 0 },
  setBrowserBoxElement: { type: Function, default: () => {} }
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
            <h2 class="section-title">这次要看哪个网页任务？</h2>
            <p class="helper-copy">
              适合搜索、打开链接、滚动页面。每一步都会留在下面，方便回看。
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
          @input="emit('update:goalInput', $event.target.value)"
        ></textarea>

        <div class="button-group">
          <button
            class="btn btn-primary"
            @click="emit('start')"
            :disabled="running || !goalInput.trim()"
          >
            {{ running ? '正在查看网页...' : '开始查看' }}
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
            请先补充网页查看配置，再重新打开这一项。
          </p>
        </div>
        <div class="answer-msg" v-if="answer && state === 'done'">{{ answer }}</div>
      </section>

      <section class="card dom-debug-card">
        <div class="steps-header">
          <div>
            <h2 class="section-title">页面线索</h2>
            <p class="url-text">这里列出当前页面里可能会用到的按钮、输入框和链接。</p>
          </div>
          <span class="step-count">{{ domCandidates.length }} / {{ domElementCount }} 个</span>
        </div>

        <div class="empty-steps" v-if="domCandidates.length === 0">
          还没有页面线索。开始后会显示搜索框、按钮、链接等可操作元素。
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
          <h2 class="section-title">操作记录</h2>
          <span class="step-count">{{ steps.length }} 步</span>
        </div>

        <div class="empty-steps" v-if="steps.length === 0">
          还没开始。后面的每一步都会记录在这里。
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
            <p class="url-text" v-else>开始后，这里会固定显示当前网页</p>
          </div>
          <span class="live-badge">固定区域</span>
        </div>

        <div
          :ref="setBrowserBoxElement"
          class="live-browser-box"
          :class="{ empty: !screenshotSrc }"
        >
          <img v-if="screenshotSrc" :src="screenshotSrc" alt="当前实时网页截图" />
          <div v-else class="screenshot-placeholder">
            <span class="book-icon">🖱️</span>
            <strong>还没有打开网页</strong>
            <small>点击“开始查看”后，网页会显示在这个固定区域。</small>
          </div>
        </div>
      </section>
    </aside>
  </div>
</template>
