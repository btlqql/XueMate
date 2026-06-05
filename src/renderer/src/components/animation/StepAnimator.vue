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
    if (typeof s === 'string') return { title: `步骤 ${i + 1}`, desc: s }
    return {
      title: s.title || s.t || `步骤 ${i + 1}`,
      desc: s.desc || s.d || '',
      items: Array.isArray(s.items) ? s.items : []
    }
  })
})
const totalSteps = computed(() => steps.value.length)
const activeStep = computed(() => steps.value[currentStep.value] || null)

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
  }, 1200)
}

onUnmounted(() => {
  if (playTimer) clearInterval(playTimer)
})
</script>

<template>
  <div class="step-animator">
    <div class="anim-title" v-if="title">{{ title }}</div>

    <div class="step-track" v-if="totalSteps > 0">
      <div
        v-for="(step, i) in steps"
        :key="i"
        class="step-node"
        :class="{ active: i === currentStep, done: i < currentStep }"
      >
        <span class="step-dot">{{ i + 1 }}</span>
        <span class="step-label">{{ step.title }}</span>
      </div>
    </div>

    <div class="step-card" v-if="activeStep">
      <div class="step-card-title">{{ activeStep.title }}</div>
      <p class="step-card-desc" v-if="activeStep.desc">{{ activeStep.desc }}</p>
      <ul class="step-items" v-if="activeStep.items.length > 0">
        <li v-for="(item, i) in activeStep.items" :key="i">{{ item }}</li>
      </ul>
    </div>

    <div class="anim-empty" v-else>动画数据为空</div>

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
.step-animator {
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

.step-track {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 14px 16px 10px;
}

.step-node {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: max-content;
  padding: 8px 10px;
  border-radius: var(--xm-radius-pill);
  background: white;
  border: 1px solid var(--xm-border);
  color: var(--xm-text-light);
  font-size: 12px;
  font-weight: 700;
}

.step-node.active {
  border-color: var(--xm-green);
  color: var(--xm-green-dark);
  box-shadow: 0 0 0 3px rgba(88, 204, 2, 0.12);
}

.step-node.done {
  background: var(--xm-success-bg);
  border-color: #bbf7d0;
  color: var(--xm-success-text);
}

.step-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eee;
  color: inherit;
}

.step-node.active .step-dot,
.step-node.done .step-dot {
  background: var(--xm-green);
  color: white;
}

.step-card {
  margin: 0 16px 12px;
  padding: 14px 16px;
  background: white;
  border-radius: var(--xm-radius-sm);
  border: 1px solid var(--xm-border);
}

.step-card-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--xm-text);
}

.step-card-desc {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: #555;
}

.step-items {
  margin: 8px 0 0;
  padding-left: 20px;
  color: #555;
  font-size: 14px;
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
