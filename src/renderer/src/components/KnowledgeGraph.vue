<script setup>
import { computed } from 'vue'
import { useKnowledgeGraphRenderer } from '../composables/useKnowledgeGraphRenderer'

const props = defineProps({
  graphData: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  scopes: { type: Array, default: () => [] },
  activeScopeId: { type: String, default: 'all' },
  scopeName: { type: String, default: '全部图谱' }
})

const emit = defineEmits(['refresh', 'scope-change', 'locate-document'])

const {
  container,
  searchText,
  selectedNode,
  selectedLinks,
  activeType,
  graphCanvasReady,
  renderStage,
  renderError,
  isSubgraphMode,
  subgraphTitle,
  typeConfig,
  hasGraph,
  graphStatusText,
  legendItems,
  searchPlaceholder,
  searchNode,
  enterSubgraph,
  exitSubgraph,
  fitGraph,
  formatPercent,
  formatDate
} = useKnowledgeGraphRenderer(props)

const selectedScopeId = computed(() => {
  if (!selectedNode.value) return ''
  return selectedNode.value.meta?.collectionId || ''
})

const canOpenSelectedScope = computed(
  () => selectedScopeId.value && selectedScopeId.value !== props.activeScopeId
)

const selectedScopeButtonText = computed(() =>
  selectedNode.value?.type === 'collection' ? '进入这个图谱' : '查看所在图谱'
)

function sourceFromMeta(meta = {}) {
  const refs = meta.evidenceRefs || meta.sourceRefs || []
  const source = meta.documentId ? meta : refs[0]
  if (!source?.documentId) return null
  return {
    collectionId: source.collectionId,
    collectionName: source.collectionName,
    documentId: source.documentId,
    chunkId: source.chunkId,
    fileName: source.fileName || meta.fileName,
    startPos: source.startPos,
    endPos: source.endPos,
    snippet: source.snippet
  }
}

const articleTarget = computed(() => {
  if (!selectedNode.value) return null
  const direct = sourceFromMeta(selectedNode.value.meta)
  if (direct) {
    return {
      ...direct,
      sourceNodeId: selectedNode.value.id,
      sourceNodeLabel: selectedNode.value.label,
      sourceNodeType: selectedNode.value.type
    }
  }

  for (const link of selectedLinks.value) {
    const linked = sourceFromMeta(link.otherMeta)
    if (linked) {
      return {
        ...linked,
        sourceNodeId: link.otherId,
        sourceNodeLabel: link.otherLabel,
        sourceNodeType: link.otherType
      }
    }
  }
  return null
})

const locateButtonText = computed(() => (articleTarget.value?.chunkId ? '定位到文章片段' : '定位到文章'))

function locateArticle() {
  if (!articleTarget.value) return
  emit('locate-document', articleTarget.value)
}

function changeScope(scopeId) {
  emit('scope-change', scopeId || 'all')
}
</script>

