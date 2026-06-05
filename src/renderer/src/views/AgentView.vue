<script setup>
import { ref } from 'vue'
import { searchSamples, useQuickSearch } from '../composables/useQuickSearch'
import { controlSamples, stateLabel, useWebAssistant } from '../composables/useWebAssistant'
import QuickSearchPanel from '../components/agent/QuickSearchPanel.vue'
import WebAssistantPanel from '../components/agent/WebAssistantPanel.vue'

const activeMode = ref('search')

const { searchInput, searching, searchError, searchResult, runQuickSearch, loadSearchSample } =
  useQuickSearch()

const {
  goalInput,
  running,
  state,
  steps,
  screenshotSrc,
  currentUrl,
  currentTitle,
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
</script>

<template>
  <div class="fade-in agent-view">
    <div class="page-header">
      <h1 class="page-title">小实验</h1>
      <p class="page-desc">这里有两个能力：直接查资料，或者让学伴一步一步操作网页</p>
    </div>

    <div class="mode-tabs">
      <button
        class="mode-tab"
        :class="{ active: activeMode === 'search' }"
        @click="activeMode = 'search'"
      >
        <span class="mode-icon">🔎</span>
        <span>
          <strong>快速查资料</strong>
          <small>直接找答案，不点网页</small>
        </span>
      </button>
      <button
        class="mode-tab"
        :class="{ active: activeMode === 'control' }"
        @click="activeMode = 'control'"
      >
        <span class="mode-icon">🖱️</span>
        <span>
          <strong>操作网页</strong>
          <small>看实时网页，帮你点击输入</small>
        </span>
      </button>
    </div>

    <!-- 快速查资料 -->
    <QuickSearchPanel
      v-if="activeMode === 'search'"
      v-model:searchInput="searchInput"
      :searching="searching"
      :search-error="searchError"
      :search-result="searchResult"
      :search-samples="searchSamples"
      @search="runQuickSearch"
      @sample="loadSearchSample"
    />

    <!-- 操作网页 -->
    <WebAssistantPanel
      v-else
      v-model:goalInput="goalInput"
      :running="running"
      :state="state"
      :state-label="stateLabel"
      :steps="steps"
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
.agent-view .mode-tabs{
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.agent-view .mode-tab{
  display: flex;
  align-items: center;
  gap: 12px;
  border: 2px solid var(--xm-border);
  border-radius: var(--xm-radius-lg);
  padding: 14px 16px;
  background: var(--xm-surface);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.agent-view .mode-tab.active{
  border-color: var(--xm-green);
  background: #f0fdf4;
  box-shadow: 0 3px 0 #d9f6cc;
}

.agent-view .mode-icon{
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--xm-radius);
  background: var(--xm-surface-soft);
  font-size: 21px;
  flex-shrink: 0;
}

.agent-view .mode-tab strong{
  display: block;
  color: var(--xm-text);
  font-size: 15px;
  font-weight: 900;
}

.agent-view .mode-tab small{
  display: block;
  color: var(--xm-text-muted);
  font-size: 12px;
  margin-top: 3px;
}

.agent-view .helper-layout{
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent-view .control-layout{
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(380px, 44%);
  gap: 16px;
  align-items: start;
}

.agent-view .control-main-column{
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.agent-view .live-browser-column{
  position: sticky;
  top: 16px;
  z-index: 5;
  min-width: 0;
}

.agent-view .live-browser-card{
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
}

.agent-view .control-title-row,
.agent-view .browser-head,
.agent-view .steps-header{
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.agent-view .helper-copy,
.agent-view .url-text{
  color: var(--xm-text-muted);
  font-size: 13px;
  font-weight: 600;
  margin-top: -8px;
}

.agent-view .url-text{
  word-break: break-all;
  margin-top: 0;
}

.agent-view .search-row{
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.agent-view .search-input{
  flex: 1;
}

.agent-view .state-pill{
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
.agent-view .state-acting{
  background: var(--xm-info-bg);
  color: var(--xm-info-text);
}

.agent-view .state-done{
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
}

.agent-view .state-error{
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
}

.agent-view .state-stopped{
  background: var(--xm-surface-muted);
  color: #6b7280;
}

.agent-view .goal-input{
  min-height: 86px;
}

.agent-view .button-group{
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.agent-view .sample-row{
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.agent-view .sample-chip{
  border: 1px solid var(--xm-border);
  background: var(--xm-surface);
  border-radius: var(--xm-radius-pill);
  padding: 7px 12px;
  color: var(--xm-text-light);
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
}

.agent-view .sample-chip:hover{
  border-color: var(--xm-green);
  color: var(--xm-green-dark);
  background: #f0fdf4;
}

.agent-view .error-msg,
.agent-view .answer-msg{
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--xm-radius-sm);
  font-size: 14px;
  font-weight: 700;
}

.agent-view .error-msg{
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
}

.agent-view .config-hint{
  margin-top: 6px;
  color: #7f1d1d;
  font-size: 12px;
}

.agent-view .answer-msg,
.agent-view .summary-box{
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
}

.agent-view .summary-box{
  white-space: pre-wrap;
  padding: 14px;
  border-radius: var(--xm-radius);
  line-height: 1.6;
  font-size: 15px;
  font-weight: 700;
}


.agent-view .result-head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-view .mode-badge{
  padding: 5px 10px;
  border-radius: var(--xm-radius-pill);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .mode-badge.cloud{
  background: #ecfeff;
  color: #0e7490;
  border: 1px solid #a5f3fc;
}

.agent-view .mode-badge.local{
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.agent-view .cloud-meta{
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 4px 0 12px;
}

.agent-view .cloud-meta span{
  padding: 4px 8px;
  border-radius: var(--xm-radius-pill);
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.agent-view .stage-list{
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-view .stage-item{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--xm-radius-sm);
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
}

.agent-view .stage-item strong{
  color: #334155;
  min-width: 110px;
}

.agent-view .stage-item small{
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-view .stage-dot{
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  flex: 0 0 auto;
}

.agent-view .stage-dot.done{ background: #22c55e; }
.agent-view .stage-dot.running{ background: #f59e0b; }
.agent-view .stage-dot.error{ background: #ef4444; }

.agent-view .source-main{
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.agent-view .score-pill{
  align-self: flex-start;
  padding: 5px 8px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .source-title{
  color: var(--xm-text-light);
  font-size: 13px;
  font-weight: 900;
  margin: 16px 0 8px;
}

.agent-view .source-list{
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-view .source-item{
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--xm-radius-sm);
  background: var(--xm-surface-soft);
  text-decoration: none;
}

.agent-view .source-item strong{
  color: var(--xm-text);
  font-size: 14px;
}

.agent-view .source-item small{
  color: var(--xm-text-muted);
  font-size: 12px;
  word-break: break-all;
}

.agent-view .live-badge{
  padding: 5px 10px;
  border-radius: var(--xm-radius-pill);
  background: #ecfdf5;
  color: #16803d;
  border: 1px solid #bbf7d0;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.agent-view .live-browser-box{
  margin-top: 12px;
  border: 2px solid var(--xm-border);
  border-radius: var(--xm-radius-lg);
  overflow: hidden;
  background: var(--xm-surface);
  height: clamp(320px, 46vh, 520px);
  min-height: 320px;
  display: flex;
  position: relative;
}

.agent-view .live-browser-box img{
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--xm-surface);
}

.agent-view .live-browser-box.empty{
  align-items: center;
  justify-content: center;
  background: var(--xm-surface-soft);
}

.agent-view .screenshot-placeholder{
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--xm-text-light);
  text-align: center;
  padding: 32px;
}

.agent-view .book-icon{
  font-size: 34px;
}

.agent-view .screenshot-placeholder small{
  color: var(--xm-text-muted);
  font-size: 13px;
}

.agent-view .step-count{
  color: var(--xm-text-muted);
  font-size: 13px;
  font-weight: 900;
}

.agent-view .empty-steps{
  color: var(--xm-text-muted);
  font-size: 14px;
  font-weight: 600;
}

.agent-view .dom-list{
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.agent-view .dom-item{
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius);
  background: var(--xm-surface);
}

.agent-view .dom-id{
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

.agent-view .dom-main{
  flex: 1;
  min-width: 0;
}

.agent-view .dom-title{
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--xm-text);
  font-size: 12px;
  font-weight: 800;
}

.agent-view .dom-title span,
.agent-view .dom-title small{
  color: var(--xm-text-muted);
  font-size: 11px;
  font-weight: 800;
}

.agent-view .dom-label{
  margin-top: 4px;
  color: var(--xm-text-light);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-view .dom-meta{
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.agent-view .dom-meta span{
  padding: 2px 7px;
  border-radius: var(--xm-radius-pill);
  background: var(--xm-surface-muted);
  color: var(--xm-text-light);
  font-size: 10px;
  font-weight: 900;
}

.agent-view .steps-list{
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-view .step-item{
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: var(--xm-radius);
  background: var(--xm-surface-soft);
}

.agent-view .step-num{
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

.agent-view .step-done{
  background: var(--xm-success-bg);
  color: var(--xm-success-text);
}

.agent-view .step-error{
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
}

.agent-view .step-body{
  flex: 1;
  min-width: 0;
}

.agent-view .step-thinking{
  color: var(--xm-text);
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 4px;
}

.agent-view .step-action{
  color: var(--xm-text-light);
  font-size: 13px;
  font-weight: 700;
}

.agent-view .feature-grid{
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.agent-view .feature{
  padding: 14px;
  background: var(--xm-surface-soft);
  border-radius: var(--xm-radius);
}

.agent-view .feature strong{
  color: var(--xm-text);
  font-size: 14px;
}

.agent-view .feature p{
  color: var(--xm-text-light);
  font-size: 13px;
  line-height: 1.4;
  margin-top: 6px;
}

@media (max-width: 900px) {
  .agent-view .feature-grid,
  .agent-view .mode-tabs,
  .agent-view .dom-list,
  .agent-view .control-layout{
    grid-template-columns: 1fr;
  }

  .agent-view .live-browser-column{
    position: static;
  }

  .agent-view .live-browser-box{
    height: 320px;
  }

  .agent-view .search-row{
    flex-direction: column;
  }
}
</style>
