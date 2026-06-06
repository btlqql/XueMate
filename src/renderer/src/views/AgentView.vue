<script setup>
import { computed, ref, watch } from 'vue'
import { searchSamples, useQuickSearch } from '../composables/useQuickSearch'
import { controlSamples, stateLabel, useWebAssistant } from '../composables/useWebAssistant'
import QuickSearchPanel from '../components/agent/QuickSearchPanel.vue'
import WebAssistantPanel from '../components/agent/WebAssistantPanel.vue'

const props = defineProps({
  currentRoute: { type: Object, default: null },
  routePayload: { type: Object, default: null }
})

const emit = defineEmits(['navigate'])

const modeIds = ['search', 'control']
const activeMode = ref('search')
const returnConversationId = ref('')

function normalizeModeId(value) {
  if (typeof value !== 'string') return ''
  const id = value.trim().toLowerCase()
  return modeIds.includes(id) ? id : ''
}

function normalizeDraftPrompt(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeConversationId(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  return ''
}

function resolveRouteMode() {
  return (
    normalizeModeId(props.currentRoute?.mode) ||
    normalizeModeId(props.routePayload?.mode) ||
    normalizeModeId(props.currentRoute?.payload?.mode)
  )
}

function resolveDraftPrompt() {
  return (
    normalizeDraftPrompt(props.routePayload?.draftPrompt) ||
    normalizeDraftPrompt(props.currentRoute?.payload?.draftPrompt) ||
    normalizeDraftPrompt(props.currentRoute?.draftPrompt)
  )
}

function resolveConversationId() {
  return (
    normalizeConversationId(props.routePayload?.conversationId) ||
    normalizeConversationId(props.currentRoute?.payload?.conversationId) ||
    normalizeConversationId(props.currentRoute?.conversationId)
  )
}

const {
  searchInput,
  searching,
  searchError,
  searchResult,
  backgroundOrganizing,
  backgroundMessage,
  backgroundError,
  backgroundResult,
  quickSearchHistory,
  quickSearchHistoryLoading,
  runQuickSearch,
  loadSearchSample,
  setSearchDraftPrompt
} = useQuickSearch({ draftPrompt: resolveDraftPrompt() })

const {
  goalInput,
  browserPreview,
  running,
  state,
  steps,
  screenshotSrc,
  currentUrl,
  currentTitle,
  stepIndex,
  maxSteps,
  friendlyError,
  error,
  answer,
  setBrowserBoxElement,
  domElementCount,
  domCandidates,
  loadControlSample,
  startAssistant,
  stopAssistant,
  clearControl
} = useWebAssistant(activeMode)

const preferredWebMaterial = computed(() => backgroundResult.value || searchResult.value)
const canReturnWebMaterialToChat = computed(() => Boolean(preferredWebMaterial.value))
const returnToChatLabel = computed(() =>
  returnConversationId.value ? '带回原对话继续问' : '带回问学伴'
)

function collectSourceLines(result) {
  if (!Array.isArray(result?.sources)) return []
  return result.sources.slice(0, 3).map((source, index) => {
    const title = source?.title || '网页资料'
    const url = source?.url || source?.href || ''
    return url ? `${index + 1}. ${title}：${url}` : `${index + 1}. ${title}`
  })
}

function buildWebMaterialDraftPrompt() {
  const result = preferredWebMaterial.value
  const query = normalizeDraftPrompt(result?.query) || normalizeDraftPrompt(searchInput.value)
  const summary = normalizeDraftPrompt(result?.summary)
  const sourceLines = collectSourceLines(result)
  const sourceText = sourceLines.length ? `\n参考来源：\n${sourceLines.join('\n')}` : ''
  const summaryText = summary ? `\n网页整理摘要：${summary}` : ''
  const question = query || '刚才查到的网页资料'

  return `我刚补充查了「${question}」相关网页资料。${summaryText}${sourceText}\n\n请结合资料库和这些网页资料，用小学生能听懂的方式继续讲解，并给我下一步学习建议。`
}

function returnWebMaterialToChat() {
  const payload = {
    collectionId: 'all',
    draftPrompt: buildWebMaterialDraftPrompt()
  }
  if (returnConversationId.value) {
    payload.conversationId = returnConversationId.value
  }
  emit('navigate', {
    view: 'chat',
    payload
  })
}

function openKnowledge() {
  emit('navigate', 'knowledge')
}

function openStudyTool(tool) {
  emit('navigate', {
    view: 'tools',
    tool
  })
}

watch(
  () => resolveRouteMode(),
  (mode) => {
    if (mode) activeMode.value = mode
  },
  { immediate: true }
)

watch(
  () => resolveDraftPrompt(),
  (draftPrompt) => {
    if (draftPrompt) setSearchDraftPrompt(draftPrompt)
  },
  { immediate: true }
)

watch(
  () => resolveConversationId(),
  (conversationId) => {
    returnConversationId.value = conversationId
  },
  { immediate: true }
)
</script>

<template>
  <div class="fade-in agent-view">
    <div class="page-header">
      <h1 class="page-title">网页资料</h1>
      <p class="page-desc">当本地资料不够时，先找一版补充资料；复杂网页操作放到高级模式</p>
    </div>

    <div class="mode-tabs">
      <button
        class="mode-tab"
        :class="{ active: activeMode === 'search' }"
        @click="activeMode = 'search'"
      >
        <span class="mode-icon">🔎</span>
        <span>
          <strong>找网页资料</strong>
          <small>先看一版整理结果</small>
        </span>
      </button>
      <button
        class="mode-tab"
        :class="{ active: activeMode === 'control' }"
        @click="activeMode = 'control'"
      >
        <span class="mode-icon">🖱️</span>
        <span>
          <strong>网页助手（高级）</strong>
          <small>打开网页后一步步处理</small>
        </span>
      </button>
    </div>

    <div class="web-return-card card" v-if="activeMode === 'search'">
      <div>
        <strong>网页资料不是终点</strong>
        <p>查到资料后，把摘要和来源带回问学伴，继续在原来的学习对话里讲清楚。</p>
      </div>
      <div class="web-return-actions">
        <button
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="!canReturnWebMaterialToChat"
          @click="returnWebMaterialToChat"
        >
          {{ returnToChatLabel }}
        </button>
        <button class="btn btn-outline btn-sm" type="button" @click="openKnowledge">
          去资料库
        </button>
        <button class="btn btn-outline btn-sm" type="button" @click="openStudyTool('task')">
          整理作业
        </button>
      </div>
    </div>

    <!-- 快速找网页资料 -->
    <QuickSearchPanel
      v-if="activeMode === 'search'"
      v-model:searchInput="searchInput"
      :searching="searching"
      :search-error="searchError"
      :search-result="searchResult"
      :background-organizing="backgroundOrganizing"
      :background-message="backgroundMessage"
      :background-error="backgroundError"
      :background-result="backgroundResult"
      :quick-search-history="quickSearchHistory"
      :quick-search-history-loading="quickSearchHistoryLoading"
      :search-samples="searchSamples"
      :can-return-to-chat="canReturnWebMaterialToChat"
      :return-label="returnToChatLabel"
      @search="runQuickSearch"
      @sample="loadSearchSample"
      @return-chat="returnWebMaterialToChat"
    />

    <!-- 网页助手 -->
    <WebAssistantPanel
      v-else
      v-model:goalInput="goalInput"
      :browser-preview="browserPreview"
      :running="running"
      :state="state"
      :state-label="stateLabel"
      :steps="steps"
      :step-index="stepIndex"
      :max-steps="maxSteps"
      :screenshot-src="screenshotSrc"
      :current-url="currentUrl"
      :current-title="currentTitle"
      :friendly-error="friendlyError"
      :raw-error="error"
      :answer="answer"
      :control-samples="controlSamples"
      :dom-candidates="domCandidates"
      :dom-element-count="domElementCount"
      :set-browser-box-element="setBrowserBoxElement"
      @start="startAssistant"
      @stop="stopAssistant"
      @clear="clearControl"
      @sample="loadControlSample"
    />
  </div>
</template>

<style>
.agent-view .mode-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.agent-view .mode-tab {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  padding: 14px 16px;
  background: var(--xm-surface);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.agent-view .mode-tab.active {
  border-color: var(--xm-green);
  background: #f0fdf4;
  box-shadow:
    inset 0 0 0 1px rgba(88, 204, 2, 0.18),
    var(--xm-shadow-sm);
}

.agent-view .mode-icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--xm-surface-soft);
  font-size: 21px;
  flex-shrink: 0;
}

