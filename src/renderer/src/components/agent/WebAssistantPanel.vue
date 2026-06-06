<script setup>
import { computed } from 'vue'

const props = defineProps({
  goalInput: { type: String, default: '' },
  browserPreview: Boolean,
  running: Boolean,
  state: { type: String, default: 'idle' },
  stateLabel: { type: Object, required: true },
  steps: { type: Array, default: () => [] },
  stepIndex: { type: Number, default: 0 },
  maxSteps: { type: Number, default: 15 },
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

const emit = defineEmits(['update:goalInput', 'start', 'stop', 'clear', 'sample'])

const latestStep = computed(() => props.steps[props.steps.length - 1] || null)
const progressPercent = computed(() => {
  if (!props.maxSteps) return 0
  return Math.min(100, Math.max(0, Math.round((props.stepIndex / props.maxSteps) * 100)))
})
const statusCopy = computed(() => {
  const map = {
    idle: '把想看的网页任务告诉小助手。',
    opening: '正在打开起始网页。',
    observing: '正在看当前网页内容。',
    looking: '正在看当前网页内容。',
    thinking: '正在思考下一步该点哪里。',
    acting: '正在慢慢操作网页。',
    settling: '正在等待页面加载稳定。',
    cancelling: '正在停止这次网页操作。',
    done: '已经完成这次任务。',
    error: '执行中遇到了问题。',
    cancelled: '这次操作已经停止。',
    timed_out: '步骤太多，已经自动停下。',
    blocked: '暂时不能继续执行，需要重新开始或在桌面窗口处理。'
  }
  return map[props.state] || '正在处理网页任务。'
})
const terminalStates = ['done', 'error', 'cancelled', 'timed_out', 'blocked']
const currentActionTitle = computed(() => {
  const map = {
    idle: '准备开始',
    opening: '启动内置浏览器',
    observing: '观察当前网页',
    looking: '观察当前网页',
    thinking: '思考下一步',
    acting: '执行网页动作',
    settling: '等待页面稳定',
    cancelling: '停止执行',
    done: '任务完成',
    error: '没有完成',
    cancelled: '已停止',
    timed_out: '步骤超时',
    blocked: '暂不能执行'
  }
  if (terminalStates.includes(props.state)) return map[props.state] || '已结束'
  if (latestStep.value?.actionLabel) return latestStep.value.actionLabel
  return map[props.state] || '处理中'
})
const currentActionDetail = computed(() => {
  if (props.state === 'error') {
    return props.friendlyError || '启动、网页加载或多模态模型调用时遇到了问题。'
  }
  if (props.state === 'done') {
    return props.answer || '可以在实时网页区域继续查看结果。'
  }
  if (props.state === 'cancelled') {
    return '这次网页操作已安全停止。'
  }
  if (props.state === 'timed_out') {
    return '步骤超过上限，可以把任务说得更具体再试。'
  }
  if (props.state === 'blocked') {
    return props.friendlyError || '当前无法继续执行，请重新开始或在桌面软件窗口处理。'
  }
  if (latestStep.value?.thought) return latestStep.value.thought
  if (props.browserPreview) {
    return '当前是普通浏览器预览，没有 Electron 内置浏览器能力。'
  }
  const map = {
    idle: '先输入任务，点击“开始执行”。',
    opening: '正在创建固定网页区域并打开搜索页，不是卡住。',
    observing: '正在截图并抽取可点击的按钮、输入框和链接。',
    looking: '正在截图并抽取可点击的按钮、输入框和链接。',
    thinking: '正在让多模态模型看截图和 DOM 线索。',
    acting: '正在点击、输入或滚动，动作会故意慢一点方便观察。',
    settling: '刚执行完一步，正在等网页加载完成。',
    cancelling: '已经收到停止请求，正在安全收尾。',
    done: '可以在实时网页区域继续查看结果。',
    cancelled: '这次网页操作已停止。',
    timed_out: '步骤超过上限，可以把任务说得更具体再试。',
    blocked: '当前无法继续执行，请重新开始或在桌面软件窗口处理。'
  }
  return map[props.state] || '小助手正在处理网页任务。'
})
const emptyStepsCopy = computed(() => {
  if (
    props.running ||
    ['opening', 'observing', 'thinking', 'acting', 'settling'].includes(props.state)
  ) {
    return '正在准备第一步，开始截图和判断后会出现在这里。'
  }
  if (props.state === 'error') return '还没来得及完成第一步，先看上面的错误原因。'
  return '还没开始。后面的每一步都会用普通话记录在这里。'
})
const showConfigHint = computed(() =>
  /VISION_API_KEY|GEMINI_API_KEY|GOOGLE_VERTEX|Google Cloud|gcloud|Vertex|Project ID|多模态模型|密钥|权限/i.test(
    `${props.rawError || ''} ${props.friendlyError || ''}`
  )
)
</script>

<template>
  <div class="control-console">
    <section class="card control-command-card">
      <div class="command-head">
        <div>
          <h2 class="section-title">网页小助手执行台</h2>
          <p class="helper-copy">输入目标后，小助手会固定在下面的大网页区域里一步步操作。</p>
        </div>
        <span class="state-pill" :class="'state-' + state" aria-live="polite">
          {{ stateLabel[state] || state }}
        </span>
      </div>

      <div class="command-body">
        <label class="goal-label" for="web-assistant-goal">这次要完成什么？</label>
        <textarea
          id="web-assistant-goal"
          :value="goalInput"
          class="input textarea goal-input"
          placeholder="比如：帮我搜索三年级分数加法练习题，找到一个合适的网页"
          rows="2"
          :disabled="running"
          @input="emit('update:goalInput', $event.target.value)"
        ></textarea>
        <div class="button-group command-actions">
          <button
            class="btn btn-primary"
            @click="emit('start')"
            :disabled="browserPreview || running || !goalInput.trim()"
          >
            {{ browserPreview ? '请打开桌面软件' : running ? '小助手正在操作…' : '开始执行' }}
          </button>
          <button class="btn btn-secondary" @click="emit('stop')" v-if="running">慢慢停下</button>
          <button
            class="btn btn-outline"
            @click="emit('clear')"
            v-if="!running && steps.length > 0"
          >
            清空
          </button>
        </div>
      </div>

      <div class="preview-hint" v-if="browserPreview">
        <strong>当前是浏览器预览</strong>
        <span>这里只能看页面排版；Computer Use 需要 Electron 桌面窗口的 BrowserView。</span>
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
    </section>

    <div class="control-workspace">
      <section class="card browser-card live-browser-card browser-stage-card">
        <div class="browser-head">
          <div>
            <h2 class="section-title">实时网页</h2>
            <p class="url-text" v-if="currentUrl">
              {{ currentTitle || '当前网页' }} · {{ currentUrl }}
            </p>
            <p class="url-text" v-else>这里是固定的网页操作区域，不会跳到外部浏览器。</p>
          </div>
          <span class="live-badge">固定实时区域</span>
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
            <small>点击“开始执行”后，网页会固定显示在这里。</small>
          </div>
        </div>
      </section>

      <aside class="assistant-rail">
        <section class="card assistant-status-card">
          <div class="steps-header">
            <div>
              <h2 class="section-title">小助手状态</h2>
              <p class="url-text">{{ statusCopy }}</p>
            </div>
            <span class="step-count">{{ stepIndex }} / {{ maxSteps }}</span>
          </div>

          <div class="progress-track" aria-hidden="true">
            <span :style="{ width: progressPercent + '%' }"></span>
          </div>

          <div class="current-action-card">
            <small>当前动作</small>
            <strong>{{ currentActionTitle }}</strong>
            <p>{{ currentActionDetail }}</p>
          </div>

          <div class="error-msg" v-if="friendlyError" aria-live="polite">
            {{ friendlyError }}
            <p v-if="showConfigHint" class="config-hint">
              本项目默认走 gcloud / Google Vertex 多模态理解：确认已设置
              VISION_PROVIDER=google-vertex、GOOGLE_VERTEX_PROJECT，并完成 gcloud auth login。
            </p>
          </div>
          <div class="answer-msg" v-if="answer && state === 'done'" aria-live="polite">
            {{ answer }}
          </div>
        </section>

        <section class="card steps-card">
          <div class="steps-header">
            <h2 class="section-title">执行步骤</h2>
            <span class="step-count">{{ steps.length }} 步</span>
          </div>

          <div class="empty-steps" v-if="steps.length === 0">
            {{ emptyStepsCopy }}
          </div>

          <div class="steps-list" v-else>
            <div v-for="step in steps" :key="step.id" class="step-item">
              <div class="step-num" :class="'step-' + step.status">
                {{
                  step.status === 'done'
                    ? '✓'
                    : step.status === 'error'
                      ? '!'
                      : step.status === 'cancelled'
                        ? '×'
                        : step.id
                }}
              </div>
              <div class="step-body">
                <div class="step-thinking">{{ step.thought }}</div>
                <div class="step-action">{{ step.actionLabel }}</div>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>

    <details class="card dom-debug-card debug-details">
      <summary>
        <span>调试信息 / 页面线索</span>
        <small>{{ domCandidates.length }} / {{ domElementCount }} 个可操作元素</small>
      </summary>

      <div class="empty-steps" v-if="domCandidates.length === 0">
        还没有页面线索。开始后会显示搜索框、按钮、链接等可操作元素。
      </div>

      <div class="dom-list" v-else>
        <div v-for="item in domCandidates" :key="item.id" class="dom-item">
          <div class="dom-id">{{ item.id }}</div>
          <div class="dom-main">
            <div class="dom-title">
              <strong>{{ item.role }}/{{ item.tag }}</strong>
              <span>{{ item.domain || '页面内' }}</span>
              <small
                >score {{ item.score }} · center ({{ item.center.x }}, {{ item.center.y }})</small
              >
            </div>
            <div class="dom-label">{{ item.label }}</div>
            <div class="dom-meta">
              <span>{{ item.size.width }}×{{ item.size.height }}</span>
              <span v-for="flag in item.flags" :key="item.id + flag">{{ flag }}</span>
              <span v-if="item.href">{{ item.href }}</span>
            </div>
          </div>
        </div>
      </div>
    </details>
  </div>
</template>