<template>
  <div class="graph-card">
    <div class="graph-header">
      <div>
        <div class="eyebrow">学习图谱 · Sigma.js</div>
        <h2 class="section-title">学习网络 · {{ scopeName }}</h2>
        <p class="graph-desc">把资料、知识点、学习画像和复习任务连起来；可以进入单个图谱，也可以回到全部图谱。</p>
        <p class="graph-status">{{ graphStatusText }}</p>
      </div>
      <button class="btn btn-secondary" :disabled="loading" @click="emit('refresh')">
        {{ loading ? '生成中...' : '刷新图谱' }}
      </button>
    </div>

    <div v-if="graphData?.stats" class="graph-stats">
      <div class="graph-stat">
        <b>{{ graphData.stats.nodeCount }}</b>
        <span>节点</span>
      </div>
      <div class="graph-stat">
        <b>{{ graphData.stats.edgeCount }}</b>
        <span>关系</span>
      </div>
      <div class="graph-stat">
        <b>{{ graphData.stats.conceptCount }}</b>
        <span>知识点</span>
      </div>
      <div class="graph-stat danger">
        <b>{{ graphData.stats.weakPointCount }}</b>
        <span>薄弱点</span>
      </div>
      <div class="graph-stat">
        <b>{{ graphData.stats.reviewTaskCount }}</b>
        <span>复习</span>
      </div>
    </div>

    <div class="graph-toolbar">
      <form class="graph-search" @submit.prevent="searchNode">
        <input v-model="searchText" :placeholder="searchPlaceholder" />
        <button type="submit">定位</button>
      </form>
      <div class="scope-switcher">
        <button
          v-for="scope in scopes"
          :key="scope.id"
          class="scope-chip"
          :class="{ active: activeScopeId === scope.id }"
          @click="changeScope(scope.id)"
        >
          <span>{{ scope.name }}</span>
          <b>{{ scope.docCount || 0 }}</b>
        </button>
      </div>
      <div class="graph-legend">
        <button
          class="legend-item"
          :class="{ active: activeType === 'all' }"
          @click="activeType = 'all'"
        >
          全部
        </button>
        <button
          v-for="item in legendItems"
          :key="item.type"
          class="legend-item"
          :class="{ active: activeType === item.type }"
          :disabled="item.count === 0"
          @click="activeType = item.type"
        >
          <i :style="{ background: item.color }"></i>
          {{ item.label }} {{ item.count }}
        </button>
      </div>
    </div>

    <div v-if="error" class="graph-error">{{ error }}</div>

    <div v-if="loading && !hasGraph" class="graph-loading">
      <div class="loading-dot"></div>
      <span>正在整理资料关系...</span>
    </div>

    <div v-else-if="hasGraph" class="graph-body">
      <div class="sigma-wrap">
        <div ref="container" class="sigma-container"></div>
        <div v-if="!graphCanvasReady" class="sigma-preparing">
          <strong>{{ renderStage }}</strong>
          <span v-if="renderError">{{ renderError }}</span>
        </div>
        <div v-if="isSubgraphMode" class="subgraph-badge">
          <span>子图谱：{{ subgraphTitle }}</span>
          <button @click="exitSubgraph">退出</button>
        </div>
        <button class="fit-btn" @click="isSubgraphMode ? exitSubgraph() : fitGraph()">
          {{ isSubgraphMode ? '退出子图谱' : '回到全图' }}
        </button>
      </div>

      <aside class="node-panel">
        <template v-if="selectedNode">
          <div class="node-type" :style="{ background: typeConfig[selectedNode.type]?.soft }">
            {{ typeConfig[selectedNode.type]?.label || selectedNode.type }}
          </div>
          <h3>{{ selectedNode.label }}</h3>
          <p v-if="selectedNode.meta?.snippet" class="node-desc">{{ selectedNode.meta.snippet }}</p>
          <p v-else-if="selectedNode.meta?.value" class="node-desc">
            {{ selectedNode.meta.value }}
          </p>
          <p v-else-if="selectedNode.meta?.fileName" class="node-desc">
            {{ selectedNode.meta.fileName }}
          </p>
          <p v-else-if="selectedNode.meta?.description" class="node-desc">
            {{ selectedNode.meta.description }}
          </p>

          <div class="node-kv">
            <span>权重</span><b>{{ Math.round((selectedNode.score || 0) * 100) }}</b>
          </div>
          <div v-if="selectedNode.meta?.subject" class="node-kv">
            <span>学科</span><b>{{ selectedNode.meta.subject }}</b>
          </div>
          <div v-if="selectedNode.meta?.chunkCount !== undefined" class="node-kv">
            <span>片段数</span><b>{{ selectedNode.meta.chunkCount }}</b>
          </div>
          <div v-if="selectedNode.meta?.confidence !== undefined" class="node-kv">
            <span>置信度</span><b>{{ formatPercent(selectedNode.meta.confidence) }}</b>
          </div>
          <div v-if="selectedNode.meta?.importance !== undefined" class="node-kv">
            <span>重要性</span><b>{{ formatPercent(selectedNode.meta.importance) }}</b>
          </div>
          <div v-if="selectedNode.meta?.lastSeen" class="node-kv">
            <span>最近出现</span><b>{{ formatDate(selectedNode.meta.lastSeen) }}</b>
          </div>
          <button
            v-if="!isSubgraphMode"
            class="open-scope-btn subgraph-action"
            @click="enterSubgraph(selectedNode.id)"
          >
            查看子图谱
          </button>
          <button
            v-else
            class="open-scope-btn secondary subgraph-action"
            @click="exitSubgraph"
          >
            退出子图谱
          </button>
          <button
            v-if="articleTarget"
            class="open-scope-btn locate-action"
            @click="locateArticle"
          >
            {{ locateButtonText }}
          </button>
          <div v-if="articleTarget" class="article-hint">
            <strong>可定位资料</strong>
            <p>{{ articleTarget.fileName }}</p>
            <span v-if="articleTarget.startPos !== undefined">
              片段位置：{{ articleTarget.startPos }} - {{ articleTarget.endPos }}
            </span>
          </div>
          <button
            v-if="canOpenSelectedScope"
            class="open-scope-btn"
            @click="changeScope(selectedScopeId)"
          >
            {{ selectedScopeButtonText }}
          </button>
          <button
            v-else-if="activeScopeId !== 'all'"
            class="open-scope-btn secondary"
            @click="changeScope('all')"
          >
            返回全部图谱
          </button>

          <div v-if="selectedNode.meta?.evidence?.length" class="evidence">
            <strong>证据</strong>
            <p v-for="item in selectedNode.meta.evidence" :key="item">{{ item }}</p>
          </div>

          <div v-if="selectedLinks.length" class="link-list">
            <strong>关联关系</strong>
            <button
              v-for="link in selectedLinks"
              :key="link.id"
              class="link-item"
              @click="enterSubgraph(link.source === selectedNode.id ? link.target : link.source)"
            >
              <span>{{ link.label }}</span>
              <b>{{ link.otherLabel }}</b>
            </button>
          </div>
        </template>
        <template v-else>
          <div class="empty-panel-icon">✦</div>
          <h3>点击一个节点</h3>
          <p class="node-desc">可以查看它来自哪份资料、关联哪些知识点，以及学生在哪些地方薄弱。</p>
        </template>
      </aside>
    </div>

    <div v-else-if="!loading" class="graph-empty">
      <div class="empty-planet">✦</div>
      <h3>导入资料后会自动长出学习网络</h3>
      <p>至少需要一份资料，系统会抽取知识点并和学习画像、复习队列连接。</p>
    </div>
  </div>