.agent-view .mode-tab strong {
  display: block;
  color: var(--xm-text);
  font-size: 15px;
  font-weight: 900;
}

.agent-view .mode-tab small {
  display: block;
  color: var(--xm-text-muted);
  font-size: 12px;
  margin-top: 3px;
}

.agent-view .web-return-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
  border-color: rgba(88, 204, 2, 0.22);
  background: linear-gradient(135deg, #ffffff 0%, #f6fff0 100%);
}

.agent-view .web-return-card strong {
  display: block;
  color: var(--xm-text);
  font-size: 15px;
  font-weight: 900;
}

.agent-view .web-return-card p {
  margin-top: 3px;
  color: var(--xm-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.agent-view .web-return-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.agent-view .helper-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent-view .result-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-view .control-console {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent-view .control-command-card {
  border-color: rgba(88, 204, 2, 0.3);
  background: linear-gradient(135deg, #ffffff 0%, #f8fff1 100%);
}

.agent-view .command-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.agent-view .command-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  margin-top: 12px;
}

.agent-view .goal-label {
  display: block;
  grid-column: 1 / -1;
  color: var(--xm-text);
  font-size: 13px;
  font-weight: 900;
}

.agent-view .command-actions {
  align-self: stretch;
  justify-content: flex-end;
  margin-top: 0;
}

.agent-view .control-workspace {
  display: grid;
  grid-template-columns: minmax(560px, 1fr) minmax(310px, 32%);
  gap: 16px;
  align-items: start;
}

.agent-view .browser-stage-card {
  min-width: 0;
}

.agent-view .assistant-rail {
  position: sticky;
  top: 16px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.agent-view .assistant-status-card {
  border-color: rgba(59, 130, 246, 0.18);
}

.agent-view .control-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(380px, 44%);
  gap: 16px;
  align-items: start;
}

.agent-view .control-main-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.agent-view .live-browser-column {
  position: sticky;
  top: 16px;
  z-index: 5;
  min-width: 0;
}

.agent-view .live-browser-card {
  box-shadow: var(--xm-shadow);
}

.agent-view .control-title-row,
.agent-view .browser-head,
.agent-view .steps-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.agent-view .helper-copy,
.agent-view .url-text {
  color: var(--xm-text-muted);
  font-size: 13px;
  font-weight: 600;
  margin-top: -8px;
}

.agent-view .url-text {
  word-break: break-all;
  margin-top: 0;
}

.agent-view .search-row {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.agent-view .search-input {
  flex: 1;
}

.agent-view .state-pill {
  padding: 6px 13px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-surface-muted);
  color: var(--xm-text-light);
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .state-opening,
.agent-view .state-looking,
.agent-view .state-observing,
.agent-view .state-thinking,
.agent-view .state-acting,
.agent-view .state-settling,
.agent-view .state-cancelling {
  background: var(--xm-info-bg);
  color: var(--xm-info-text);
}

.agent-view .state-done {
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
}

.agent-view .state-error {
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
}

.agent-view .state-timed_out,
.agent-view .state-blocked {
  background: #fef3c7;
  color: #92400e;
}

.agent-view .state-stopped,
.agent-view .state-cancelled {
  background: var(--xm-surface-muted);
  color: #6b7280;
}

.agent-view .goal-input {
  min-height: 86px;
}

.agent-view .button-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.agent-view .sample-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.agent-view .sample-chip {
  border: 1px solid var(--xm-border);
  background: var(--xm-surface);
  border-radius: var(--xm-radius-pill);
  padding: 7px 12px;
  color: var(--xm-text-light);
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
}

.agent-view .sample-chip:hover {
  border-color: var(--xm-green);
  color: var(--xm-green-dark);
  background: #f0fdf4;
}

.agent-view .history-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agent-view .history-head small {
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.agent-view .history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-view .history-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--xm-radius);
  background: var(--xm-surface-soft);
}

.agent-view .history-main {
  min-width: 0;
}

.agent-view .history-main strong {
  display: block;
  color: var(--xm-text);
  font-size: 14px;
  font-weight: 900;
}

.agent-view .history-main p {
  margin: 4px 0 0;
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-view .history-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  flex: 0 0 auto;
}

.agent-view .history-pill {
  padding: 3px 8px;
  border-radius: var(--xm-radius-pill);
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .history-pill.background,
.agent-view .history-pill.done {
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
}

.agent-view .history-pill.error {
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
}

.agent-view .history-pill.skipped {
  background: #fff7ed;
  color: #c2410c;
}

.agent-view .history-meta small,
.agent-view .history-empty {
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.agent-view .error-msg,
.agent-view .answer-msg {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--xm-radius-sm);
  font-size: 14px;
  font-weight: 700;
}

.agent-view .error-msg {
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
}

.agent-view .config-hint {
  margin-top: 6px;
  color: #7f1d1d;
  font-size: 12px;
}

.agent-view .answer-msg,
.agent-view .summary-box {
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
}

.agent-view .answer-card {
  padding: 12px;
  border: 1px solid rgba(22, 101, 52, 0.12);
  border-radius: var(--xm-radius);
  background: linear-gradient(180deg, #f0fdf4, #ffffff);
}

.agent-view .answer-label {
  margin-bottom: 8px;
  color: #15803d;
  font-size: 12px;
  font-weight: 900;
}

.agent-view .summary-box {
  white-space: pre-wrap;
  padding: 14px;
  border-radius: var(--xm-radius-sm);
  line-height: 1.6;
  font-size: 15px;
  font-weight: 700;
  border: 1px solid rgba(22, 101, 52, 0.12);
}

.agent-view .summary-box.small {
  margin-top: 10px;
  padding: 11px 12px;
  font-size: 13px;
}

.agent-view .citation-panel {
  margin-top: 14px;
  padding: 14px;
  border-radius: var(--xm-radius);
  border: 1px solid #dbeafe;
  background: #f8fbff;
}

.agent-view .citation-panel.compact {
  background: #ffffff;
}

.agent-view .citation-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.agent-view .citation-head h3 {
  color: #1e3a8a;
  font-size: 15px;
  font-weight: 900;
}

.agent-view .citation-head p {
  margin-top: 3px;
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.agent-view .citation-head > span {
  padding: 5px 10px;
  border-radius: var(--xm-radius-pill);
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .citation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.agent-view .citation-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: var(--xm-radius-sm);
  background: #ffffff;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.agent-view .citation-card:hover {
  border-color: var(--xm-blue);
  box-shadow: var(--xm-shadow-sm);
  transform: translateY(-1px);
}

.agent-view .citation-card.is-document {
  border-color: #bbf7d0;
  background: #fbfefc;
}

.agent-view .citation-top,
.agent-view .citation-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.agent-view .citation-index,
.agent-view .citation-score,
.agent-view .citation-foot span {
  padding: 3px 8px;
  border-radius: var(--xm-radius-pill);
  font-size: 11px;
  font-weight: 900;
}

.agent-view .citation-index {
  background: #eff6ff;
  color: #1d4ed8;
}

.agent-view .citation-score {
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
}

.agent-view .citation-card strong {
  color: var(--xm-text);
  font-size: 14px;
  line-height: 1.35;
}

.agent-view .citation-card small {
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 800;
  word-break: break-all;
}

.agent-view .citation-card p {
  color: #475569;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.55;
}

.agent-view .citation-foot span {
  background: #f1f5f9;
  color: #475569;
}

.agent-view .result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-view .mode-badge {
  padding: 5px 10px;
  border-radius: var(--xm-radius-pill);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .mode-badge.web {
  background: #ecfeff;
  color: #0e7490;
  border: 1px solid #a5f3fc;
}

.agent-view .mode-badge.local {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.agent-view .resource-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 4px 0 12px;
}

.agent-view .resource-meta span {
  padding: 4px 8px;
  border-radius: var(--xm-radius-pill);
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.agent-view .stage-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-view .stage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--xm-radius-sm);
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
  color: #475569;
  font-size: 12px;
}

.agent-view .stage-item strong {
  color: #334155;
  min-width: 110px;
}

.agent-view .stage-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-view .stage-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  flex: 0 0 auto;
}

.agent-view .stage-dot.done {
  background: #22c55e;
}
.agent-view .stage-dot.running {
  background: #f59e0b;
}
.agent-view .stage-dot.error {
  background: #ef4444;
}

.agent-view .source-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.agent-view .score-pill {
  align-self: flex-start;
  padding: 5px 8px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .source-title {
  color: var(--xm-text-light);
  font-size: 13px;
  font-weight: 900;
  margin: 16px 0 8px;
}

.agent-view .source-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-view .source-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--xm-radius-sm);
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
  text-decoration: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.agent-view .source-item:hover {
  border-color: var(--xm-blue);
  background: #f0f9ff;
}

.agent-view .source-item strong {
  color: var(--xm-text);
  font-size: 14px;
}

.agent-view .source-item small {
  color: var(--xm-text-muted);
  font-size: 12px;
  word-break: break-all;
}

.agent-view .source-main p {
  margin-top: 4px;
  color: var(--xm-text-light);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.45;
}

.agent-view .background-card {
  margin-top: 16px;
  padding: 14px;
  border-radius: var(--xm-radius-lg);
  border: 1px dashed #93c5fd;
  background: linear-gradient(180deg, #eff6ff, #ffffff);
}

.agent-view .background-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agent-view .background-head strong {
  display: block;
  color: #1e3a8a;
  font-size: 14px;
  font-weight: 900;
}

.agent-view .background-head small {
  display: block;
  color: #64748b;
  margin-top: 3px;
  font-size: 12px;
  font-weight: 700;
}

.agent-view .background-status {
  padding: 5px 10px;
  border-radius: var(--xm-radius-pill);
  background: #e0f2fe;
  color: #0369a1;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .background-status.running {
  background: #fef3c7;
  color: #92400e;
}

.agent-view .background-copy {
  margin: 10px 0 0;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.agent-view .source-list.mini .source-item {
  background: #ffffff;
  border: 1px solid #dbeafe;
}

.agent-view .live-badge {
  padding: 5px 10px;
  border-radius: var(--xm-radius-pill);
  background: #ecfdf5;
  color: #16803d;
  border: 1px solid #bbf7d0;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .live-browser-box {
  margin-top: 12px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  overflow: hidden;
  background: var(--xm-surface);
  height: clamp(320px, 46vh, 520px);
  min-height: 320px;
  display: flex;
  position: relative;
}

.agent-view .browser-stage-card .live-browser-box {
  height: clamp(430px, 62vh, 720px);
  min-height: 420px;
}

.agent-view .live-browser-box img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--xm-surface);
}

.agent-view .live-browser-box.empty {
  align-items: center;
  justify-content: center;
  background: var(--xm-surface-soft);
}

.agent-view .screenshot-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--xm-text-light);
  text-align: center;
  padding: 32px;
}

.agent-view .book-icon {
  font-size: 34px;
}

.agent-view .screenshot-placeholder small {
  color: var(--xm-text-muted);
  font-size: 13px;
}

.agent-view .step-count {
  color: var(--xm-text-muted);
  font-size: 13px;
  font-weight: 900;
}

.agent-view .progress-track {
  height: 9px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-surface-muted);
  overflow: hidden;
  margin: 12px 0;
}

.agent-view .progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--xm-green), #22c55e);
  transition: width 0.25s ease;
}

