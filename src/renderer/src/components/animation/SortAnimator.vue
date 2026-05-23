<script setup>
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
  title: { type: String, default: '' }
})

const currentStep = ref(-1)
const isPlaying = ref(false)
let playTimer = null

const W = 500,
  H = 280,
  PAD = 40
const steps = computed(() => props.data?.steps || [])
const totalSteps = computed(() => steps.value.length)

// 还原到某一步的数组状态
function arrayAtStep(idx) {
  const init = [...(props.data?.array || [])]
  if (idx < 0) return init
  let arr = [...init]
  for (let s = 0; s <= idx && s < steps.value.length; s++) {
    const step = steps.value[s]
    if (step.a === 'swap' && step.r) arr = [...step.r]
    if (step.a === 'done' && step.r) arr = [...step.r]
  }
  return arr
}

const currentArray = computed(() => arrayAtStep(currentStep.value))
const currentAction = computed(() => {
  if (currentStep.value < 0 || currentStep.value >= steps.value.length) return null
  return steps.value[currentStep.value]
})

const maxVal = computed(() => Math.max(...(props.data?.array || [1]), 1))
const barCount = computed(() => (props.data?.array || []).length)
const barW = computed(() => (barCount.value > 0 ? ((W - PAD * 2) / barCount.value) * 0.7 : 40))

// 已排序的索引集合
const sortedIndices = computed(() => {
  const set = new Set()
  for (let s = 0; s <= currentStep.value && s < steps.value.length; s++) {
    const step = steps.value[s]
    if (step.a === 'sorted' && step.i != null) set.add(step.i)
    if (step.a === 'done') {
      const arr = props.data?.array || []
      for (let k = 0; k < arr.length; k++) set.add(k)
    }
  }
  return set
})

// 每个柱子的颜色
function barColor(idx) {
  const act = currentAction.value
  if (sortedIndices.value.has(idx)) return '#4CAF50'
  if (act && act.a === 'compare' && (idx === act.i || idx === act.j)) return '#2196F3'
  if (act && act.a === 'swap' && (idx === act.i || idx === act.j)) return '#FF5722'
  return '#e0e0e0'
}

// 柱子 x 坐标
function barX(idx) {
  const totalW = W - PAD * 2
  const unitW = barCount.value > 0 ? totalW / barCount.value : 50
  return PAD + idx * unitW + (unitW - barW.value) / 2
}

// 柱子高度
function barH(val) {
  return (val / maxVal.value) * (H - PAD * 2 - 30)
}

// 步骤说明
const stepDesc = computed(() => currentAction.value?.d || '')

// 控制
function nextStep() {
  if (currentStep.value < totalSteps.value - 1) currentStep.value++
}
function prevStep() {
  if (currentStep.value >= 0) currentStep.value--
}
function reset() {
  currentStep.value = -1
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
  if (currentStep.value >= totalSteps.value - 1) currentStep.value = -1
  isPlaying.value = true
  playTimer = setInterval(() => {
    if (currentStep.value >= totalSteps.value - 1) {
      isPlaying.value = false
      clearInterval(playTimer)
      playTimer = null
      return
    }
    nextStep()
  }, 800)
}

onUnmounted(() => {
  if (playTimer) clearInterval(playTimer)
})
</script>

<template>
  <div class="sort-animator">
    <div class="anim-title" v-if="title">{{ title }}</div>
    <div class="anim-desc" v-if="stepDesc">{{ stepDesc }}</div>
    <svg :viewBox="`0 0 ${W} ${H}`" class="anim-svg">
      <!-- 柱子 -->
      <rect
        v-for="(val, i) in currentArray"
        :key="i"
        :x="barX(i)"
        :y="H - PAD - barH(val)"
        :width="barW"
        :height="barH(val)"
        :fill="barColor(i)"
        rx="4"
      />
      <!-- 数值标签 -->
      <text
        v-for="(val, i) in currentArray"
        :key="'t' + i"
        :x="barX(i) + barW / 2"
        :y="H - PAD - barH(val) - 6"
        text-anchor="middle"
        font-size="14"
        font-weight="700"
        fill="#333"
      >
        {{ val }}
      </text>
      <!-- 索引标签 -->
      <text
        v-for="(_, i) in currentArray"
        :key="'i' + i"
        :x="barX(i) + barW / 2"
        :y="H - 10"
        text-anchor="middle"
        font-size="11"
        fill="#999"
      >
        [{{ i }}]
      </text>
    </svg>
    <div class="anim-controls">
      <button class="ctrl-btn" @click="reset" title="重置">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
      <button class="ctrl-btn" @click="prevStep" :disabled="currentStep < 0" title="上一步">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button class="ctrl-btn play-btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
        <svg v-if="!isPlaying" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      </button>
      <button
        class="ctrl-btn"
        @click="nextStep"
        :disabled="currentStep >= totalSteps - 1"
        title="下一步"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <span class="step-indicator">{{ currentStep + 1 }} / {{ totalSteps }}</span>
    </div>
  </div>
</template>

<style scoped>
.sort-animator {
  background: #fafafa;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  overflow: hidden;
  margin: 8px 0;
}
.anim-title {
  padding: 10px 16px 0;
  font-weight: 700;
  font-size: 15px;
  color: #333;
}
.anim-desc {
  padding: 4px 16px 0;
  font-size: 13px;
  color: #666;
  min-height: 20px;
}
.anim-svg {
  display: block;
  width: 100%;
  height: auto;
  padding: 8px;
}
.anim-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border-top: 1px solid #e5e5e5;
}
.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  color: #555;
  transition: all 0.15s;
}
.ctrl-btn:hover:not(:disabled) {
  border-color: var(--xm-green);
  color: var(--xm-green);
  background: #f0fdf4;
}
.ctrl-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.play-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--xm-green);
  border: none;
  color: white;
}
.play-btn:hover:not(:disabled) {
  background: #16a34a;
  color: white;
}
.step-indicator {
  font-size: 12px;
  color: #999;
  font-weight: 600;
  margin-left: 8px;
  min-width: 40px;
  text-align: center;
}
</style>
