<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const taskInput = ref('')
const running = ref(false)
const state = ref('idle')
const steps = ref([])
const stepCount = ref(0)
const error = ref('')
const pendingConfirm = ref(null)

let cleanupUpdate = null
let cleanupConfirm = null

const stateText = computed(() => {
  const map = {
    idle: '待命',
    thinking: '规划中',
    executing: '执行命令',
    browsing: '读取网页',
    observing: '观察屏幕',
    waiting_confirm: '等待确认',
    done: '完成',
    error: '出错',
    stopped: '已停止'
  }
  return map[state.value] || state.value
})

const canStart = computed(() => Boolean(taskInput.value.trim()) && !running.value)

function ensureListeners() {
  if (!cleanupUpdate && window.agent?.onUpdate) {
    cleanupUpdate = window.agent.onUpdate((data) => {
      state.value = data?.state || state.value
      steps.value = Array.isArray(data?.steps) ? data.steps : steps.value
      stepCount.value = Number(data?.stepCount || steps.value.length || 0)
    })
  }
  if (!cleanupConfirm && window.agent?.onConfirm) {
    cleanupConfirm = window.agent.onConfirm((data) => {
      pendingConfirm.value = {
        command: data?.command || '',
        reason: data?.reason || '该操作需要确认'
      }
    })
  }
}

async function start() {
  if (!canStart.value) return
  if (!window.agent?.start) {
    error.value = '电脑 Agent 还没有准备好'
    return
  }
  ensureListeners()
  running.value = true
  error.value = ''
  pendingConfirm.value = null
  steps.value = []
  state.value = 'thinking'
  try {
    const result = await window.agent.start(taskInput.value.trim())
    if (!result?.success) {
      error.value = result?.error || '任务执行失败'
    }
  } catch (err) {
    error.value = err?.message || '任务启动失败'
  } finally {
    running.value = false
    pendingConfirm.value = null
  }
}

async function stop() {
  try {
    await window.agent?.stop?.()
  } finally {
    running.value = false
    pendingConfirm.value = null
    state.value = 'stopped'
  }
}

async function answerConfirm(approved) {
  await window.agent?.confirmResult?.(approved)
  pendingConfirm.value = null
}

function loadSample(text) {
  if (running.value) return
  taskInput.value = text
}

onBeforeUnmount(() => {
  cleanupUpdate?.()
  cleanupConfirm?.()
  cleanupUpdate = null
  cleanupConfirm = null
})
</script>

<template>
  <section class="computer-agent">
    <div class="agent-hero card">
      <div>
        <span class="agent-kicker">Sandbox-first</span>
        <h2>电脑 Agent</h2>
        <p>
          先用已有沙箱执行命令、读文件、查状态；只有命令看不懂
          GUI/弹窗时，才调用多模态观察真实屏幕。
        </p>
      </div>
      <span class="state-pill" :class="`state-${state}`">{{ stateText }}</span>
    </div>

    <div class="task-card card">
      <label class="task-label">你想让电脑 Agent 做什么？</label>
      <textarea
        v-model="taskInput"
        class="task-input"
        rows="3"
        :disabled="running"
        placeholder="例如：检查这个项目为什么启动失败，先用命令排查；如果需要看界面再观察屏幕。"
      ></textarea>
      <div class="sample-row">
        <button
          type="button"
          @click="loadSample('检查当前 XueMate 项目能不能正常构建，并指出失败原因')"
        >
          检查构建
        </button>
        <button
          type="button"
          @click="loadSample('查看当前应用是否真的启动，命令不够时观察屏幕状态')"
        >
          检查启动
        </button>
        <button type="button" @click="loadSample('帮我扫描当前目录哪些文件可能不该提交')">
          扫描提交
        </button>
      </div>
      <div class="action-row">
        <button class="btn btn-primary" type="button" :disabled="!canStart" @click="start">
          {{ running ? '执行中…' : '启动电脑 Agent' }}
        </button>
        <button class="btn btn-outline" type="button" :disabled="!running" @click="stop">
          停止
        </button>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>

    <div v-if="pendingConfirm" class="confirm-card card">
      <strong>需要确认后再执行</strong>
      <p>{{ pendingConfirm.reason }}</p>
      <pre>{{ pendingConfirm.command }}</pre>
      <div class="action-row">
        <button class="btn btn-primary" type="button" @click="answerConfirm(true)">允许</button>
        <button class="btn btn-outline" type="button" @click="answerConfirm(false)">跳过</button>
      </div>
    </div>

    <div class="steps-card card">
      <div class="steps-head">
        <strong>执行过程</strong>
        <span>{{ stepCount }} 步</span>
      </div>
      <div v-if="steps.length === 0" class="empty-steps">
        还没有执行。启动后会在这里显示 sandbox 命令、网页读取和屏幕观察结果。
      </div>
      <div v-for="step in steps" :key="step.id" class="step-item" :class="`step-${step.status}`">
        <div class="step-top">
          <span class="step-id">#{{ step.id }}</span>
          <strong>{{ step.thinking || '执行步骤' }}</strong>
          <em>{{ step.status }}</em>
        </div>
        <code>{{ step.command }}</code>
        <pre v-if="step.output">{{ step.output }}</pre>
      </div>
    </div>
  </section>