.agent-view .current-action-card {
  padding: 13px;
  border-radius: var(--xm-radius-sm);
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
}

.agent-view .current-action-card small {
  display: block;
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 5px;
}

.agent-view .current-action-card strong {
  display: block;
  color: var(--xm-text);
  font-size: 15px;
  font-weight: 900;
}

.agent-view .current-action-card p {
  color: var(--xm-text-light);
  font-size: 13px;
  line-height: 1.45;
  margin-top: 6px;
}

.agent-view .debug-details {
  padding: 0;
  overflow: hidden;
}

.agent-view .debug-details summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  padding: 16px 18px;
  color: var(--xm-text);
  font-weight: 900;
  list-style: none;
}

.agent-view .debug-details summary::-webkit-details-marker {
  display: none;
}

.agent-view .debug-details summary small {
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.agent-view .debug-details[open] {
  padding-bottom: 16px;
}

.agent-view .debug-details[open] .empty-steps,
.agent-view .debug-details[open] .dom-list {
  margin: 0 18px;
}

.agent-view .empty-steps {
  color: var(--xm-text-muted);
  font-size: 14px;
  font-weight: 600;
}

.agent-view .dom-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.agent-view .dom-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius);
  background: var(--xm-surface);
}

.agent-view .dom-id {
  width: 34px;
  height: 34px;
  border-radius: var(--xm-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  font-weight: 900;
}

.agent-view .dom-main {
  flex: 1;
  min-width: 0;
}

.agent-view .dom-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--xm-text);
  font-size: 12px;
  font-weight: 800;
}

