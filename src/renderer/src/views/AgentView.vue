<script setup>
import { ref, onUnmounted, watch } from 'vue'

const taskInput = ref('')
const running = ref(false)
const steps = ref([])
const state = ref('idle')
const error = ref('')
const currentUrl = ref('')

// 确认弹窗
const showConfirm = ref(false)
const confirmCommand = ref('')
const confirmReason = ref('')

let removeUpdateListener = null
let removeConfirmListener = null

const sampleTask = '搜索 Python sorted 函数的用法，然后写一个排序示例脚本'

const loadSample = () => { taskInput.value = sampleTask }

// 监听状态变化，显示当前 URL
watch(state, (newState) => {
  if (newState === 'browsing') {
    const lastStep = steps.value[steps.value.length - 1]
    if (lastStep) {
      const cmd = lastStep.command
      if (cmd.startsWith('搜索:')) currentUrl.value = '搜索: ' + cmd.replace('搜索:', '').trim()
      else if (cmd.startsWith('打开:')) currentUrl.value = cmd.replace('打开:', '').trim()
    }
  }
})

const startTask = async () => {
  if (!taskInput.value.trim()) return
  running.value = true
  steps.value = []
  state.value = 'thinking'
  error.value = ''
  showConfirm.value = false

  removeUpdateListener = window.agent.onUpdate((data) => {
    state.value = data.state
    steps.value = data.steps
  })

  removeConfirmListener = window.agent.onConfirm((data) => {
    confirmCommand.value = data.command
    confirmReason.value = data.reason
    showConfirm.value = true
    state.value = 'waiting_confirm'
  })

  const result = await window.agent.start(taskInput.value)

  if (!result.success && result.error !== '用户停止') {
    error.value = result.error || '执行失败'
  }

  running.value = false
  showConfirm.value = false
  cleanup()
}

const approveCommand = async () => {
  showConfirm.value = false
  await window.agent.confirmResult(true)
}

const rejectCommand = async () => {
  showConfirm.value = false
  await window.agent.confirmResult(false)
}

const stopTask = async () => {
  await window.agent.stop()
  running.value = false
  state.value = 'stopped'
  showConfirm.value = false
  cleanup()
}

const clearAll = () => {
  taskInput.value = ''
  steps.value = []
  running.value = false
  state.value = 'idle'
  error.value = ''
}

const cleanup = () => {
  if (removeUpdateListener) { removeUpdateListener(); removeUpdateListener = null }
  if (removeConfirmListener) { removeConfirmListener(); removeConfirmListener = null }
}

onUnmounted(() => {
  cleanup()
  closeBrowser()
})

const stateLabel = {
  idle: '空闲',
  thinking: '思考中...',
  executing: '执行中...',
  browsing: '浏览网页...',
  waiting_confirm: '等待确认',
  done: '已完成',
  error: '出错',
  stopped: '已停止'
}
</script>

<template>
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">智能助手</h1>
      <p class="page-desc">告诉 AI 你想做什么，它会用命令行帮你完成</p>
    </div>

    <div class="agent-layout">
      <!-- 输入区 -->
      <div class="card">
        <h2 class="section-title">任务描述</h2>
        <textarea
          v-model="taskInput"
          class="input textarea"
          placeholder="描述你想做的事情，比如：搜索 Python 排序用法，然后写个示例..."
          rows="3"
        ></textarea>
        <div class="button-group">
          <button class="btn btn-primary" @click="startTask" :disabled="running || !taskInput.trim()">
            {{ running ? '执行中...' : '开始执行' }}
          </button>
          <button class="btn btn-secondary" @click="stopTask" v-if="running">停止</button>
          <button class="btn btn-outline" @click="loadSample" v-if="!running && steps.length === 0">示例</button>
          <button class="btn btn-outline" @click="clearAll" v-if="steps.length > 0 && !running">清空</button>
          <span class="state-tag" :class="'state-' + state">{{ stateLabel[state] || state }}</span>
        </div>
        <div class="error-msg" v-if="error">{{ error }}</div>
      </div>

      <!-- 确认弹窗 -->
      <div class="card confirm-card" v-if="showConfirm">
        <div class="confirm-header">
          <span class="confirm-icon">⚠️</span>
          <h3 class="confirm-title">需要确认</h3>
        </div>
        <div class="confirm-reason">{{ confirmReason }}</div>
        <div class="confirm-command">
          <span class="prompt-sign">$</span>
          <code>{{ confirmCommand }}</code>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-primary" @click="approveCommand">批准执行</button>
          <button class="btn btn-outline" @click="rejectCommand">跳过</button>
        </div>
      </div>

      <!-- 执行步骤 -->
      <div class="card" v-if="steps.length > 0">
        <div class="steps-header">
          <h2 class="section-title">执行过程</h2>
          <span class="step-count">{{ steps.length }} 步</span>
        </div>

        <div class="steps-list">
          <div v-for="step in steps" :key="step.id" class="step-item">
            <div class="step-num" :class="{
              'step-running': step.status === 'running',
              'step-done': step.status === 'done',
              'step-error': step.status === 'error',
              'step-blocked': step.status === 'blocked' || step.status === 'skipped'
            }">
              {{ step.status === 'blocked' ? '✕' : step.status === 'skipped' ? '—' : step.id }}
            </div>

            <div class="step-body">
              <div class="step-thinking">
                <span class="thinking-icon">💡</span>
                {{ step.thinking }}
              </div>

              <div class="step-command" :class="{ 'cmd-blocked': step.status === 'blocked' }">
                <span class="prompt-sign">$</span>
                <code>{{ step.command }}</code>
                <span class="cmd-level" v-if="step.level === 'safe'">安全</span>
                <span class="cmd-level level-confirm" v-if="step.level === 'confirm'">需确认</span>
                <span class="cmd-level level-blocked" v-if="step.level === 'blocked'">禁止</span>
              </div>

              <div class="step-output" v-if="step.output">
                <pre>{{ step.output }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div class="done-banner" v-if="state === 'done'">
          <span class="done-icon">✓</span>
          <span>任务完成</span>
        </div>
        <div class="done-banner stopped-banner" v-if="state === 'stopped'">
          <span class="done-icon">■</span>
          <span>已停止</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div class="card" v-if="steps.length === 0 && !running">
        <h2 class="section-title">功能说明</h2>
        <div class="feature-grid">
          <div class="feature">
            <strong>联网搜索</strong>
            <p>自动搜索网页、获取信息辅助决策</p>
          </div>
          <div class="feature">
            <strong>文件操作</strong>
            <p>创建、移动、重命名文件和文件夹</p>
          </div>
          <div class="feature">
            <strong>代码执行</strong>
            <p>运行脚本、查看输出、调试问题</p>
          </div>
          <div class="feature">
            <strong>安全沙箱</strong>
            <p>危险命令需确认，禁止高危操作</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 浏览中状态提示 -->
    <div class="browsing-hint" v-if="state === 'browsing'">
      <span class="browsing-dot"></span>
      正在浏览: {{ currentUrl }}
    </div>
  </div>
</template>

<style scoped>
.agent-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  align-items: center;
}

