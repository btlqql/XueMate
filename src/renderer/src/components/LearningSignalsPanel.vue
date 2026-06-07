<script setup>
import { useLearningSignals } from '../composables/useLearningSignals'

const props = defineProps({
  activeId: { type: [String, Number], default: '' },
  refreshKey: { type: Number, default: 0 },
  loading: Boolean
})

const emit = defineEmits(['ask', 'search'])

const {
  adding,
  draftTitle,
  draftType,
  panelOpen,
  signalCount,
  typeOptions,
  visibleSignals,
  addSignal,
  setSignalStatus,
  togglePanel
} = useLearningSignals(props)

function askSignal(signal) {
  if (signal.type === 'weak_point') {
    emit(
      'ask',
      `我可能在「${signal.title}」这里比较薄弱，请用简单例子帮我讲清楚，再给我 2 道小练习。`
    )
    return
  }
  if (signal.type === 'material_gap') {
    emit('search', signal.title)
    return
  }
  emit('ask', `围绕「${signal.title}」帮我拆成下一步学习安排，只保留最关键的 3 步。`)
}
</script>

<template>
  <aside class="signals-panel" :class="{ open: panelOpen, collapsed: !panelOpen }">
    <button class="dock-toggle" type="button" @click="togglePanel">
      <span>{{ panelOpen ? '收起' : '学习线索' }}</span>
      <strong>{{ signalCount }}</strong>
    </button>

    <div class="signals-body">
      <div class="signals-head">
        <div>
          <h2>学习线索</h2>
          <p>边聊边浮出，不作为主功能打扰你</p>
        </div>
        <div class="head-actions">
          <button class="add-btn" type="button" @click="adding = !adding">
            {{ adding ? '收起' : '添加' }}
          </button>
          <button class="close-btn" type="button" @click="togglePanel">×</button>
        </div>
      </div>

      <form v-if="adding" class="signal-form" @submit.prevent="addSignal">
        <select v-model="draftType" class="signal-select">
          <option v-for="item in typeOptions" :key="item.id" :value="item.id">
            {{ item.label }}
          </option>
        </select>
        <input
          v-model="draftTitle"
          class="signal-input"
          placeholder="例如：分数通分 / 明天交作文"
        />
        <button class="signal-submit" type="submit" :disabled="!draftTitle.trim()">加入</button>
      </form>

      <div v-if="visibleSignals.length" class="signal-list">
        <article
          v-for="signal in visibleSignals"
          :key="signal.id"
          class="signal-card"
          :class="`signal-${signal.meta.tone}`"
        >
          <div class="signal-top">
            <span class="signal-type">{{ signal.meta.label }}</span>
            <button class="icon-btn" type="button" @click="setSignalStatus(signal, 'dismissed')">
              删除
            </button>
          </div>
          <strong>{{ signal.title }}</strong>
          <p>{{ signal.reason }}</p>
          <div class="signal-actions">
            <button class="action-main" type="button" @click="askSignal(signal)">
              {{ signal.type === 'material_gap' ? '查网页资料' : '问学伴' }}
            </button>
            <button
              v-if="signal.type !== 'material_gap'"
              class="action-ghost"
              type="button"
              @click="setSignalStatus(signal, 'resolved')"
            >
              {{ signal.type === 'weak_point' ? '已掌握' : '完成' }}
            </button>
            <button
              v-else
              class="action-ghost"
              type="button"
              @click="setSignalStatus(signal, 'resolved')"
            >
              忽略
            </button>
          </div>
        </article>
      </div>

      <div v-else class="signal-empty">
        <strong>还没有线索</strong>
        <p>聊天里出现不会的点、待处理事项或资料缺口时，这里会轻轻浮出来。</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.signals-panel {
  position: absolute;
  top: 64px;
  right: 12px;
  bottom: 86px;
  z-index: 8;
  flex-shrink: 0;
  overflow: visible;
  pointer-events: none;
}

.dock-toggle {
  position: absolute;
  top: 50%;
  right: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(88, 204, 2, 0.35);
  border-radius: 999px 0 0 999px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--xm-green-dark);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  font-size: 13px;
  pointer-events: auto;
  transform: translateY(-50%);
}