</template>

<style scoped>
.graph-card {
  background: white;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  padding: 18px;
  margin-bottom: 16px;
  box-shadow: var(--xm-shadow-sm);
}

.graph-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: var(--xm-radius-pill);
  background: #e6f7d9;
  color: var(--xm-green-dark);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.graph-desc {
  color: var(--xm-text-light);
  font-size: 13px;
  margin-top: 4px;
}

.graph-status {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 5px 9px;
  border-radius: var(--xm-radius-pill);
  background: #f0f8e9;
  color: var(--xm-green-dark);
  font-size: 12px;
  font-weight: 800;
}

.graph-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.graph-stat {
  padding: 10px 12px;
  border-radius: var(--xm-radius-sm);
  background: #f7fbf3;
  border: 1px solid #e1f1d7;
}

.graph-stat b {
  display: block;
  color: var(--xm-green-dark);
  font-size: 20px;
  line-height: 1;
}

.graph-stat span {
  display: block;
  color: #8aa47b;
  font-size: 12px;
  font-weight: 800;
  margin-top: 4px;
}

.graph-stat.danger b {
  color: #ff9600;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.graph-search {
  display: flex;
  align-items: center;
  min-width: 280px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  overflow: hidden;
  background: #fff;
}

.graph-search input {
  flex: 1;
  border: none;
  outline: none;
  padding: 10px 12px;
  min-width: 0;
  font-size: 13px;
}

.graph-search button {
  border: none;
  background: var(--xm-green);
  color: white;
  font-weight: 800;
  padding: 10px 12px;
  cursor: pointer;
}

.scope-switcher {
  flex: 1;
  min-width: 260px;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px;
}

.scope-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  border: 1px solid #e1f1d7;
  background: #f7fbf3;
  color: var(--xm-green-dark);
  border-radius: var(--xm-radius-pill);
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.scope-chip b {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: var(--xm-radius-pill);
  background: white;
  color: #8aa47b;
  font-size: 11px;
}

.scope-chip.active {
  border-color: var(--xm-green);
  background: var(--xm-green);
  color: white;
}

.scope-chip.active b {
  color: var(--xm-green-dark);
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--xm-border);
  background: var(--xm-surface-soft);
  color: #525252;
  border-radius: var(--xm-radius-pill);
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.legend-item:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.legend-item.active {
  border-color: var(--xm-green);
  background: var(--xm-green);
  color: white;
}

.legend-item i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--xm-radius-pill);
}

.graph-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 12px;
  min-height: 480px;
}

