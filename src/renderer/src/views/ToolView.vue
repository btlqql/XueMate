<script setup>
import { ref, computed, markRaw } from 'vue'
import TaskView from './TaskView.vue'
import TutorView from './TutorView.vue'
import ReviewView from './ReviewView.vue'

const currentTool = ref('task')

const tools = [
  {
    id: 'task',
    label: '任务解析',
    desc: '提取作业要求和截止时间',
    component: markRaw(TaskView)
  },
  {
    id: 'tutor',
    label: '学习辅导',
    desc: '代码分析、作业检查、刷题练习',
    component: markRaw(TutorView)
  },
  {
    id: 'review',
    label: '复习总结',
    desc: '生成课程复习提纲',
    component: markRaw(ReviewView)
  }
]

const activeComponent = computed(
  () => tools.find((tool) => tool.id === currentTool.value)?.component
)
</script>

<template>
  <div class="tool-view fade-in">
    <div class="page-header">
      <h1 class="page-title">工具箱</h1>
      <p class="page-desc">把明确的学习任务交给专用工具处理</p>
    </div>

    <div class="tool-tabs">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="tool-tab"
        :class="{ active: currentTool === tool.id }"
        @click="currentTool = tool.id"
      >
        <span class="tool-label">{{ tool.label }}</span>
        <span class="tool-desc">{{ tool.desc }}</span>
      </button>
    </div>

    <div class="tool-panel">
      <KeepAlive>
        <component :is="activeComponent" />
      </KeepAlive>
    </div>
  </div>
</template>

<style scoped>
.tool-view {
  width: 100%;
}

.tool-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.tool-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 16px;
  border: 2px solid var(--xm-border);
  border-radius: var(--xm-radius-lg);
  background: var(--xm-surface);
  color: var(--xm-text-light);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.tool-tab:hover {
  border-color: var(--xm-border-strong);
  transform: translateY(-1px);
}

.tool-tab.active {
  border-color: var(--xm-green);
  background: #f0fdf4;
  box-shadow: 0 3px 0 #d9f6cc;
}

.tool-label {
  font-size: 16px;
  font-weight: 900;
  color: var(--xm-text);
}

.tool-tab.active .tool-label {
  color: var(--xm-green-dark);
}

.tool-desc {
  font-size: 12px;
  font-weight: 600;
  color: var(--xm-text-muted);
  line-height: 1.4;
}

.tool-panel :deep(.page-header) {
  display: none;
}

@media (max-width: 900px) {
  .tool-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