.dock-toggle strong {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--xm-green);
  color: white;
  font-size: 12px;
}

.signals-body {
  width: min(336px, calc(100vw - var(--xm-sidebar-w) - 32px));
  max-height: 100%;
  padding: 12px;
  overflow-y: auto;
  border: 1px solid var(--xm-border);
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.16);
  pointer-events: auto;
  transform-origin: right center;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.signals-panel.collapsed .signals-body {
  opacity: 0;
  pointer-events: none;
  transform: translateX(14px) scale(0.98);
}

.signals-panel.open .dock-toggle {
  display: none;
}

.signals-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.head-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.signals-head h2 {
  color: var(--xm-text);
  font-size: 16px;
  font-weight: 900;
}

.signals-head p {
  margin-top: 3px;
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.add-btn,
.close-btn,
.icon-btn,
.action-main,
.action-ghost,
.signal-submit,
.dock-toggle {
  border: none;
  border-radius: var(--xm-radius-pill);
  font-family: var(--xm-font);
  font-weight: 900;
  cursor: pointer;
  transition: all 0.15s;
}

.add-btn {
  padding: 6px 10px;
  background: var(--xm-green-pale);
  color: var(--xm-green-dark);
  font-size: 12px;
}

.close-btn {
  width: 26px;
  height: 26px;
  background: var(--xm-surface-soft);
  color: var(--xm-text-muted);
  font-size: 16px;
  line-height: 1;
}

.add-btn:hover,
.close-btn:hover,
.action-main:hover,
.action-ghost:hover,
.icon-btn:hover,
.signal-submit:hover:not(:disabled),
.dock-toggle:hover {
  transform: translateY(-1px);
}

.signal-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  background: white;
  box-shadow: var(--xm-shadow-sm);
}

.signal-select,
.signal-input {
  min-width: 0;
  border: 1px solid var(--xm-border);
  border-radius: 12px;
  padding: 9px 10px;
  background: var(--xm-surface-soft);
  color: var(--xm-text);
  font-family: var(--xm-font);
  font-size: 13px;
  font-weight: 750;
  outline: none;
}

.signal-select:focus,
.signal-input:focus {
  border-color: var(--xm-green);
  background: white;
}

.signal-submit {
  padding: 8px 12px;
  background: var(--xm-green);
  color: white;
  font-size: 13px;
}

.signal-submit:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.signal-card,
.signal-empty {
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  background: white;
  padding: 12px;
  box-shadow: var(--xm-shadow-sm);
}

.signal-card {
  border-left-width: 4px;
}

.signal-weak {
  border-left-color: #f59e0b;
}

.signal-todo {
  border-left-color: var(--xm-green);
}

.signal-gap {
  border-left-color: #2563eb;
}

.signal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.signal-type {
  padding: 3px 8px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-surface-soft);
  color: var(--xm-text-muted);
  font-size: 11px;
  font-weight: 900;
}

.icon-btn {
  padding: 4px 8px;
  background: transparent;
  color: var(--xm-text-muted);
  font-size: 11px;
}

.signal-card strong {
  display: block;
  color: var(--xm-text);
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
}

.signal-card p,
.signal-empty p {
  margin-top: 5px;
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.45;
}

.signal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.action-main,
.action-ghost {
  padding: 6px 10px;
  font-size: 12px;
}

.action-main {
  background: var(--xm-green);
  color: white;
}

.action-ghost {
  border: 1px solid var(--xm-border);
  background: white;
  color: var(--xm-text-muted);
}

.signal-empty {
  border-style: dashed;
  background: #fbfdff;
}

.signal-empty strong {
  color: var(--xm-text);
  font-size: 14px;
  font-weight: 900;
}

@media (max-width: 1180px) {
  .signals-panel {
    right: 12px;
    bottom: 84px;
  }

  .signals-head p,
  .signal-card p,
  .signal-empty p {
    display: none;
  }
}

@media (max-width: 760px) {
  .signals-panel {
    right: 10px;
    bottom: 82px;
  }

  .signals-body {
    width: min(320px, calc(100vw - var(--xm-sidebar-w) - 20px));
    max-height: 62vh;
  }
}
</style>