</template>

<style scoped>
.computer-agent {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  background: linear-gradient(135deg, #ffffff 0%, #f8fff1 100%);
  border-color: rgba(88, 204, 2, 0.22);
}

.agent-kicker {
  display: inline-flex;
  margin-bottom: 8px;
  padding: 4px 9px;
  border-radius: 999px;
  background: #eef9e8;
  color: #2f7a12;
  font-size: 11px;
  font-weight: 1000;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.agent-hero h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  color: var(--xm-text);
}

.agent-hero p,
.confirm-card p,
.empty-steps {
  color: var(--xm-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.state-pill {
  padding: 7px 12px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  font-weight: 1000;
  white-space: nowrap;
}

.state-done {
  background: #dcfce7;
  color: #166534;
}

.state-error,
.state-stopped {
  background: #fee2e2;
  color: #991b1b;
}

.task-label {
  display: block;
  color: var(--xm-text);
  font-size: 13px;
  font-weight: 1000;
  margin-bottom: 8px;
}

.task-input {
  width: 100%;
  border: 1px solid var(--xm-border);
  border-radius: 16px;
  padding: 12px 14px;
  resize: vertical;
  outline: none;
  font-family: var(--xm-font);
  font-size: 14px;
}

.task-input:focus {
  border-color: var(--xm-green);
  box-shadow: 0 0 0 4px rgba(88, 204, 2, 0.12);
}

.sample-row,
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.sample-row button {
  border: 1px solid #d6ead0;
  border-radius: 999px;
  padding: 7px 11px;
  background: #f4fbf1;
  color: #2f7a12;
  font-weight: 900;
  cursor: pointer;
}

.error-text {
  margin-top: 10px;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 900;
}

.confirm-card {
  border-color: #fbbf24;
  background: #fffbeb;
}

.confirm-card pre,
.step-item pre {
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}

.confirm-card pre {
  padding: 10px;
  border-radius: 12px;
  background: white;
  color: #78350f;
}

.steps-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.step-item {
  border: 1px solid var(--xm-border);
  border-radius: 16px;
  padding: 12px;
  margin-top: 10px;
  background: white;
}

.step-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.step-id {
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 1000;
}

.step-top strong {
  flex: 1;
  color: var(--xm-text);
}

.step-top em {
  font-style: normal;
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 900;
}

.step-item code {
  display: block;
  padding: 8px 10px;
  border-radius: 12px;
  background: #f8fafc;
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.step-item pre {
  margin: 8px 0 0;
  max-height: 240px;
  padding: 10px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
}

.step-error {
  border-color: #fecaca;
}

.step-done {
  border-color: #bbf7d0;
}
</style>