.sigma-wrap {
  position: relative;
  width: 100%;
  height: 480px;
  min-height: 480px;
  border-radius: var(--xm-radius-sm);
  overflow: hidden;
  border: 1px solid var(--xm-border);
  background:
    radial-gradient(circle at 26% 22%, rgba(88, 204, 2, 0.12), transparent 30%),
    radial-gradient(circle at 76% 30%, rgba(255, 200, 0, 0.13), transparent 30%),
    linear-gradient(180deg, #ffffff, #f7fbf3);
}

.sigma-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.sigma-preparing {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  color: var(--xm-green-dark);
  font-size: 13px;
  font-weight: 900;
  background: rgba(255, 255, 255, 0.72);
  pointer-events: none;
}

.sigma-preparing span {
  max-width: 80%;
  color: #9a3412;
  font-size: 12px;
  text-align: center;
  word-break: break-word;
}

.fit-btn {
  position: absolute;
  left: 12px;
  bottom: 12px;
  border: none;
  border-radius: var(--xm-radius-pill);
  padding: 8px 12px;
  background: rgba(88, 204, 2, 0.92);
  color: white;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.subgraph-badge {
  position: absolute;
  left: 12px;
  top: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 24px);
  border: 1px solid rgba(88, 204, 2, 0.28);
  border-radius: var(--xm-radius-pill);
  padding: 7px 8px 7px 11px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--xm-green-dark);
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 8px 22px rgba(88, 204, 2, 0.12);
  backdrop-filter: blur(10px);
}

.subgraph-badge span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.subgraph-badge button {
  flex-shrink: 0;
  border: none;
  border-radius: var(--xm-radius-pill);
  padding: 4px 8px;
  background: #e6f7d9;
  color: var(--xm-green-dark);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.node-panel {
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  background: #fbfdff;
  padding: 14px;
  overflow: auto;
}

.node-type {
  display: inline-flex;
  padding: 5px 8px;
  border-radius: var(--xm-radius-pill);
  color: var(--xm-text);
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 8px;
}

.node-panel h3 {
  font-size: 18px;
  line-height: 1.25;
  margin-bottom: 8px;
}

.node-desc {
  color: var(--xm-text-light);
  font-size: 13px;
  line-height: 1.55;
  margin-bottom: 12px;
}

.node-kv {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed #e5e5e5;
  font-size: 13px;
}

.node-kv span {
  color: #8aa47b;
  font-weight: 800;
}

.node-kv b {
  color: var(--xm-text);
}

.open-scope-btn {
  width: 100%;
  margin-top: 12px;
  border: none;
  border-radius: var(--xm-radius);
  padding: 10px 12px;
  background: var(--xm-green);
  color: white;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.open-scope-btn.secondary {
  background: #e6f7d9;
  color: var(--xm-green-dark);
}

.subgraph-action {
  background: #ffc800;
  color: #5f4500;
}

.locate-action {
  background: #58cc02;
}

.article-hint {
  margin-top: 10px;
  padding: 10px;
  border-radius: var(--xm-radius);
  border: 1px solid #e1f1d7;
  background: #ffffff;
}

.article-hint strong {
  display: block;
  color: var(--xm-green-dark);
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 5px;
}

.article-hint p {
  color: var(--xm-text);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
  margin-bottom: 4px;
}

.article-hint span {
  color: #8aa47b;
  font-size: 11px;
  font-weight: 800;
}

.evidence,
.link-list {
  margin-top: 14px;
}

.evidence strong,
.link-list strong {
  display: block;
  font-size: 13px;
  margin-bottom: 8px;
}

.evidence p {
  padding: 8px;
  background: white;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  color: var(--xm-text-light);
  font-size: 12px;
  line-height: 1.45;
  margin-bottom: 6px;
}

.link-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  background: white;
  padding: 8px;
  margin-bottom: 6px;
  cursor: pointer;
}

.link-item span {
  display: block;
  color: #8aa47b;
  font-size: 11px;
  font-weight: 800;
}

.link-item b {
  display: block;
  color: var(--xm-text);
  font-size: 13px;
  margin-top: 2px;
}

.empty-panel-icon,
.empty-planet {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: linear-gradient(135deg, var(--xm-green), #89d44f);
  font-weight: 900;
  margin-bottom: 12px;
}

.graph-empty {
  min-height: 220px;
  border: 1px dashed #b9d9a2;
  border-radius: var(--xm-radius-sm);
  background: var(--xm-surface-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}

.graph-empty h3 {
  margin-bottom: 6px;
}

.graph-empty p {
  color: var(--xm-text-light);
  font-size: 13px;
}

.graph-loading {
  min-height: 220px;
  border: 1px dashed #b9d9a2;
  border-radius: var(--xm-radius-sm);
  background: #f7fbf3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--xm-green-dark);
  font-size: 14px;
  font-weight: 800;
}

.loading-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--xm-green);
  animation: pulse 1s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.graph-error {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: var(--xm-radius-sm);
  color: var(--xm-danger-text);
  background: var(--xm-danger-bg);
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 980px) {
  .graph-header,
  .graph-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .graph-legend {
    justify-content: flex-start;
  }

  .graph-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .graph-body {
    grid-template-columns: 1fr;
  }

  .node-panel {
    max-height: 320px;
  }
}
</style>
