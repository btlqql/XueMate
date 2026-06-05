<script setup>
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
  title: { type: String, default: '' }
})

const currentStep = ref(0)
const isPlaying = ref(false)
let playTimer = null

const steps = computed(() => {
  const raw = props.data?.steps || []
  return raw.map((s, i) => {
    if (typeof s === 'string') return { expr: s, desc: `第 ${i + 1} 步` }
    return {
      expr: s.expr || s.e || '',
      from: s.from || '',
      to: s.to || '',
      desc: s.desc || s.d || '',
      rule: s.rule || s.r || '',
      focus: s.focus || ''
    }
  })
})

const totalSteps = computed(() => steps.value.length)
const activeStep = computed(() => steps.value[currentStep.value] || null)
const problem = computed(() => props.data?.problem || props.data?.question || '')
const result = computed(() => props.data?.result || '')

function nextStep() {
  if (currentStep.value < totalSteps.value - 1) currentStep.value++
}

function prevStep() {
  if (currentStep.value > 0) currentStep.value--
}

function reset() {
  currentStep.value = 0
  isPlaying.value = false
  clearInterval(playTimer)
  playTimer = null
}

function togglePlay() {
  if (isPlaying.value) {
    isPlaying.value = false
    clearInterval(playTimer)
    playTimer = null
    return
  }

  if (currentStep.value >= totalSteps.value - 1) currentStep.value = 0
  isPlaying.value = true
  playTimer = setInterval(() => {
    if (currentStep.value >= totalSteps.value - 1) {
      isPlaying.value = false
      clearInterval(playTimer)
      playTimer = null
      return
    }
    nextStep()
  }, 1300)
}

function displayExpression(step) {
  if (!step) return ''
  if (step.expr) return step.expr
  if (step.from || step.to) return `${step.from || ''}  ⇒  ${step.to || ''}`
  return ''
}

onUnmounted(() => {
  if (playTimer) clearInterval(playTimer)
})
</script>

<template>
  <div class="formula-animator">
    <div class="anim-title" v-if="title">{{ title }}</div>

    <div class="problem-box" v-if="problem">
      <span class="problem-label">题目</span>
      <span class="formula-text">{{ problem }}</span>
    </div>

    <div class="formula-stage" v-if="activeStep">
      <div class="step-badge">Step {{ currentStep + 1 }}</div>
      <div class="formula-main">{{ displayExpression(activeStep) }}</div>
      <div class="formula-focus" v-if="activeStep.focus">关注：{{ activeStep.focus }}</div>
      <div class="formula-rule" v-if="activeStep.rule">规则：{{ activeStep.rule }}</div>
      <p class="formula-desc" v-if="activeStep.desc">{{ activeStep.desc }}</p>
    </div>

    <div class="formula-list" v-if="totalSteps > 0">
      <button
        v-for="(step, i) in steps"
        :key="i"
        class="formula-step"
        :class="{ active: i === currentStep, done: i < currentStep }"
        @click="currentStep = i"
      >
        <span class="step-num">{{ i + 1 }}</span>
        <span class="step-expr">{{ displayExpression(step) }}</span>
      </button>
    </div>

    <div class="result-box" v-if="result">
      <span class="result-label">结果</span>
      <span class="formula-text">{{ result }}</span>
    </div>

    <div class="anim-empty" v-if="totalSteps === 0">公式动画数据为空</div>

    <div class="anim-controls" v-if="totalSteps > 0">
      <button class="ctrl-btn" @click="reset" title="重置">↺</button>
      <button class="ctrl-btn" @click="prevStep" :disabled="currentStep <= 0" title="上一步">
        ‹
      </button>
      <button class="ctrl-btn play-btn" @click="togglePlay">
        {{ isPlaying ? '暂停' : '播放' }}
      </button>
      <button
        class="ctrl-btn"
        @click="nextStep"
        :disabled="currentStep >= totalSteps - 1"
        title="下一步"
      >
        ›
      </button>
      <span class="step-indicator">{{ currentStep + 1 }} / {{ totalSteps }}</span>
    </div>
  </div>
</template>

<style scoped>
.formula-animator {
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius);
  overflow: hidden;
  margin: 8px 0;
}

.anim-title {
  padding: 12px 16px 0;
  font-weight: 800;
  font-size: 15px;
  color: var(--xm-text);
}

.problem-box,
.result-box {
  margin: 12px 16px 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--xm-radius-sm);
  background: white;
  border: 1px solid var(--xm-border);
}

.problem-label,
.result-label {
  font-size: 12px;
  font-weight: 800;
  color: white;
  background: #2196f3;
  border-radius: var(--xm-radius-pill);
  padding: 3px 8px;
}

.result-label {
  background: var(--xm-green);
}

.formula-text,
.formula-main,
.step-expr {
  font-family: ui-serif, Georgia, 'Times New Roman', 'STIX Two Text', serif;
}

.formula-stage {
  margin: 12px 16px;
  padding: 18px 16px;
  background: linear-gradient(135deg, #ffffff, #f0fdf4);
  border: 2px solid rgba(88, 204, 2, 0.22);
  border-radius: var(--xm-radius);
  text-align: center;
}

.step-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 10px;
}

.formula-main {
  font-size: 28px;
  font-weight: 800;
  color: #222;
  line-height: 1.4;
  word-break: break-word;
}

.formula-focus,
.formula-rule {
  display: inline-block;
  margin: 10px 4px 0;
  padding: 5px 10px;
  border-radius: var(--xm-radius-pill);
  background: #eff6ff;
  color: var(--xm-info-text);
  font-size: 12px;
  font-weight: 700;
}

.formula-rule {
  background: #fff7ed;
  color: #c2410c;
}

.formula-desc {
  margin: 10px 0 0;
  color: #555;
  font-size: 14px;
  line-height: 1.6;
}

.formula-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px 12px;
}

.formula-step {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  background: white;
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
  color: #555;
}

.formula-step.active {
  border-color: var(--xm-green);
  box-shadow: 0 0 0 3px rgba(88, 204, 2, 0.12);
}

.formula-step.done {
  background: #f0fdf4;
}

.step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #eee;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.formula-step.active .step-num,
.formula-step.done .step-num {
  background: var(--xm-green);
  color: white;
}

.step-expr {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anim-empty {
  padding: 14px 16px;
  color: var(--xm-text-muted);
  font-size: 13px;
}

.anim-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border-top: 1px solid var(--xm-border);
}

.ctrl-btn {
  border: 1px solid #ddd;
  border-radius: var(--xm-radius-sm);
  background: white;
  cursor: pointer;
  min-width: 32px;
  height: 30px;
  padding: 0 10px;
  color: #555;
  font-weight: 700;
}

.ctrl-btn:hover:not(:disabled) {
  border-color: var(--xm-green);
  color: var(--xm-green-dark);
}

.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.play-btn {
  color: white;
  background: var(--xm-green);
  border-color: var(--xm-green);
}

.step-indicator {
  font-size: 12px;
  color: var(--xm-text-light);
  font-weight: 700;
}
</style>
