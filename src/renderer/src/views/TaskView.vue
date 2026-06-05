<script setup>
import { ref, onMounted } from 'vue'
import { parseLLMJson } from '../utils/llmJson'

const inputText = ref('')
const tasks = ref([])
const checklist = ref([])
const loading = ref(false)
const error = ref('')

const sampleTask = `请在本周五前完成以下作业：
1. 数据结构实验报告（PDF格式，命名：学号_姓名_实验3.pdf）
2. 第5章课后习题 1-5题
3. 小组项目PPT展示（10分钟）`

const loadSample = () => {
  inputText.value = sampleTask
}

// 加载历史任务
const loadTasks = async () => {
  try {
    const result = await window.task.getAll()
    if (result.success) {
      tasks.value = result.data || []
    }
  } catch (e) {
    console.error('[TaskView] loadTasks 失败:', e)
  }
}

onMounted(loadTasks)

const parseDeadlineTs = (deadlineDate) => {
  if (!deadlineDate) return 0
  const ts = new Date(deadlineDate).getTime()
  return Number.isFinite(ts) ? ts : 0
}

const parseTask = async () => {
  if (loading.value || !inputText.value.trim()) return
  loading.value = true
  error.value = ''
  checklist.value = []

  try {
    const result = await window.llm.parseTask(inputText.value)

    if (result.success) {
      try {
        const json = parseLLMJson(result.data)
        const newTasks = json.tasks.map((t) => ({
          title: t.title,
          deadline: t.deadline || '未指定',
          deadlineTs: parseDeadlineTs(t.deadlineDate),
          format: t.format || '不限',
          naming: t.naming || '',
          note: t.note || '',
          status: 'pending',
          sourceText: inputText.value.trim()
        }))
        checklist.value = json.checklist || []

        // 保存到后端
        const saveResult = await window.task.add(newTasks)
        if (saveResult.success) {
          tasks.value = saveResult.data || []
        }
      } catch {
        error.value = '解析结果格式异常，请重试'
      }
    } else {
      error.value = result.error || '请求失败'
    }
  } catch (e) {
    error.value = '调用失败: ' + (e.message || '未知错误')
  } finally {
    loading.value = false
  }
}

const toggleTask = async (task) => {
  try {
    const result = await window.task.toggle(task.id)
    if (result.success) {
      task.status = task.status === 'done' ? 'pending' : 'done'
    }
  } catch (e) {
    console.error('[TaskView] toggleTask 失败:', e)
  }
}

const deleteTask = async (task) => {
  try {
    const result = await window.task.delete(task.id)
    if (result.success) {
      tasks.value = tasks.value.filter((t) => t.id !== task.id)
    }
  } catch (e) {
    console.error('[TaskView] deleteTask 失败:', e)
  }
}
</script>

<template>
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">任务解析</h1>
      <p class="page-desc">粘贴作业要求，自动提取关键信息，生成待办清单</p>
    </div>

    <div class="task-layout">
      <div class="card">
        <h2 class="section-title">输入作业要求</h2>
        <textarea
          v-model="inputText"
          class="input textarea"
          placeholder="粘贴作业要求、实验说明或课堂通知..."
          rows="6"
        ></textarea>
        <div class="button-group">
          <button class="btn btn-primary" @click="parseTask" :disabled="loading">
            {{ loading ? '解析中...' : '开始解析' }}
          </button>
          <button class="btn btn-outline" @click="loadSample">示例</button>
        </div>
        <div class="error-msg" v-if="error">{{ error }}</div>
      </div>

      <div class="card" v-if="tasks.length > 0">
        <h2 class="section-title">
          待办清单 ({{ tasks.filter((t) => t.status === 'pending').length }} 项待完成)
        </h2>
        <div class="task-list">
          <div
            v-for="task in tasks"
            :key="task.id"
            class="task-item"
            :class="{ done: task.status === 'done' }"
          >
            <div
              class="task-check"
              :class="{ checked: task.status === 'done' }"
              @click="toggleTask(task)"
            >
              <svg v-if="task.status === 'done'" viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
            <div class="task-content">
              <div class="task-title">{{ task.title }}</div>
              <div class="task-meta">
                <span class="tag tag-yellow">{{ task.deadline }}</span>
                <span class="tag tag-blue">{{ task.format }}</span>
                <span class="tag" v-if="task.naming">{{ task.naming }}</span>
                <span class="tag tag-green" v-if="task.note">{{ task.note }}</span>
              </div>
            </div>
            <button class="task-delete" @click.stop="deleteTask(task)" title="删除">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="#999">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>
        </div>

        <h3 class="section-subtitle" v-if="checklist.length > 0">提交前检查</h3>
        <div class="checklist" v-if="checklist.length > 0">
          <label class="check-item" v-for="(item, i) in checklist" :key="i">
            <input type="checkbox" /> {{ item }}
          </label>
        </div>
      </div>

      <div class="card empty-state" v-else-if="!loading">
        <p>还没有任务，粘贴作业要求开始解析吧</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 20px;
  background: var(--xm-surface-soft);
  border-radius: var(--xm-radius);
  transition: background 0.15s;
}

.task-item:hover {
  background: #effcf4;
}
.task-item.done {
  opacity: 0.5;
}
.task-item.done .task-title {
  text-decoration: line-through;
}

.task-check {
  width: 28px;
  height: 28px;
  border: 3px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  cursor: pointer;
  transition: all 0.15s;
}

.task-check.checked {
  background: var(--xm-green);
  border-color: var(--xm-green);
  color: white;
}

.task-content {
  flex: 1;
  min-width: 0;
}

.task-title {
  font-weight: 700;
  font-size: 17px;
  margin-bottom: 8px;
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.task-delete {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.task-item:hover .task-delete {
  opacity: 1;
}

.section-subtitle {
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 24px 0 14px;
  color: var(--xm-text);
}

.checklist {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--xm-surface-soft);
  border-radius: var(--xm-radius-sm);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.check-item:hover {
  background: #effcf4;
}

.check-item input[type='checkbox'] {
  width: 20px;
  height: 20px;
  accent-color: var(--xm-green);
}

.error-msg {
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
  border-radius: var(--xm-radius-sm);
  font-size: 14px;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--xm-text-muted);
}
</style>