.agent-view .dom-title span,
.agent-view .dom-title small {
  color: var(--xm-text-muted);
  font-size: 11px;
  font-weight: 800;
}

.agent-view .dom-label {
  margin-top: 4px;
  color: var(--xm-text-light);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-view .dom-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.agent-view .dom-meta span {
  padding: 2px 7px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-surface-muted);
  color: var(--xm-text-light);
  font-size: 10px;
  font-weight: 900;
}

.agent-view .steps-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-view .step-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: var(--xm-radius);
  background: var(--xm-surface-soft);
}

.agent-view .step-num {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--xm-info-bg);
  color: var(--xm-info-text);
  font-size: 13px;
  font-weight: 900;
}

.agent-view .step-done {
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
}

.agent-view .step-error {
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
}

.agent-view .step-body {
  flex: 1;
  min-width: 0;
}

.agent-view .step-thinking {
  color: var(--xm-text);
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 4px;
}

.agent-view .step-action {
  color: var(--xm-text-light);
  font-size: 13px;
  font-weight: 700;
}

.agent-view .feature-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.agent-view .feature {
  padding: 14px;
  background: var(--xm-surface-soft);
  border-radius: var(--xm-radius);
}

.agent-view .feature strong {
  color: var(--xm-text);
  font-size: 14px;
}

.agent-view .feature p {
  color: var(--xm-text-light);
  font-size: 13px;
  line-height: 1.4;
  margin-top: 6px;
}

@media (max-width: 1100px) {
  .agent-view .control-workspace {
    grid-template-columns: 1fr;
  }

  .agent-view .assistant-rail {
    position: static;
  }
}

@media (max-width: 900px) {
  .agent-view .feature-grid,
  .agent-view .mode-tabs,
  .agent-view .citation-grid,
  .agent-view .dom-list,
  .agent-view .control-layout {
    grid-template-columns: 1fr;
  }

  .agent-view .command-head,
  .agent-view .command-body {
    grid-template-columns: 1fr;
  }

  .agent-view .live-browser-column {
    position: static;
  }

  .agent-view .live-browser-box {
    height: 320px;
  }

  .agent-view .browser-stage-card .live-browser-box {
    height: 360px;
    min-height: 320px;
  }

  .agent-view .search-row {
    flex-direction: column;
  }
}
</style>