.state-tag {
  margin-left: auto;
  padding: 4px 14px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  background: #f7f7f7;
  color: #999;
}

.state-thinking { background: #dbeafe; color: #1d4ed8; }
.state-executing { background: #fef9c3; color: #854d0e; }
.state-browsing { background: #e0e7ff; color: #3730a3; }
.state-waiting_confirm { background: #fef3c7; color: #92400e; }
.state-done { background: #dcfce7; color: #166534; }
.state-error { background: #fee2e2; color: #991b1b; }
.state-stopped { background: #f3f4f6; color: #6b7280; }

/* 确认弹窗 */
.confirm-card {
  border: 3px solid #f59e0b;
  background: #fffbeb;
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.confirm-icon { font-size: 20px; }
.confirm-title { font-size: 16px; font-weight: 800; color: #92400e; margin: 0; }

.confirm-reason {
  font-size: 14px;
  font-weight: 600;
  color: #78350f;
  margin-bottom: 12px;
}

.confirm-command {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: #1a1a2e;
  border-radius: 8px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  margin-bottom: 16px;
}

.confirm-command code { color: #e0e0e0; white-space: pre; }

.confirm-actions {
  display: flex;
  gap: 10px;
}

/* 步骤区域 */
.steps-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.step-count {
  font-size: 13px;
  font-weight: 700;
  color: #999;
  padding: 4px 12px;
  background: #f7f7f7;
  border-radius: 9999px;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-item {
  display: flex;
  gap: 14px;
}

.step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  flex-shrink: 0;
  background: #e5e5e5;
  color: #999;
}

.step-num.step-done { background: var(--xm-green); color: white; }
.step-num.step-error { background: var(--xm-red); color: white; }
.step-num.step-blocked { background: #f59e0b; color: white; }
.step-num.step-running {
  background: var(--xm-blue);
  color: white;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.step-body { flex: 1; min-width: 0; }

.step-thinking {
  font-size: 14px;
  font-weight: 600;
  color: #777;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.thinking-icon { font-size: 16px; }

.step-command {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #1a1a2e;
  border-radius: 8px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  overflow-x: auto;
}

.step-command.cmd-blocked {
  background: #451a03;
}

.prompt-sign {
  color: var(--xm-green);
  font-weight: 800;
  flex-shrink: 0;
}

.step-command code {
  color: #e0e0e0;
  white-space: pre;
  flex: 1;
}

.cmd-level {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #166534;
  color: #dcfce7;
  flex-shrink: 0;
  font-family: var(--xm-font);
}

.level-confirm { background: #92400e; color: #fef3c7; }
.level-blocked { background: #991b1b; color: #fee2e2; }

.step-output {
  margin-top: 6px;
  padding: 10px 14px;
  background: #f7f7f7;
  border-radius: 8px;
  border-left: 3px solid var(--xm-border);
}

.step-output pre {
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #555;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.done-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: #dcfce7;
  border-radius: 10px;
  margin-top: 16px;
  font-weight: 700;
  font-size: 15px;
  color: #166534;
}

.stopped-banner { background: #f3f4f6; color: #6b7280; }

.done-icon {
  width: 24px;
  height: 24px;
  background: var(--xm-green);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
}

.stopped-banner .done-icon { background: #9ca3af; }

.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.feature {
  padding: 14px;
  background: #f7f7f7;
  border-radius: 10px;
}

.feature strong { font-size: 15px; display: block; margin-bottom: 4px; }
.feature p { font-size: 13px; color: #777; margin: 0; }

.error-msg {
  margin-top: 12px;
  padding: 10px 14px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}

/* 浏览中提示 */
.browsing-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #e0e7ff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #3730a3;
}

.browsing-dot {
  width: 8px;
  height: 8px;
  background: #3730a3;
  border-radius: 50%;
  animation: pulse 1s infinite;
}
</style>
