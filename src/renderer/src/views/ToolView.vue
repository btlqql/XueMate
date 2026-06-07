<script setup>
import { ref, computed, markRaw, watch } from 'vue'
import TutorView from './TutorView.vue'

const props = defineProps({
  currentRoute: { type: Object, default: null },
  routePayload: { type: Object, default: null }
})

const toolIds = ['tutor']
const currentTool = ref('tutor')

const tools = [
  {
    id: 'tutor',
    label: '代码与作业辅导',
    desc: '代码分析、作业检查和练习题讲解',
    component: markRaw(TutorView)
  }
]

const activeComponent = computed(
  () => tools.find((tool) => tool.id === currentTool.value)?.component
)

function normalizeToolId(value) {
  if (typeof value !== 'string') return ''
  const id = value.trim().toLowerCase()
  return toolIds.includes(id) ? id : ''
}

function resolveRouteTool() {
  return (
    normalizeToolId(props.currentRoute?.tool) ||
    normalizeToolId(props.routePayload?.tool) ||
    normalizeToolId(props.currentRoute?.payload?.tool)
  )
}

watch(
  () => resolveRouteTool(),
  (tool) => {
    if (tool) currentTool.value = tool
  },
  { immediate: true }
)
</script>

<template>
  <div class="tool-view fade-in">
    <div class="page-header">
      <h1 class="page-title">代码与作业辅导</h1>
      <p class="page-desc">作为问学伴之外的辅助入口，专门处理明确的代码、作业文件和练习题。</p>
    </div>

    <section class="tool-hero card">
      <div>
        <span class="tool-kicker">辅助能力</span>
        <p>如果是知识点理解、资料问答，回到问学伴；如果是代码、作业文件、练习题，就在这里处理。</p>
      </div>
      <div class="tool-use-cases" aria-label="代码作业辅导范围">
        <span>代码纠错</span>
        <span>作业文件检查</span>
        <span>练习题讲解</span>
      </div>
    </section>

    <div v-if="tools.length > 1" class="tool-tabs">
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
  max-width: 1120px;
}

.tool-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.42fr);
  gap: 18px;
  align-items: center;
  margin-bottom: 18px;
  border-color: rgba(88, 204, 2, 0.28);
  background:
    radial-gradient(circle at 8% 12%, rgba(88, 204, 2, 0.16), transparent 28%),
    linear-gradient(135deg, #ffffff 0%, #f6fff0 100%);
}

.tool-kicker {
  display: inline-flex;
  margin-bottom: 8px;
  padding: 4px 10px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-green-pale);
  color: var(--xm-green-dark);
  font-size: 12px;
  font-weight: 900;
}

.tool-hero h2 {
  color: var(--xm-text);
  font-size: 22px;
  font-weight: 900;
  line-height: 1.25;
}

.tool-hero p {
  margin-top: 8px;
  color: var(--xm-text-light);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.55;
}

.tool-use-cases {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-use-cases span {
  padding: 10px 12px;
  border: 1px solid rgba(88, 204, 2, 0.22);
  border-radius: var(--xm-radius-sm);
  background: white;
  color: var(--xm-text);
  font-size: 13px;
  font-weight: 900;
  box-shadow: var(--xm-shadow-sm);
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
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  background: var(--xm-surface);
  color: var(--xm-text-light);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.tool-tab:hover {
  border-color: var(--xm-border-strong);
  transform: translateY(-1px);
  box-shadow: var(--xm-shadow-sm);
}

.tool-tab.active {
  border-color: var(--xm-green);
  background: #f0fdf4;
  box-shadow:
    inset 0 0 0 1px rgba(88, 204, 2, 0.18),
    var(--xm-shadow-sm);
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
  .tool-hero {
    grid-template-columns: 1fr;
  }

  .tool-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
